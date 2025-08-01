const { query } = require('../database/connection');
const { publishEvent } = require('../services/rabbitmq');
const logger = require('../utils/logger');
const { ValidationError, NotFoundError, BusinessLogicError } = require('../middleware/errorHandler');

class CylinderController {
  /**
   * Get cylinders with filtering
   */
  static async getCylinders(req, res) {
    const {
      status,
      gasTypeId,
      size,
      supplierId,
      customerId,
      limit = 20,
      offset = 0
    } = req.query;

    try {
      let whereClause = '';
      const params = [];
      let paramCount = 0;

      // Status filtering
      if (status) {
        whereClause += ` AND c.status = $${++paramCount}`;
        params.push(status);
      }

      // Gas type filtering
      if (gasTypeId) {
        whereClause += ` AND c.gas_type_id = $${++paramCount}`;
        params.push(gasTypeId);
      }

      // Size filtering
      if (size) {
        whereClause += ` AND c.size = $${++paramCount}`;
        params.push(size);
      }

      // Supplier filtering
      if (supplierId) {
        whereClause += ` AND c.current_supplier_id = $${++paramCount}`;
        params.push(supplierId);
      }

      // Customer filtering
      if (customerId) {
        whereClause += ` AND c.current_customer_id = $${++paramCount}`;
        params.push(customerId);
      }

      const cylindersResult = await query(`
        SELECT 
          c.*,
          gt.name as gas_type_name,
          gt.category as gas_type_category
        FROM orders.cylinders c
        LEFT JOIN orders.gas_types gt ON c.gas_type_id = gt.id
        WHERE 1=1 ${whereClause}
        ORDER BY c.created_at DESC
        LIMIT $${++paramCount} OFFSET $${++paramCount}
      `, [...params, limit, offset]);

      const cylinders = cylindersResult.rows.map(cylinder => ({
        id: cylinder.id,
        qrCode: cylinder.qr_code,
        serialNumber: cylinder.serial_number,
        gasTypeId: cylinder.gas_type_id,
        gasTypeName: cylinder.gas_type_name,
        gasTypeCategory: cylinder.gas_type_category,
        size: cylinder.size,
        status: cylinder.status,
        currentSupplierId: cylinder.current_supplier_id,
        currentCustomerId: cylinder.current_customer_id,
        lastInspectionDate: cylinder.last_inspection_date,
        nextInspectionDate: cylinder.next_inspection_date,
        manufactureDate: cylinder.manufacture_date,
        expiryDate: cylinder.expiry_date,
        createdAt: cylinder.created_at,
        updatedAt: cylinder.updated_at
      }));

      res.json({
        cylinders,
        pagination: {
          total: cylinders.length,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      logger.error('Failed to get cylinders:', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get cylinder by ID or QR code
   */
  static async getCylinderById(req, res) {
    const { id } = req.params;

    try {
      // Try to find by ID first, then by QR code
      let cylinderResult = await query(`
        SELECT 
          c.*,
          gt.name as gas_type_name,
          gt.category as gas_type_category
        FROM orders.cylinders c
        LEFT JOIN orders.gas_types gt ON c.gas_type_id = gt.id
        WHERE c.id = $1 OR c.qr_code = $1
      `, [id]);

      if (cylinderResult.rows.length === 0) {
        throw new NotFoundError('Cylinder not found');
      }

      const cylinder = cylinderResult.rows[0];

      // Get cylinder history
      const historyResult = await query(`
        SELECT * FROM orders.cylinder_history
        WHERE cylinder_id = $1
        ORDER BY created_at DESC
        LIMIT 20
      `, [cylinder.id]);

      res.json({
        cylinder: {
          id: cylinder.id,
          qrCode: cylinder.qr_code,
          serialNumber: cylinder.serial_number,
          gasTypeId: cylinder.gas_type_id,
          gasTypeName: cylinder.gas_type_name,
          gasTypeCategory: cylinder.gas_type_category,
          size: cylinder.size,
          status: cylinder.status,
          currentSupplierId: cylinder.current_supplier_id,
          currentCustomerId: cylinder.current_customer_id,
          lastInspectionDate: cylinder.last_inspection_date,
          nextInspectionDate: cylinder.next_inspection_date,
          manufactureDate: cylinder.manufacture_date,
          expiryDate: cylinder.expiry_date,
          createdAt: cylinder.created_at,
          updatedAt: cylinder.updated_at
        },
        history: historyResult.rows.map(history => ({
          id: history.id,
          action: history.action,
          fromStatus: history.from_status,
          toStatus: history.to_status,
          notes: history.notes,
          performedBy: history.performed_by,
          createdAt: history.created_at
        }))
      });
    } catch (error) {
      logger.error('Failed to get cylinder by ID:', {
        error: error.message,
        cylinderId: id
      });
      throw error;
    }
  }

  /**
   * Create new cylinder
   */
  static async createCylinder(req, res) {
    const {
      qrCode,
      serialNumber,
      gasTypeId,
      size,
      supplierId,
      manufactureDate,
      expiryDate
    } = req.body;
    const userId = req.user.id;

    try {
      // Check if QR code or serial number already exists
      const existingCylinder = await query(
        'SELECT id FROM orders.cylinders WHERE qr_code = $1 OR serial_number = $2',
        [qrCode, serialNumber]
      );

      if (existingCylinder.rows.length > 0) {
        throw new ValidationError('Cylinder with this QR code or serial number already exists');
      }

      // Calculate next inspection date (typically 5 years from manufacture)
      const nextInspectionDate = new Date(manufactureDate);
      nextInspectionDate.setFullYear(nextInspectionDate.getFullYear() + 5);

      // Create cylinder
      const cylinderResult = await query(`
        INSERT INTO orders.cylinders (
          qr_code, serial_number, gas_type_id, size, status,
          current_supplier_id, manufacture_date, expiry_date,
          next_inspection_date, created_by
        ) VALUES ($1, $2, $3, $4, 'available', $5, $6, $7, $8, $9)
        RETURNING *
      `, [
        qrCode, serialNumber, gasTypeId, size, supplierId,
        manufactureDate, expiryDate, nextInspectionDate, userId
      ]);

      const cylinder = cylinderResult.rows[0];

      // Create history entry
      await query(`
        INSERT INTO orders.cylinder_history (
          cylinder_id, action, to_status, notes, performed_by
        ) VALUES ($1, 'created', 'available', 'Cylinder created', $2)
      `, [cylinder.id, userId]);

      // Publish cylinder created event
      await publishEvent('orders.events', 'cylinder.created', {
        eventType: 'cylinder.created',
        cylinderId: cylinder.id,
        qrCode: cylinder.qr_code,
        gasTypeId: cylinder.gas_type_id,
        size: cylinder.size,
        supplierId: cylinder.current_supplier_id,
        createdBy: userId,
        timestamp: new Date().toISOString()
      });

      logger.info('Cylinder created successfully', {
        cylinderId: cylinder.id,
        qrCode: cylinder.qr_code,
        createdBy: userId
      });

      res.status(201).json({
        message: 'Cylinder created successfully',
        cylinder: {
          id: cylinder.id,
          qrCode: cylinder.qr_code,
          serialNumber: cylinder.serial_number,
          gasTypeId: cylinder.gas_type_id,
          size: cylinder.size,
          status: cylinder.status,
          currentSupplierId: cylinder.current_supplier_id,
          manufactureDate: cylinder.manufacture_date,
          expiryDate: cylinder.expiry_date,
          nextInspectionDate: cylinder.next_inspection_date,
          createdAt: cylinder.created_at
        }
      });
    } catch (error) {
      logger.error('Failed to create cylinder:', {
        error: error.message,
        qrCode,
        serialNumber,
        userId
      });
      throw error;
    }
  }

  /**
   * Update cylinder status
   */
  static async updateCylinderStatus(req, res) {
    const { id } = req.params;
    const { status, notes, customerId, supplierId } = req.body;
    const userId = req.user.id;

    try {
      // Get current cylinder
      const cylinderResult = await query(
        'SELECT * FROM orders.cylinders WHERE id = $1',
        [id]
      );

      if (cylinderResult.rows.length === 0) {
        throw new NotFoundError('Cylinder not found');
      }

      const cylinder = cylinderResult.rows[0];

      // Validate status transition
      const validTransitions = {
        'available': ['in_use', 'maintenance', 'retired'],
        'in_use': ['available', 'maintenance', 'returned'],
        'maintenance': ['available', 'retired'],
        'returned': ['available', 'maintenance'],
        'retired': []
      };

      if (!validTransitions[cylinder.status]?.includes(status)) {
        throw new ValidationError(`Invalid status transition from ${cylinder.status} to ${status}`);
      }

      // Update cylinder
      const updateFields = ['status = $2', 'updated_at = CURRENT_TIMESTAMP'];
      const updateParams = [id, status];
      let paramCount = 2;

      if (customerId !== undefined) {
        updateFields.push(`current_customer_id = $${++paramCount}`);
        updateParams.push(customerId);
      }

      if (supplierId !== undefined) {
        updateFields.push(`current_supplier_id = $${++paramCount}`);
        updateParams.push(supplierId);
      }

      await query(`
        UPDATE orders.cylinders 
        SET ${updateFields.join(', ')}
        WHERE id = $1
      `, updateParams);

      // Create history entry
      await query(`
        INSERT INTO orders.cylinder_history (
          cylinder_id, action, from_status, to_status, notes, performed_by
        ) VALUES ($1, 'status_update', $2, $3, $4, $5)
      `, [id, cylinder.status, status, notes, userId]);

      // Publish cylinder status update event
      await publishEvent('orders.events', 'cylinder.status_updated', {
        eventType: 'cylinder.status_updated',
        cylinderId: id,
        qrCode: cylinder.qr_code,
        oldStatus: cylinder.status,
        newStatus: status,
        customerId,
        supplierId,
        updatedBy: userId,
        timestamp: new Date().toISOString()
      });

      logger.info('Cylinder status updated', {
        cylinderId: id,
        qrCode: cylinder.qr_code,
        oldStatus: cylinder.status,
        newStatus: status,
        updatedBy: userId
      });

      res.json({
        message: 'Cylinder status updated successfully',
        cylinder: {
          id,
          status,
          updatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Failed to update cylinder status:', {
        error: error.message,
        cylinderId: id,
        status,
        userId
      });
      throw error;
    }
  }
}

module.exports = CylinderController;
