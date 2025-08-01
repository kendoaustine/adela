const { query, transaction } = require('../database/connection');
const logger = require('../utils/logger');
const { ValidationError, NotFoundError, AuthorizationError } = require('../middleware/errorHandler');
const { v4: uuidv4 } = require('uuid');
const { publishEvent } = require('../services/rabbitmq');

class InventoryController {
  /**
   * Get supplier inventory
   */
  static async getInventory(req, res) {
    try {
      const supplierId = req.user.id;
      const { gasType, lowStock, limit = 20, offset = 0 } = req.query;

      // Validate pagination parameters
      const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
      const offsetNum = Math.max(parseInt(offset, 10) || 0, 0);

      // Build query with filters
      let whereClause = 'WHERE i.supplier_id = $1';
      let queryParams = [supplierId];
      let paramIndex = 2;

      if (gasType) {
        whereClause += ` AND gt.name ILIKE $${paramIndex}`;
        queryParams.push(`%${gasType}%`);
        paramIndex++;
      }

      if (lowStock === 'true') {
        whereClause += ` AND i.quantity_available <= i.reorder_level`;
      }

      // Get inventory with gas type information
      const inventoryQuery = `
        SELECT
          i.*,
          gt.name as gas_type_name,
          gt.description as gas_type_description,
          gt.category as gas_type_category
        FROM supplier.inventory i
        JOIN orders.gas_types gt ON i.gas_type_id = gt.id
        ${whereClause}
        ORDER BY i.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      queryParams.push(limitNum, offsetNum);

      const result = await query(inventoryQuery, queryParams);

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM supplier.inventory i
        JOIN orders.gas_types gt ON i.gas_type_id = gt.id
        ${whereClause}
      `;

      const countResult = await query(countQuery, queryParams.slice(0, -2));

      const inventory = result.rows.map(item => ({
        id: item.id,
        supplierId: item.supplier_id,
        gasType: {
          id: item.gas_type_id,
          name: item.gas_type_name,
          description: item.gas_type_description,
          category: item.gas_type_category
        },
        cylinderSize: item.cylinder_size,
        quantityAvailable: item.quantity_available,
        reorderLevel: item.reorder_level,
        unitCost: parseFloat(item.unit_cost),
        isLowStock: item.quantity_available <= item.reorder_level,
        lastRestocked: item.last_restocked,
        createdAt: item.created_at,
        updatedAt: item.updated_at
      }));

      const total = parseInt(countResult.rows[0].total, 10);

      logger.info('Inventory retrieved', {
        supplierId,
        count: inventory.length,
        total,
        filters: { gasType, lowStock },
        requestId: req.requestId
      });

      res.json({
        inventory,
        pagination: {
          total,
          page: Math.floor(offsetNum / limitNum) + 1,
          limit: limitNum,
          hasNext: offsetNum + limitNum < total,
          hasPrev: offsetNum > 0
        },
        summary: {
          totalItems: total,
          lowStockItems: inventory.filter(item => item.isLowStock).length
        }
      });
    } catch (error) {
      logger.error('Failed to get inventory:', {
        error: error.message,
        supplierId: req.user.id,
        requestId: req.requestId
      });
      throw error;
    }
  }

  /**
   * Add inventory item
   */
  static async addInventoryItem(req, res) {
    try {
      const supplierId = req.user.id;
      const { gasTypeId, cylinderSize, quantityAvailable, reorderLevel, unitCost } = req.body;

      // Verify gas type exists
      const gasTypeResult = await query(
        'SELECT id, name FROM supplier.gas_types WHERE id = $1',
        [gasTypeId]
      );

      if (gasTypeResult.rows.length === 0) {
        throw new ValidationError('Invalid gas type ID');
      }

      // Check if inventory item already exists for this supplier/gas type/cylinder size
      const existingItem = await query(
        'SELECT id FROM supplier.inventory WHERE supplier_id = $1 AND gas_type_id = $2 AND cylinder_size = $3',
        [supplierId, gasTypeId, cylinderSize]
      );

      if (existingItem.rows.length > 0) {
        throw new ValidationError('Inventory item already exists for this gas type and cylinder size');
      }

      // Create inventory item
      const inventoryId = uuidv4();
      const result = await query(
        `INSERT INTO supplier.inventory (
          id, supplier_id, gas_type_id, cylinder_size, 
          quantity_available, reorder_level, unit_cost
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [inventoryId, supplierId, gasTypeId, cylinderSize, quantityAvailable, reorderLevel, unitCost]
      );

      const inventoryItem = result.rows[0];
      const gasType = gasTypeResult.rows[0];

      // Format response
      const inventoryData = {
        id: inventoryItem.id,
        supplierId: inventoryItem.supplier_id,
        gasType: {
          id: gasTypeId,
          name: gasType.name
        },
        cylinderSize: inventoryItem.cylinder_size,
        quantityAvailable: inventoryItem.quantity_available,
        reorderLevel: inventoryItem.reorder_level,
        unitCost: parseFloat(inventoryItem.unit_cost),
        isLowStock: inventoryItem.quantity_available <= inventoryItem.reorder_level,
        createdAt: inventoryItem.created_at,
        updatedAt: inventoryItem.updated_at
      };

      // Publish inventory added event
      await publishEvent('supplier.events', 'inventory.added', {
        eventType: 'inventory.added',
        supplierId,
        inventoryId,
        gasTypeId,
        cylinderSize,
        quantityAvailable,
        timestamp: new Date().toISOString()
      });

      logger.info('Inventory item added', {
        supplierId,
        inventoryId,
        gasTypeId,
        cylinderSize,
        quantityAvailable,
        requestId: req.requestId
      });

      res.status(201).json({
        message: 'Inventory item added successfully',
        inventory: inventoryData
      });
    } catch (error) {
      logger.error('Failed to add inventory item:', {
        error: error.message,
        supplierId: req.user.id,
        requestId: req.requestId
      });
      throw error;
    }
  }

  /**
   * Update inventory item
   */
  static async updateInventoryItem(req, res) {
    try {
      const supplierId = req.user.id;
      const { id } = req.params;
      const { quantityAvailable, reorderLevel, unitCost } = req.body;

      // Verify inventory item exists and belongs to supplier
      const existingItem = await query(
        'SELECT * FROM supplier.inventory WHERE id = $1 AND supplier_id = $2',
        [id, supplierId]
      );

      if (existingItem.rows.length === 0) {
        throw new NotFoundError('Inventory item not found');
      }

      const currentItem = existingItem.rows[0];

      // Build update query dynamically
      const updates = [];
      const values = [id, supplierId];
      let paramIndex = 3;

      if (quantityAvailable !== undefined) {
        updates.push(`quantity_available = $${paramIndex}`);
        values.push(quantityAvailable);
        paramIndex++;
      }

      if (reorderLevel !== undefined) {
        updates.push(`reorder_level = $${paramIndex}`);
        values.push(reorderLevel);
        paramIndex++;
      }

      if (unitCost !== undefined) {
        updates.push(`unit_cost = $${paramIndex}`);
        values.push(unitCost);
        paramIndex++;
      }

      if (updates.length === 0) {
        throw new ValidationError('At least one field must be updated');
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);

      const updateQuery = `
        UPDATE supplier.inventory 
        SET ${updates.join(', ')}
        WHERE id = $1 AND supplier_id = $2
        RETURNING *
      `;

      const result = await query(updateQuery, values);
      const updatedItem = result.rows[0];

      // Get gas type information
      const gasTypeResult = await query(
        'SELECT name FROM orders.gas_types WHERE id = $1',
        [updatedItem.gas_type_id]
      );

      // Format response
      const inventoryData = {
        id: updatedItem.id,
        supplierId: updatedItem.supplier_id,
        gasType: {
          id: updatedItem.gas_type_id,
          name: gasTypeResult.rows[0].name
        },
        cylinderSize: updatedItem.cylinder_size,
        quantityAvailable: updatedItem.quantity_available,
        reorderLevel: updatedItem.reorder_level,
        unitCost: parseFloat(updatedItem.unit_cost),
        isLowStock: updatedItem.quantity_available <= updatedItem.reorder_level,
        lastRestocked: updatedItem.last_restocked,
        createdAt: updatedItem.created_at,
        updatedAt: updatedItem.updated_at
      };

      // Publish inventory updated event
      await publishEvent('supplier.events', 'inventory.updated', {
        eventType: 'inventory.updated',
        supplierId,
        inventoryId: id,
        changes: { quantityAvailable, reorderLevel, unitCost },
        previousQuantity: currentItem.quantity_available,
        newQuantity: updatedItem.quantity_available,
        timestamp: new Date().toISOString()
      });

      logger.info('Inventory item updated', {
        supplierId,
        inventoryId: id,
        changes: { quantityAvailable, reorderLevel, unitCost },
        requestId: req.requestId
      });

      res.json({
        message: 'Inventory item updated successfully',
        inventory: inventoryData
      });
    } catch (error) {
      logger.error('Failed to update inventory item:', {
        error: error.message,
        supplierId: req.user.id,
        inventoryId: req.params.id,
        requestId: req.requestId
      });
      throw error;
    }
  }

  /**
   * Get low stock items
   */
  static async getLowStockItems(req, res) {
    try {
      const supplierId = req.user.id;

      const result = await query(
        `SELECT
          i.*,
          gt.name as gas_type_name,
          gt.description as gas_type_description
        FROM supplier.inventory i
        JOIN supplier.gas_types gt ON i.gas_type_id = gt.id
        WHERE i.supplier_id = $1 AND i.quantity_available <= i.reorder_level
        ORDER BY (i.quantity_available::float / i.reorder_level::float) ASC`,
        [supplierId]
      );

      const lowStockItems = result.rows.map(item => ({
        id: item.id,
        gasType: {
          id: item.gas_type_id,
          name: item.gas_type_name,
          description: item.gas_type_description
        },
        cylinderSize: item.cylinder_size,
        quantityAvailable: item.quantity_available,
        reorderLevel: item.reorder_level,
        stockRatio: item.quantity_available / item.reorder_level,
        urgency: item.quantity_available === 0 ? 'critical' : 
                item.quantity_available <= item.reorder_level * 0.5 ? 'high' : 'medium',
        lastRestocked: item.last_restocked,
        createdAt: item.created_at
      }));

      logger.info('Low stock items retrieved', {
        supplierId,
        count: lowStockItems.length,
        criticalItems: lowStockItems.filter(item => item.urgency === 'critical').length,
        requestId: req.requestId
      });

      res.json({
        lowStockItems,
        summary: {
          totalLowStock: lowStockItems.length,
          criticalItems: lowStockItems.filter(item => item.urgency === 'critical').length,
          highUrgency: lowStockItems.filter(item => item.urgency === 'high').length,
          mediumUrgency: lowStockItems.filter(item => item.urgency === 'medium').length
        }
      });
    } catch (error) {
      logger.error('Failed to get low stock items:', {
        error: error.message,
        supplierId: req.user.id,
        requestId: req.requestId
      });
      throw error;
    }
  }

  /**
   * Restock inventory item
   */
  static async restockInventory(req, res) {
    try {
      const { id } = req.params;
      const { quantity, notes, unitCost } = req.body;
      const supplierId = req.user.id;

      // Get current inventory item
      const inventoryResult = await query(
        'SELECT * FROM supplier.inventory WHERE id = $1 AND supplier_id = $2',
        [id, supplierId]
      );

      if (inventoryResult.rows.length === 0) {
        throw new NotFoundError('Inventory item not found');
      }

      const inventory = inventoryResult.rows[0];
      const oldQuantity = inventory.quantity_available;
      const newQuantity = oldQuantity + quantity;

      // Start transaction
      await query('BEGIN');

      try {
        // Update inventory quantity and optionally unit cost
        const updateFields = ['quantity_available = $1', 'last_restocked_at = CURRENT_TIMESTAMP', 'updated_at = CURRENT_TIMESTAMP'];
        const updateParams = [newQuantity];
        let paramIndex = 2;

        if (unitCost !== undefined) {
          updateFields.push(`unit_cost = $${paramIndex}`);
          updateParams.push(unitCost);
          paramIndex++;
        }

        updateParams.push(id);

        await query(`
          UPDATE supplier.inventory
          SET ${updateFields.join(', ')}
          WHERE id = $${paramIndex}
        `, updateParams);

        // Log inventory transaction
        await query(`
          INSERT INTO supplier.inventory_transactions (
            supplier_id, inventory_id, transaction_type, quantity_change,
            quantity_before, quantity_after, notes, created_by
          ) VALUES ($1, $2, 'restock', $3, $4, $5, $6, $7)
        `, [supplierId, id, quantity, oldQuantity, newQuantity, notes, supplierId]);

        await query('COMMIT');

        // Get updated inventory with gas type info
        const updatedResult = await query(`
          SELECT i.*, gt.name as gas_type_name, gt.description as gas_type_description
          FROM supplier.inventory i
          JOIN supplier.gas_types gt ON i.gas_type_id = gt.id
          WHERE i.id = $1
        `, [id]);

        const updatedInventory = updatedResult.rows[0];

        // Publish restock event
        await publishEvent('supplier.events', 'inventory.restocked', {
          eventType: 'inventory.restocked',
          supplierId,
          inventoryId: id,
          gasTypeId: inventory.gas_type_id,
          cylinderSize: inventory.cylinder_size,
          quantityAdded: quantity,
          oldQuantity,
          newQuantity,
          unitCost: unitCost || inventory.unit_cost,
          notes,
          timestamp: new Date().toISOString()
        });

        logger.info('Inventory restocked', {
          supplierId,
          inventoryId: id,
          quantityAdded: quantity,
          oldQuantity,
          newQuantity,
          notes
        });

        res.json({
          message: 'Inventory restocked successfully',
          inventory: {
            id: updatedInventory.id,
            gasType: {
              id: updatedInventory.gas_type_id,
              name: updatedInventory.gas_type_name,
              description: updatedInventory.gas_type_description
            },
            cylinderSize: updatedInventory.cylinder_size,
            quantityAvailable: updatedInventory.quantity_available,
            quantityAdded: quantity,
            unitCost: parseFloat(updatedInventory.unit_cost),
            lastRestocked: updatedInventory.last_restocked_at,
            isLowStock: updatedInventory.quantity_available <= updatedInventory.reorder_level
          }
        });

      } catch (error) {
        await query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error('Failed to restock inventory:', {
        error: error.message,
        inventoryId: req.params.id,
        supplierId: req.user.id,
        quantity: req.body.quantity
      });
      throw error;
    }
  }

  /**
   * Get available suppliers for specific inventory requirements
   */
  static async getAvailableSuppliers(req, res) {
    try {
      const { gasTypeId, cylinderSize, minQuantity, latitude, longitude, maxDistance = 50 } = req.query;

      // Query suppliers with available inventory
      const suppliersResult = await query(`
        SELECT
          u.id as supplier_id,
          p.business_name as supplier_name,
          sp.business_address,
          sp.service_areas,
          i.id as inventory_id,
          i.quantity_available,
          i.unit_cost,
          pr.unit_price,
          pr.bulk_discount_percentage,
          pr.bulk_discount_threshold,
          -- Calculate distance (simplified - in production use PostGIS)
          CASE
            WHEN sp.business_address ILIKE '%Lagos%' AND $6 ILIKE '%Lagos%' THEN 5
            WHEN sp.business_address ILIKE '%Abuja%' AND $6 ILIKE '%Abuja%' THEN 5
            WHEN sp.business_address ILIKE '%Port Harcourt%' AND $6 ILIKE '%Port Harcourt%' THEN 5
            ELSE 25
          END as distance_km,
          -- Calculate supplier rating (mock for now - in production, calculate from reviews)
          CASE
            WHEN sp.is_verified = true THEN 4.5
            ELSE 3.5
          END as rating
        FROM auth.users u
        JOIN auth.profiles p ON u.id = p.user_id
        JOIN auth.supplier_profiles sp ON u.id = sp.user_id
        JOIN supplier.inventory i ON u.id = i.supplier_id
        LEFT JOIN supplier.pricing pr ON (
          u.id = pr.supplier_id
          AND i.gas_type_id = pr.gas_type_id
          AND i.cylinder_size = pr.cylinder_size
          AND pr.customer_type = 'retail'
          AND pr.is_active = true
          AND (pr.effective_from IS NULL OR pr.effective_from <= CURRENT_DATE)
          AND (pr.effective_until IS NULL OR pr.effective_until >= CURRENT_DATE)
        )
        WHERE u.role = 'supplier'
        AND u.is_active = true
        AND sp.is_verified = true
        AND i.gas_type_id = $1
        AND i.cylinder_size = $2
        AND i.quantity_available >= $3
        AND (
          sp.service_areas IS NULL
          OR $4 = ANY(sp.service_areas)
          OR $5 = ANY(sp.service_areas)
        )
        ORDER BY distance_km ASC, rating DESC, pr.unit_price ASC NULLS LAST
        LIMIT 20
      `, [
        gasTypeId,
        cylinderSize,
        minQuantity,
        req.query.city || 'Lagos', // Default to Lagos if no city provided
        req.query.state || 'Lagos State', // Default to Lagos State
        req.query.city || 'Lagos'
      ]);

      // Calculate price rankings
      const suppliers = suppliersResult.rows.map((row, index) => ({
        supplierId: row.supplier_id,
        supplierName: row.supplier_name,
        inventoryId: row.inventory_id,
        quantityAvailable: row.quantity_available,
        unitCost: parseFloat(row.unit_cost),
        unitPrice: row.unit_price ? parseFloat(row.unit_price) : parseFloat(row.unit_cost) * 1.3, // 30% markup if no pricing rule
        bulkDiscountThreshold: row.bulk_discount_threshold,
        bulkDiscountPercentage: row.bulk_discount_percentage ? parseFloat(row.bulk_discount_percentage) : 0,
        distance: row.distance_km,
        rating: parseFloat(row.rating),
        businessAddress: row.business_address,
        serviceAreas: row.service_areas,
        priceRank: index + 1 // Simple ranking based on query order
      }));

      logger.info('Available suppliers retrieved', {
        gasTypeId,
        cylinderSize,
        minQuantity,
        suppliersFound: suppliers.length
      });

      res.json({
        message: 'Available suppliers retrieved successfully',
        suppliers,
        searchCriteria: {
          gasTypeId,
          cylinderSize,
          minQuantity: parseInt(minQuantity),
          maxDistance: parseInt(maxDistance)
        },
        totalFound: suppliers.length
      });
    } catch (error) {
      logger.error('Failed to get available suppliers:', {
        error: error.message,
        gasTypeId: req.query.gasTypeId,
        cylinderSize: req.query.cylinderSize,
        minQuantity: req.query.minQuantity
      });
      throw error;
    }
  }

  /**
   * Reserve inventory for an order (transaction-safe)
   */
  static async reserveInventory(req, res) {
    try {
      const { orderId, items, reservationDuration = 30 } = req.body; // 30 minutes default
      const userId = req.user.id;

      if (!Array.isArray(items) || items.length === 0) {
        throw new ValidationError('Items array is required');
      }

      const reservations = [];

      // Start transaction
      await query('BEGIN');

      try {
        for (const item of items) {
          const { supplierId, gasTypeId, cylinderSize, quantity } = item;

          // Check inventory availability with row-level locking
          const inventoryResult = await query(`
            SELECT id, quantity_available, quantity_reserved
            FROM supplier.inventory
            WHERE supplier_id = $1 AND gas_type_id = $2 AND cylinder_size = $3
            FOR UPDATE
          `, [supplierId, gasTypeId, cylinderSize]);

          if (inventoryResult.rows.length === 0) {
            throw new ValidationError(`No inventory found for supplier ${supplierId}, gas type ${gasTypeId}, size ${cylinderSize}`);
          }

          const inventory = inventoryResult.rows[0];
          const availableQuantity = inventory.quantity_available - inventory.quantity_reserved;

          if (availableQuantity < quantity) {
            throw new ValidationError(`Insufficient inventory. Available: ${availableQuantity}, Requested: ${quantity}`);
          }

          // Update reserved quantity
          await query(`
            UPDATE supplier.inventory
            SET quantity_reserved = quantity_reserved + $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [quantity, inventory.id]);

          // Create reservation record
          const reservationId = uuidv4();
          await query(`
            INSERT INTO supplier.inventory_reservations (
              id, inventory_id, order_id, quantity, reserved_by, expires_at
            ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP + INTERVAL '${reservationDuration} minutes')
          `, [reservationId, inventory.id, orderId, quantity, userId]);

          reservations.push({
            reservationId,
            inventoryId: inventory.id,
            supplierId,
            gasTypeId,
            cylinderSize,
            quantity,
            expiresAt: new Date(Date.now() + reservationDuration * 60 * 1000).toISOString()
          });

          // Log inventory transaction
          await query(`
            INSERT INTO supplier.inventory_transactions (
              supplier_id, inventory_id, transaction_type, quantity_change,
              quantity_before, quantity_after, reference_id, reference_type, created_by
            ) VALUES ($1, $2, 'reservation', $3, $4, $5, $6, 'order', $7)
          `, [
            supplierId,
            inventory.id,
            -quantity,
            availableQuantity,
            availableQuantity - quantity,
            orderId,
            userId
          ]);
        }

        await query('COMMIT');

        // Publish reservation event
        await publishEvent('supplier.events', 'inventory.reserved', {
          eventType: 'inventory.reserved',
          orderId,
          reservations,
          reservedBy: userId,
          timestamp: new Date().toISOString()
        });

        logger.info('Inventory reserved successfully', {
          orderId,
          reservationCount: reservations.length,
          reservedBy: userId
        });

        res.json({
          message: 'Inventory reserved successfully',
          orderId,
          reservations,
          expiresIn: `${reservationDuration} minutes`
        });

      } catch (error) {
        await query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error('Failed to reserve inventory:', {
        error: error.message,
        orderId: req.body.orderId,
        userId: req.user.id
      });
      throw error;
    }
  }

  /**
   * Release inventory reservation
   */
  static async releaseReservation(req, res) {
    try {
      const { reservationId } = req.params;
      const { reason } = req.body;
      const userId = req.user.id;

      // Start transaction
      await query('BEGIN');

      try {
        // Get reservation details
        const reservationResult = await query(`
          SELECT r.*, i.supplier_id, i.gas_type_id, i.cylinder_size
          FROM supplier.inventory_reservations r
          JOIN supplier.inventory i ON r.inventory_id = i.id
          WHERE r.id = $1 AND r.status = 'active'
          FOR UPDATE
        `, [reservationId]);

        if (reservationResult.rows.length === 0) {
          throw new NotFoundError('Active reservation not found');
        }

        const reservation = reservationResult.rows[0];

        // Update inventory - release reserved quantity
        await query(`
          UPDATE supplier.inventory
          SET quantity_reserved = quantity_reserved - $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [reservation.quantity, reservation.inventory_id]);

        // Mark reservation as released
        await query(`
          UPDATE supplier.inventory_reservations
          SET status = 'released', released_at = CURRENT_TIMESTAMP, release_reason = $1
          WHERE id = $2
        `, [reason || 'Manual release', reservationId]);

        // Log inventory transaction
        await query(`
          INSERT INTO supplier.inventory_transactions (
            supplier_id, inventory_id, transaction_type, quantity_change,
            quantity_before, quantity_after, reference_id, reference_type, created_by
          ) VALUES ($1, $2, 'release', $3, $4, $5, $6, 'reservation', $7)
        `, [
          reservation.supplier_id,
          reservation.inventory_id,
          reservation.quantity,
          0, // We don't track before/after for releases
          reservation.quantity,
          reservationId,
          userId
        ]);

        await query('COMMIT');

        // Publish release event
        await publishEvent('supplier.events', 'inventory.released', {
          eventType: 'inventory.released',
          reservationId,
          orderId: reservation.order_id,
          quantity: reservation.quantity,
          reason,
          releasedBy: userId,
          timestamp: new Date().toISOString()
        });

        logger.info('Inventory reservation released', {
          reservationId,
          orderId: reservation.order_id,
          quantity: reservation.quantity,
          reason,
          releasedBy: userId
        });

        res.json({
          message: 'Inventory reservation released successfully',
          reservationId,
          orderId: reservation.order_id,
          quantityReleased: reservation.quantity
        });

      } catch (error) {
        await query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error('Failed to release reservation:', {
        error: error.message,
        reservationId: req.params.reservationId,
        userId: req.user.id
      });
      throw error;
    }
  }
}

module.exports = InventoryController;
