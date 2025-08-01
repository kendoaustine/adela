const { query } = require('../database/connection');
const { publishEvent } = require('../services/rabbitmq');
const logger = require('../utils/logger');
const { ValidationError, NotFoundError, BusinessLogicError } = require('../middleware/errorHandler');

class BundleController {
  /**
   * Get promotional bundles for supplier
   */
  static async getBundles(req, res) {
    const supplierId = req.user.id;
    const { 
      bundleType, 
      targetAudience, 
      isActive = true, 
      limit = 20, 
      offset = 0 
    } = req.query;

    try {
      let whereClause = 'WHERE pb.supplier_id = $1';
      const queryParams = [supplierId];
      let paramIndex = 2;

      // Add filters
      if (bundleType) {
        whereClause += ` AND pb.bundle_type = $${paramIndex}`;
        queryParams.push(bundleType);
        paramIndex++;
      }

      if (targetAudience) {
        whereClause += ` AND pb.target_audience = $${paramIndex}`;
        queryParams.push(targetAudience);
        paramIndex++;
      }

      if (isActive !== undefined) {
        whereClause += ` AND pb.is_active = $${paramIndex}`;
        queryParams.push(isActive === 'true');
        paramIndex++;
      }

      // Get bundles with items
      const bundlesQuery = `
        SELECT 
          pb.*,
          COALESCE(
            json_agg(
              json_build_object(
                'id', bi.id,
                'gasTypeId', bi.gas_type_id,
                'gasTypeName', gt.name,
                'cylinderSize', bi.cylinder_size,
                'requiredQuantity', bi.required_quantity,
                'freeQuantity', bi.free_quantity
              )
            ) FILTER (WHERE bi.id IS NOT NULL), 
            '[]'
          ) as items
        FROM bundles.promotional_bundles pb
        LEFT JOIN bundles.bundle_items bi ON pb.id = bi.bundle_id
        LEFT JOIN orders.gas_types gt ON bi.gas_type_id = gt.id
        ${whereClause}
        GROUP BY pb.id
        ORDER BY pb.priority DESC, pb.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      queryParams.push(parseInt(limit), parseInt(offset));
      const result = await query(bundlesQuery, queryParams);

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM bundles.promotional_bundles pb
        ${whereClause}
      `;

      const countResult = await query(countQuery, queryParams.slice(0, -2));
      const total = parseInt(countResult.rows[0].total);

      // Format bundles
      const bundles = result.rows.map(row => ({
        id: row.id,
        supplierId: row.supplier_id,
        name: row.name,
        description: row.description,
        bundleType: row.bundle_type,
        discountType: row.discount_type,
        discountValue: parseFloat(row.discount_value),
        minQuantity: row.min_quantity,
        maxQuantity: row.max_quantity,
        minOrderValue: parseFloat(row.min_order_value),
        targetAudience: row.target_audience,
        customerUsageLimit: row.customer_usage_limit,
        totalUsageLimit: row.total_usage_limit,
        currentUsageCount: row.current_usage_count,
        validFrom: row.valid_from,
        validUntil: row.valid_until,
        isActive: row.is_active,
        priority: row.priority,
        termsAndConditions: row.terms_and_conditions,
        items: row.items,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));

      res.json({
        bundles,
        pagination: {
          total,
          page: Math.floor(offset / limit) + 1,
          limit: parseInt(limit),
          hasNext: offset + limit < total,
          hasPrev: offset > 0
        }
      });
    } catch (error) {
      logger.error('Failed to get bundles:', {
        error: error.message,
        supplierId
      });
      throw error;
    }
  }

  /**
   * Create promotional bundle
   */
  static async createBundle(req, res) {
    const supplierId = req.user.id;
    const {
      name,
      description,
      bundleType = 'discount',
      discountType = 'percentage',
      discountValue,
      minQuantity = 1,
      maxQuantity,
      minOrderValue = 0,
      targetAudience = 'all',
      customerUsageLimit = 1,
      totalUsageLimit,
      validFrom,
      validUntil,
      priority = 1,
      termsAndConditions,
      items = []
    } = req.body;

    try {
      // Validate items
      if (!Array.isArray(items) || items.length === 0) {
        throw new ValidationError('Bundle must include at least one item');
      }

      // Start transaction
      await query('BEGIN');

      try {
        // Create bundle
        const bundleQuery = `
          INSERT INTO bundles.promotional_bundles (
            supplier_id, name, description, bundle_type, discount_type, discount_value,
            min_quantity, max_quantity, min_order_value, target_audience,
            customer_usage_limit, total_usage_limit, valid_from, valid_until,
            priority, terms_and_conditions
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          RETURNING *
        `;

        const bundleResult = await query(bundleQuery, [
          supplierId, name, description, bundleType, discountType, discountValue,
          minQuantity, maxQuantity || null, minOrderValue, targetAudience,
          customerUsageLimit, totalUsageLimit || null, validFrom || null, validUntil || null,
          priority, termsAndConditions
        ]);

        const bundle = bundleResult.rows[0];

        // Create bundle items
        const bundleItems = [];
        for (const item of items) {
          const { gasTypeId, cylinderSize, requiredQuantity = 1, freeQuantity = 0 } = item;

          // Verify gas type exists
          const gasTypeResult = await query(
            'SELECT id, name FROM orders.gas_types WHERE id = $1',
            [gasTypeId]
          );

          if (gasTypeResult.rows.length === 0) {
            throw new ValidationError(`Invalid gas type ID: ${gasTypeId}`);
          }

          const itemQuery = `
            INSERT INTO bundles.bundle_items (
              bundle_id, gas_type_id, cylinder_size, required_quantity, free_quantity
            ) VALUES ($1, $2, $3, $4, $5)
            RETURNING *
          `;

          const itemResult = await query(itemQuery, [
            bundle.id, gasTypeId, cylinderSize, requiredQuantity, freeQuantity
          ]);

          bundleItems.push({
            ...itemResult.rows[0],
            gasTypeName: gasTypeResult.rows[0].name
          });
        }

        await query('COMMIT');

        // Publish bundle created event
        await publishEvent('bundles.events', 'bundle.created', {
          eventType: 'bundle.created',
          supplierId,
          bundleId: bundle.id,
          name,
          bundleType,
          discountType,
          discountValue,
          targetAudience,
          itemCount: bundleItems.length,
          timestamp: new Date().toISOString()
        });

        logger.info('Bundle created', {
          bundleId: bundle.id,
          supplierId,
          name,
          itemCount: bundleItems.length
        });

        res.status(201).json({
          message: 'Bundle created successfully',
          bundle: {
            id: bundle.id,
            supplierId: bundle.supplier_id,
            name: bundle.name,
            description: bundle.description,
            bundleType: bundle.bundle_type,
            discountType: bundle.discount_type,
            discountValue: parseFloat(bundle.discount_value),
            minQuantity: bundle.min_quantity,
            maxQuantity: bundle.max_quantity,
            minOrderValue: parseFloat(bundle.min_order_value),
            targetAudience: bundle.target_audience,
            customerUsageLimit: bundle.customer_usage_limit,
            totalUsageLimit: bundle.total_usage_limit,
            validFrom: bundle.valid_from,
            validUntil: bundle.valid_until,
            priority: bundle.priority,
            termsAndConditions: bundle.terms_and_conditions,
            items: bundleItems.map(item => ({
              id: item.id,
              gasTypeId: item.gas_type_id,
              gasTypeName: item.gasTypeName,
              cylinderSize: item.cylinder_size,
              requiredQuantity: item.required_quantity,
              freeQuantity: item.free_quantity
            })),
            isActive: bundle.is_active,
            createdAt: bundle.created_at,
            updatedAt: bundle.updated_at
          }
        });
      } catch (error) {
        await query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error('Failed to create bundle:', {
        error: error.message,
        supplierId,
        name
      });
      throw error;
    }
  }

  /**
   * Update promotional bundle
   */
  static async updateBundle(req, res) {
    const { id } = req.params;
    const supplierId = req.user.id;
    const {
      name,
      description,
      discountValue,
      minQuantity,
      maxQuantity,
      minOrderValue,
      customerUsageLimit,
      totalUsageLimit,
      validFrom,
      validUntil,
      priority,
      termsAndConditions,
      isActive
    } = req.body;

    try {
      // Check if bundle exists and belongs to supplier
      const existingResult = await query(
        'SELECT * FROM bundles.promotional_bundles WHERE id = $1 AND supplier_id = $2',
        [id, supplierId]
      );

      if (existingResult.rows.length === 0) {
        throw new NotFoundError('Bundle not found');
      }

      // Build update query dynamically
      const updates = [];
      const values = [];
      let paramIndex = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramIndex}`);
        values.push(name);
        paramIndex++;
      }

      if (description !== undefined) {
        updates.push(`description = $${paramIndex}`);
        values.push(description);
        paramIndex++;
      }

      if (discountValue !== undefined) {
        updates.push(`discount_value = $${paramIndex}`);
        values.push(discountValue);
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

      if (minOrderValue !== undefined) {
        updates.push(`min_order_value = $${paramIndex}`);
        values.push(minOrderValue);
        paramIndex++;
      }

      if (customerUsageLimit !== undefined) {
        updates.push(`customer_usage_limit = $${paramIndex}`);
        values.push(customerUsageLimit);
        paramIndex++;
      }

      if (totalUsageLimit !== undefined) {
        updates.push(`total_usage_limit = $${paramIndex}`);
        values.push(totalUsageLimit || null);
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

      if (termsAndConditions !== undefined) {
        updates.push(`terms_and_conditions = $${paramIndex}`);
        values.push(termsAndConditions);
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
        UPDATE bundles.promotional_bundles 
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex} AND supplier_id = $${paramIndex + 1}
        RETURNING *
      `;

      const updateResult = await query(updateQuery, values);
      const updatedBundle = updateResult.rows[0];

      // Publish bundle updated event
      await publishEvent('bundles.events', 'bundle.updated', {
        eventType: 'bundle.updated',
        supplierId,
        bundleId: id,
        changes: { name, description, discountValue, isActive },
        timestamp: new Date().toISOString()
      });

      logger.info('Bundle updated', {
        bundleId: id,
        supplierId,
        changes: updates
      });

      res.json({
        message: 'Bundle updated successfully',
        bundle: {
          id: updatedBundle.id,
          supplierId: updatedBundle.supplier_id,
          name: updatedBundle.name,
          description: updatedBundle.description,
          bundleType: updatedBundle.bundle_type,
          discountType: updatedBundle.discount_type,
          discountValue: parseFloat(updatedBundle.discount_value),
          minQuantity: updatedBundle.min_quantity,
          maxQuantity: updatedBundle.max_quantity,
          minOrderValue: parseFloat(updatedBundle.min_order_value),
          targetAudience: updatedBundle.target_audience,
          customerUsageLimit: updatedBundle.customer_usage_limit,
          totalUsageLimit: updatedBundle.total_usage_limit,
          currentUsageCount: updatedBundle.current_usage_count,
          validFrom: updatedBundle.valid_from,
          validUntil: updatedBundle.valid_until,
          priority: updatedBundle.priority,
          termsAndConditions: updatedBundle.terms_and_conditions,
          isActive: updatedBundle.is_active,
          createdAt: updatedBundle.created_at,
          updatedAt: updatedBundle.updated_at
        }
      });
    } catch (error) {
      logger.error('Failed to update bundle:', {
        error: error.message,
        bundleId: id,
        supplierId
      });
      throw error;
    }
  }

  /**
   * Delete promotional bundle
   */
  static async deleteBundle(req, res) {
    const { id } = req.params;
    const supplierId = req.user.id;

    try {
      // Check if bundle exists and belongs to supplier
      const existingResult = await query(
        'SELECT * FROM bundles.promotional_bundles WHERE id = $1 AND supplier_id = $2',
        [id, supplierId]
      );

      if (existingResult.rows.length === 0) {
        throw new NotFoundError('Bundle not found');
      }

      // Soft delete by setting is_active to false
      await query(
        'UPDATE bundles.promotional_bundles SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [id]
      );

      // Publish bundle deleted event
      await publishEvent('bundles.events', 'bundle.deleted', {
        eventType: 'bundle.deleted',
        supplierId,
        bundleId: id,
        timestamp: new Date().toISOString()
      });

      logger.info('Bundle deleted', {
        bundleId: id,
        supplierId
      });

      res.json({
        message: 'Bundle deleted successfully'
      });
    } catch (error) {
      logger.error('Failed to delete bundle:', {
        error: error.message,
        bundleId: id,
        supplierId
      });
      throw error;
    }
  }

  /**
   * Calculate bundle discount for order items
   */
  static async calculateBundleDiscount(req, res) {
    const supplierId = req.user.id;
    const { items, customerId, customerType = 'returning_customers' } = req.body;

    try {
      if (!Array.isArray(items) || items.length === 0) {
        throw new ValidationError('Items array is required');
      }

      // Get applicable bundles for this supplier
      const bundlesQuery = `
        SELECT pb.*,
               COALESCE(
                 json_agg(
                   json_build_object(
                     'gasTypeId', bi.gas_type_id,
                     'cylinderSize', bi.cylinder_size,
                     'requiredQuantity', bi.required_quantity,
                     'freeQuantity', bi.free_quantity
                   )
                 ) FILTER (WHERE bi.id IS NOT NULL),
                 '[]'
               ) as items
        FROM bundles.promotional_bundles pb
        LEFT JOIN bundles.bundle_items bi ON pb.id = bi.bundle_id
        WHERE pb.supplier_id = $1
        AND pb.is_active = true
        AND (pb.valid_from IS NULL OR pb.valid_from <= CURRENT_TIMESTAMP)
        AND (pb.valid_until IS NULL OR pb.valid_until >= CURRENT_TIMESTAMP)
        AND (pb.target_audience = 'all' OR pb.target_audience = $2)
        GROUP BY pb.id
        ORDER BY pb.priority DESC
      `;

      const bundlesResult = await query(bundlesQuery, [supplierId, customerType]);
      const availableBundles = bundlesResult.rows;

      let bestDiscount = {
        bundleId: null,
        bundleName: null,
        discountAmount: 0,
        originalAmount: 0,
        finalAmount: 0,
        discountType: null,
        discountValue: 0
      };

      // Calculate original total
      let originalTotal = 0;
      for (const item of items) {
        originalTotal += (item.unitPrice || 0) * (item.quantity || 0);
      }

      // Check each bundle for applicability
      for (const bundle of availableBundles) {
        const bundleItems = bundle.items;
        let isApplicable = true;
        let totalQuantity = 0;

        // Check if order items match bundle requirements
        for (const bundleItem of bundleItems) {
          const matchingOrderItem = items.find(item =>
            item.gasTypeId === bundleItem.gasTypeId &&
            item.cylinderSize === bundleItem.cylinderSize
          );

          if (!matchingOrderItem || matchingOrderItem.quantity < bundleItem.requiredQuantity) {
            isApplicable = false;
            break;
          }

          totalQuantity += matchingOrderItem.quantity;
        }

        // Check quantity and order value requirements
        if (isApplicable) {
          if (bundle.min_quantity && totalQuantity < bundle.min_quantity) {
            isApplicable = false;
          }
          if (bundle.max_quantity && totalQuantity > bundle.max_quantity) {
            isApplicable = false;
          }
          if (bundle.min_order_value && originalTotal < parseFloat(bundle.min_order_value)) {
            isApplicable = false;
          }
        }

        if (isApplicable) {
          let discountAmount = 0;

          switch (bundle.discount_type) {
            case 'percentage':
              discountAmount = originalTotal * (parseFloat(bundle.discount_value) / 100);
              break;
            case 'fixed_amount':
              discountAmount = parseFloat(bundle.discount_value);
              break;
            case 'buy_x_get_y':
              // Calculate free items value
              const freeItemsValue = bundleItems.reduce((total, bundleItem) => {
                const matchingItem = items.find(item =>
                  item.gasTypeId === bundleItem.gasTypeId &&
                  item.cylinderSize === bundleItem.cylinderSize
                );
                if (matchingItem && bundleItem.freeQuantity > 0) {
                  return total + (matchingItem.unitPrice * bundleItem.freeQuantity);
                }
                return total;
              }, 0);
              discountAmount = freeItemsValue;
              break;
          }

          // Keep track of best discount
          if (discountAmount > bestDiscount.discountAmount) {
            bestDiscount = {
              bundleId: bundle.id,
              bundleName: bundle.name,
              discountAmount,
              originalAmount: originalTotal,
              finalAmount: originalTotal - discountAmount,
              discountType: bundle.discount_type,
              discountValue: parseFloat(bundle.discount_value)
            };
          }
        }
      }

      res.json({
        message: 'Bundle discount calculation completed',
        calculation: {
          supplierId,
          customerId,
          customerType,
          originalAmount: originalTotal,
          bestBundle: bestDiscount.bundleId ? bestDiscount : null,
          availableBundles: availableBundles.length,
          calculatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Failed to calculate bundle discount:', {
        error: error.message,
        supplierId,
        itemCount: items?.length
      });
      throw error;
    }
  }

  /**
   * Get bundle usage statistics
   */
  static async getBundleUsage(req, res) {
    const supplierId = req.user.id;
    const { bundleId, startDate, endDate, limit = 20, offset = 0 } = req.query;

    try {
      let whereClause = 'WHERE pb.supplier_id = $1';
      const queryParams = [supplierId];
      let paramIndex = 2;

      if (bundleId) {
        whereClause += ` AND bu.bundle_id = $${paramIndex}`;
        queryParams.push(bundleId);
        paramIndex++;
      }

      if (startDate) {
        whereClause += ` AND bu.used_at >= $${paramIndex}`;
        queryParams.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        whereClause += ` AND bu.used_at <= $${paramIndex}`;
        queryParams.push(endDate);
        paramIndex++;
      }

      const usageQuery = `
        SELECT
          bu.*,
          pb.name as bundle_name,
          pb.bundle_type,
          pb.discount_type,
          u.email as customer_email
        FROM bundles.bundle_usage bu
        JOIN bundles.promotional_bundles pb ON bu.bundle_id = pb.id
        JOIN auth.users u ON bu.customer_id = u.id
        ${whereClause}
        ORDER BY bu.used_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      queryParams.push(parseInt(limit), parseInt(offset));
      const result = await query(usageQuery, queryParams);

      // Get total count and summary stats
      const statsQuery = `
        SELECT
          COUNT(*) as total_usage,
          SUM(bu.discount_applied) as total_discount_given,
          SUM(bu.original_amount) as total_original_amount,
          SUM(bu.final_amount) as total_final_amount
        FROM bundles.bundle_usage bu
        JOIN bundles.promotional_bundles pb ON bu.bundle_id = pb.id
        ${whereClause}
      `;

      const statsResult = await query(statsQuery, queryParams.slice(0, -2));
      const stats = statsResult.rows[0];

      const usage = result.rows.map(row => ({
        id: row.id,
        bundleId: row.bundle_id,
        bundleName: row.bundle_name,
        bundleType: row.bundle_type,
        discountType: row.discount_type,
        customerId: row.customer_id,
        customerEmail: row.customer_email,
        orderId: row.order_id,
        usageCount: row.usage_count,
        discountApplied: parseFloat(row.discount_applied),
        originalAmount: parseFloat(row.original_amount),
        finalAmount: parseFloat(row.final_amount),
        usedAt: row.used_at,
        createdAt: row.created_at
      }));

      res.json({
        usage,
        statistics: {
          totalUsage: parseInt(stats.total_usage),
          totalDiscountGiven: parseFloat(stats.total_discount_given || 0),
          totalOriginalAmount: parseFloat(stats.total_original_amount || 0),
          totalFinalAmount: parseFloat(stats.total_final_amount || 0),
          averageDiscountPercentage: stats.total_original_amount > 0
            ? ((parseFloat(stats.total_discount_given || 0) / parseFloat(stats.total_original_amount)) * 100).toFixed(2)
            : 0
        },
        pagination: {
          total: parseInt(stats.total_usage),
          page: Math.floor(offset / limit) + 1,
          limit: parseInt(limit),
          hasNext: offset + limit < parseInt(stats.total_usage),
          hasPrev: offset > 0
        }
      });
    } catch (error) {
      logger.error('Failed to get bundle usage:', {
        error: error.message,
        supplierId,
        bundleId
      });
      throw error;
    }
  }
}

module.exports = BundleController;
