const { query } = require('../database/connection');
const { publishEvent } = require('../services/rabbitmq');
const logger = require('../utils/logger');
const { ValidationError, NotFoundError, BusinessLogicError } = require('../middleware/errorHandler');

class PricingController {
  /**
   * Get pricing rules for supplier
   */
  static async getPricing(req, res) {
    const supplierId = req.user.id;
    let { gasType, customerType, cylinderSize, isActive = true, limit = 20, offset = 0 } = req.query;

    try {
      // Map household customer type to retail for pricing calculations
      if (customerType === 'household') {
        customerType = 'retail';
      }

      let whereClause = 'WHERE p.supplier_id = $1';
      const queryParams = [supplierId];
      let paramIndex = 2;

      // Add filters
      if (gasType) {
        whereClause += ` AND gt.name ILIKE $${paramIndex}`;
        queryParams.push(`%${gasType}%`);
        paramIndex++;
      }

      if (customerType) {
        whereClause += ` AND p.customer_type = $${paramIndex}`;
        queryParams.push(customerType);
        paramIndex++;
      }

      if (cylinderSize) {
        whereClause += ` AND p.cylinder_size = $${paramIndex}`;
        queryParams.push(cylinderSize);
        paramIndex++;
      }

      if (isActive !== undefined) {
        whereClause += ` AND p.is_active = $${paramIndex}`;
        queryParams.push(isActive === 'true');
        paramIndex++;
      }

      // Get pricing rules with gas type information
      const pricingQuery = `
        SELECT 
          p.*,
          gt.name as gas_type_name,
          gt.description as gas_type_description,
          gt.category as gas_type_category
        FROM supplier.pricing_rules p
        JOIN orders.gas_types gt ON p.gas_type_id = gt.id
        ${whereClause}
        ORDER BY p.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      queryParams.push(parseInt(limit), parseInt(offset));
      const result = await query(pricingQuery, queryParams);

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM supplier.pricing_rules p
        JOIN orders.gas_types gt ON p.gas_type_id = gt.id
        ${whereClause}
      `;

      const countResult = await query(countQuery, queryParams.slice(0, -2));
      const total = parseInt(countResult.rows[0].total);

      // Format pricing rules
      const pricing = result.rows.map(row => ({
        id: row.id,
        supplierId: row.supplier_id,
        gasType: {
          id: row.gas_type_id,
          name: row.gas_type_name,
          description: row.gas_type_description,
          category: row.gas_type_category
        },
        cylinderSize: row.cylinder_size,
        customerType: row.customer_type,
        basePrice: parseFloat(row.base_price),
        minQuantity: row.min_quantity,
        maxQuantity: row.max_quantity,
        discountPercentage: row.discount_percentage ? parseFloat(row.discount_percentage) : null,
        validFrom: row.valid_from,
        validUntil: row.valid_until,
        isActive: row.is_active,
        priority: row.priority,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));

      res.json({
        pricing,
        pagination: {
          total,
          page: Math.floor(offset / limit) + 1,
          limit: parseInt(limit),
          hasNext: offset + limit < total,
          hasPrev: offset > 0
        }
      });
    } catch (error) {
      logger.error('Failed to get pricing:', {
        error: error.message,
        supplierId
      });
      throw error;
    }
  }

  /**
   * Create pricing rule
   */
  static async createPricingRule(req, res) {
    const supplierId = req.user.id;
    const {
      gasTypeId,
      cylinderSize,
      customerType = 'retail',
      basePrice,
      minQuantity = 1,
      maxQuantity,
      discountPercentage,
      validFrom,
      validUntil,
      priority = 1
    } = req.body;

    try {
      // Verify gas type exists
      const gasTypeResult = await query(
        'SELECT id, name FROM orders.gas_types WHERE id = $1',
        [gasTypeId]
      );

      if (gasTypeResult.rows.length === 0) {
        throw new ValidationError('Invalid gas type ID');
      }

      // Check for conflicting pricing rules
      const conflictQuery = `
        SELECT id FROM supplier.pricing_rules 
        WHERE supplier_id = $1 
        AND gas_type_id = $2 
        AND cylinder_size = $3 
        AND customer_type = $4
        AND is_active = true
        AND (
          (valid_from IS NULL OR valid_from <= COALESCE($5, CURRENT_DATE))
          AND (valid_until IS NULL OR valid_until >= COALESCE($6, CURRENT_DATE))
        )
      `;

      const conflictResult = await query(conflictQuery, [
        supplierId,
        gasTypeId,
        cylinderSize,
        customerType,
        validUntil || null,
        validFrom || null
      ]);

      if (conflictResult.rows.length > 0) {
        throw new BusinessLogicError('Conflicting pricing rule already exists for this period');
      }

      // Create pricing rule
      const insertQuery = `
        INSERT INTO supplier.pricing_rules (
          supplier_id, gas_type_id, cylinder_size, customer_type,
          base_price, min_quantity, max_quantity, discount_percentage,
          valid_from, valid_until, priority, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
        RETURNING *
      `;

      const insertResult = await query(insertQuery, [
        supplierId,
        gasTypeId,
        cylinderSize,
        customerType,
        basePrice,
        minQuantity,
        maxQuantity || null,
        discountPercentage || null,
        validFrom || null,
        validUntil || null,
        priority
      ]);

      const pricingRule = insertResult.rows[0];

      // Publish pricing rule created event
      await publishEvent('supplier.events', 'pricing.rule.created', {
        eventType: 'pricing.rule.created',
        supplierId,
        pricingRuleId: pricingRule.id,
        gasTypeId,
        cylinderSize,
        customerType,
        basePrice,
        timestamp: new Date().toISOString()
      });

      logger.info('Pricing rule created', {
        pricingRuleId: pricingRule.id,
        supplierId,
        gasTypeId,
        basePrice
      });

      res.status(201).json({
        message: 'Pricing rule created successfully',
        pricingRule: {
          id: pricingRule.id,
          supplierId: pricingRule.supplier_id,
          gasType: {
            id: gasTypeId,
            name: gasTypeResult.rows[0].name
          },
          cylinderSize: pricingRule.cylinder_size,
          customerType: pricingRule.customer_type,
          basePrice: parseFloat(pricingRule.base_price),
          minQuantity: pricingRule.min_quantity,
          maxQuantity: pricingRule.max_quantity,
          discountPercentage: pricingRule.discount_percentage ? parseFloat(pricingRule.discount_percentage) : null,
          validFrom: pricingRule.valid_from,
          validUntil: pricingRule.valid_until,
          priority: pricingRule.priority,
          isActive: pricingRule.is_active,
          createdAt: pricingRule.created_at,
          updatedAt: pricingRule.updated_at
        }
      });
    } catch (error) {
      logger.error('Failed to create pricing rule:', {
        error: error.message,
        supplierId,
        gasTypeId
      });
      throw error;
    }
  }

  /**
   * Update pricing rule
   */
  static async updatePricingRule(req, res) {
    const { id } = req.params;
    const supplierId = req.user.id;
    const {
      basePrice,
      minQuantity,
      maxQuantity,
      discountPercentage,
      validFrom,
      validUntil,
      priority,
      isActive
    } = req.body;

    try {
      // Check if pricing rule exists and belongs to supplier
      const existingResult = await query(
        'SELECT * FROM supplier.pricing_rules WHERE id = $1 AND supplier_id = $2',
        [id, supplierId]
      );

      if (existingResult.rows.length === 0) {
        throw new NotFoundError('Pricing rule not found');
      }

      const currentRule = existingResult.rows[0];

      // Build update query dynamically
      const updates = [];
      const values = [];
      let paramIndex = 1;

      if (basePrice !== undefined) {
        updates.push(`base_price = $${paramIndex}`);
        values.push(basePrice);
        paramIndex++;
      }

      if (minQuantity !== undefined) {
        updates.push(`min_quantity = $${paramIndex}`);
        values.push(minQuantity);
        paramIndex++;
      }

      if (maxQuantity !== undefined) {
        updates.push(`max_quantity = $${paramIndex}`);
        values.push(maxQuantity || null);
        paramIndex++;
      }

      if (discountPercentage !== undefined) {
        updates.push(`discount_percentage = $${paramIndex}`);
        values.push(discountPercentage || null);
        paramIndex++;
      }

      if (validFrom !== undefined) {
        updates.push(`valid_from = $${paramIndex}`);
        values.push(validFrom || null);
        paramIndex++;
      }

      if (validUntil !== undefined) {
        updates.push(`valid_until = $${paramIndex}`);
        values.push(validUntil || null);
        paramIndex++;
      }

      if (priority !== undefined) {
        updates.push(`priority = $${paramIndex}`);
        values.push(priority);
        paramIndex++;
      }

      if (isActive !== undefined) {
        updates.push(`is_active = $${paramIndex}`);
        values.push(isActive);
        paramIndex++;
      }

      if (updates.length === 0) {
        throw new ValidationError('No valid fields to update');
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id, supplierId);

      const updateQuery = `
        UPDATE supplier.pricing_rules 
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex} AND supplier_id = $${paramIndex + 1}
        RETURNING *
      `;

      const updateResult = await query(updateQuery, values);
      const updatedRule = updateResult.rows[0];

      // Get gas type information
      const gasTypeResult = await query(
        'SELECT name FROM orders.gas_types WHERE id = $1',
        [updatedRule.gas_type_id]
      );

      // Publish pricing rule updated event
      await publishEvent('supplier.events', 'pricing.rule.updated', {
        eventType: 'pricing.rule.updated',
        supplierId,
        pricingRuleId: id,
        changes: { basePrice, minQuantity, maxQuantity, discountPercentage, validFrom, validUntil, priority, isActive },
        timestamp: new Date().toISOString()
      });

      logger.info('Pricing rule updated', {
        pricingRuleId: id,
        supplierId,
        changes: updates
      });

      res.json({
        message: 'Pricing rule updated successfully',
        pricingRule: {
          id: updatedRule.id,
          supplierId: updatedRule.supplier_id,
          gasType: {
            id: updatedRule.gas_type_id,
            name: gasTypeResult.rows[0]?.name
          },
          cylinderSize: updatedRule.cylinder_size,
          customerType: updatedRule.customer_type,
          basePrice: parseFloat(updatedRule.base_price),
          minQuantity: updatedRule.min_quantity,
          maxQuantity: updatedRule.max_quantity,
          discountPercentage: updatedRule.discount_percentage ? parseFloat(updatedRule.discount_percentage) : null,
          validFrom: updatedRule.valid_from,
          validUntil: updatedRule.valid_until,
          priority: updatedRule.priority,
          isActive: updatedRule.is_active,
          createdAt: updatedRule.created_at,
          updatedAt: updatedRule.updated_at
        }
      });
    } catch (error) {
      logger.error('Failed to update pricing rule:', {
        error: error.message,
        pricingRuleId: id,
        supplierId
      });
      throw error;
    }
  }

  /**
   * Delete pricing rule
   */
  static async deletePricingRule(req, res) {
    const { id } = req.params;
    const supplierId = req.user.id;

    try {
      // Check if pricing rule exists and belongs to supplier
      const existingResult = await query(
        'SELECT * FROM supplier.pricing_rules WHERE id = $1 AND supplier_id = $2',
        [id, supplierId]
      );

      if (existingResult.rows.length === 0) {
        throw new NotFoundError('Pricing rule not found');
      }

      // Soft delete by setting is_active to false
      await query(
        'UPDATE supplier.pricing_rules SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [id]
      );

      // Publish pricing rule deleted event
      await publishEvent('supplier.events', 'pricing.rule.deleted', {
        eventType: 'pricing.rule.deleted',
        supplierId,
        pricingRuleId: id,
        timestamp: new Date().toISOString()
      });

      logger.info('Pricing rule deleted', {
        pricingRuleId: id,
        supplierId
      });

      res.json({
        message: 'Pricing rule deleted successfully'
      });
    } catch (error) {
      logger.error('Failed to delete pricing rule:', {
        error: error.message,
        pricingRuleId: id,
        supplierId
      });
      throw error;
    }
  }

  /**
   * Calculate price for specific order items
   */
  static async calculatePrice(req, res) {
    const supplierId = req.user.id;
    let { items, customerType = 'retail' } = req.body;

    try {
      if (!Array.isArray(items) || items.length === 0) {
        throw new ValidationError('Items array is required');
      }

      // Map household customer type to retail for pricing calculations
      if (customerType === 'household') {
        customerType = 'retail';
      }

      const calculations = [];
      let totalAmount = 0;

      for (const item of items) {
        const { gasTypeId, cylinderSize, quantity } = item;

        if (!gasTypeId || !cylinderSize || !quantity) {
          throw new ValidationError('Each item must have gasTypeId, cylinderSize, and quantity');
        }

        // Find applicable pricing rule
        const pricingQuery = `
          SELECT pr.*, gt.name as gas_type_name
          FROM supplier.pricing_rules pr
          JOIN supplier.gas_types gt ON pr.gas_type_id = gt.id
          WHERE pr.supplier_id = $1
          AND pr.gas_type_id = $2
          AND pr.cylinder_size = $3
          AND pr.customer_type = $4
          AND pr.is_active = true
          AND (pr.valid_from IS NULL OR pr.valid_from <= CURRENT_DATE)
          AND (pr.valid_until IS NULL OR pr.valid_until >= CURRENT_DATE)
          AND (pr.min_quantity IS NULL OR pr.min_quantity <= $5)
          AND (pr.max_quantity IS NULL OR pr.max_quantity >= $5)
          ORDER BY pr.priority DESC, pr.created_at DESC
          LIMIT 1
        `;

        const pricingResult = await query(pricingQuery, [
          supplierId,
          gasTypeId,
          cylinderSize,
          customerType,
          quantity
        ]);

        let unitPrice = 0;
        let discountAmount = 0;
        let pricingRuleId = null;

        if (pricingResult.rows.length > 0) {
          const rule = pricingResult.rows[0];
          unitPrice = parseFloat(rule.base_price);
          pricingRuleId = rule.id;

          // Apply discount if applicable
          if (rule.discount_percentage) {
            discountAmount = (unitPrice * parseFloat(rule.discount_percentage)) / 100;
            unitPrice = unitPrice - discountAmount;
          }
        } else {
          // No pricing rule found - use default pricing or throw error
          throw new BusinessLogicError(`No pricing rule found for ${gasTypeId} - ${cylinderSize} - ${customerType}`);
        }

        const itemTotal = unitPrice * quantity;
        totalAmount += itemTotal;

        calculations.push({
          gasTypeId,
          cylinderSize,
          quantity,
          unitPrice,
          discountAmount,
          itemTotal,
          pricingRuleId
        });
      }

      res.json({
        message: 'Price calculation completed',
        calculation: {
          supplierId,
          customerType,
          items: calculations,
          totalAmount,
          currency: 'NGN',
          calculatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Failed to calculate price:', {
        error: error.message,
        supplierId,
        itemCount: items?.length
      });
      throw error;
    }
  }

  /**
   * Get bulk pricing options
   */
  static async getBulkPricing(req, res) {
    const supplierId = req.user.id;
    let { gasTypeId, cylinderSize, customerType = 'wholesale' } = req.query;

    try {
      if (!gasTypeId || !cylinderSize) {
        throw new ValidationError('gasTypeId and cylinderSize are required');
      }

      // Map household customer type to retail for pricing calculations
      if (customerType === 'household') {
        customerType = 'retail';
      }

      // Get all bulk pricing tiers for this item
      const bulkQuery = `
        SELECT pr.*, gt.name as gas_type_name
        FROM supplier.pricing_rules pr
        JOIN supplier.gas_types gt ON pr.gas_type_id = gt.id
        WHERE pr.supplier_id = $1
        AND pr.gas_type_id = $2
        AND pr.cylinder_size = $3
        AND pr.customer_type = $4
        AND pr.is_active = true
        AND (pr.valid_from IS NULL OR pr.valid_from <= CURRENT_DATE)
        AND (pr.valid_until IS NULL OR pr.valid_until >= CURRENT_DATE)
        ORDER BY pr.min_quantity ASC
      `;

      const result = await query(bulkQuery, [
        supplierId,
        gasTypeId,
        cylinderSize,
        customerType
      ]);

      const bulkTiers = result.rows.map(row => ({
        id: row.id,
        minQuantity: row.min_quantity,
        maxQuantity: row.max_quantity,
        basePrice: parseFloat(row.base_price),
        discountPercentage: row.discount_percentage ? parseFloat(row.discount_percentage) : 0,
        finalPrice: row.discount_percentage
          ? parseFloat(row.base_price) * (1 - parseFloat(row.discount_percentage) / 100)
          : parseFloat(row.base_price),
        validFrom: row.valid_from,
        validUntil: row.valid_until
      }));

      res.json({
        gasTypeId,
        cylinderSize,
        customerType,
        bulkTiers,
        currency: 'NGN'
      });
    } catch (error) {
      logger.error('Failed to get bulk pricing:', {
        error: error.message,
        supplierId,
        gasTypeId,
        cylinderSize
      });
      throw error;
    }
  }
}

module.exports = PricingController;
