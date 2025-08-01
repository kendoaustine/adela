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
        'SELECT id, name FROM orders.gas_types WHERE id = $1',
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
        JOIN orders.gas_types gt ON i.gas_type_id = gt.id
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
}

module.exports = InventoryController;
