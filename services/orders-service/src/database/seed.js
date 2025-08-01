#!/usr/bin/env node

/**
 * Database seeder for Orders Service
 */

const { query } = require('./connection');
const logger = require('../utils/logger');

class DatabaseSeeder {
  constructor() {
    // Sample data for testing
  }

  /**
   * Seed test orders
   */
  async seedTestOrders() {
    try {
      // Check if test orders already exist
      const existingOrders = await query('SELECT id FROM orders.orders LIMIT 1');
      
      if (existingOrders.rows.length > 0) {
        logger.info('Test orders already exist, skipping...');
        return;
      }

      // Sample order data (using UUIDs that would exist after auth seeding)
      const testOrders = [
        {
          orderNumber: 'GC202408001',
          userId: '11111111-1111-1111-1111-111111111111', // Placeholder - would be real user ID
          supplierId: '22222222-2222-2222-2222-222222222222', // Placeholder - would be real supplier ID
          deliveryAddressId: '33333333-3333-3333-3333-333333333333', // Placeholder - would be real address ID
          orderType: 'regular',
          priority: 'normal',
          status: 'pending',
          subtotal: 5000.00,
          taxAmount: 375.00,
          deliveryFee: 500.00,
          totalAmount: 5875.00,
          specialInstructions: 'Please call before delivery',
          items: [
            {
              gasTypeId: '44444444-4444-4444-4444-444444444444',
              cylinderSize: '12.5kg',
              quantity: 2,
              unitPrice: 2500.00,
              totalPrice: 5000.00
            }
          ]
        },
        {
          orderNumber: 'GC202408002',
          userId: '11111111-1111-1111-1111-111111111111',
          supplierId: '22222222-2222-2222-2222-222222222222',
          deliveryAddressId: '33333333-3333-3333-3333-333333333333',
          orderType: 'emergency_sos',
          priority: 'urgent',
          status: 'confirmed',
          subtotal: 3000.00,
          taxAmount: 225.00,
          deliveryFee: 1000.00, // Higher fee for emergency
          totalAmount: 4225.00,
          emergencyContactPhone: '+2348012345678',
          items: [
            {
              gasTypeId: '44444444-4444-4444-4444-444444444444',
              cylinderSize: '6kg',
              quantity: 1,
              unitPrice: 3000.00,
              totalPrice: 3000.00
            }
          ]
        }
      ];

      for (const orderData of testOrders) {
        // Create order
        const orderResult = await query(`
          INSERT INTO orders.orders (
            order_number, user_id, supplier_id, delivery_address_id,
            order_type, priority, status, subtotal, tax_amount,
            delivery_fee, total_amount, special_instructions, emergency_contact_phone
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING id
        `, [
          orderData.orderNumber,
          orderData.userId,
          orderData.supplierId,
          orderData.deliveryAddressId,
          orderData.orderType,
          orderData.priority,
          orderData.status,
          orderData.subtotal,
          orderData.taxAmount,
          orderData.deliveryFee,
          orderData.totalAmount,
          orderData.specialInstructions,
          orderData.emergencyContactPhone
        ]);

        const orderId = orderResult.rows[0].id;

        // Create order items
        for (const item of orderData.items) {
          await query(`
            INSERT INTO orders.order_items (
              order_id, gas_type_id, cylinder_size, quantity, unit_price, total_price
            ) VALUES ($1, $2, $3, $4, $5, $6)
          `, [
            orderId,
            item.gasTypeId,
            item.cylinderSize,
            item.quantity,
            item.unitPrice,
            item.totalPrice
          ]);
        }

        // Create delivery record for confirmed orders
        if (orderData.status === 'confirmed') {
          await query(`
            INSERT INTO orders.deliveries (
              order_id, status, scheduled_date
            ) VALUES ($1, $2, CURRENT_DATE + INTERVAL '1 day')
          `, [orderId, 'assigned']);
        }

        logger.info(`Test order created: ${orderData.orderNumber}`);
      }

      console.log('\n📦 Test Orders Created:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📋 GC202408001 - Regular order (pending)');
      console.log('🚨 GC202408002 - Emergency order (confirmed)');
      console.log('⚠️  These are test orders for development only!');
    } catch (error) {
      logger.error('Failed to seed test orders:', error);
      throw error;
    }
  }

  /**
   * Seed gas types and cylinder data
   */
  async seedGasTypes() {
    try {
      // This would typically reference data from supplier service
      // For now, we'll just log that this should be coordinated
      logger.info('Gas types should be seeded via supplier service');
      
      console.log('\n⛽ Gas Types Information:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('ℹ️  Gas types and cylinder data are managed by the supplier service');
      console.log('ℹ️  Run supplier service seeding to populate gas type references');
    } catch (error) {
      logger.error('Failed to seed gas types:', error);
      throw error;
    }
  }

  /**
   * Run all seeders
   */
  async runSeeders() {
    try {
      logger.info('Starting orders database seeding...');
      
      await this.seedGasTypes();
      await this.seedTestOrders();
      
      logger.info('Orders database seeding completed successfully');
    } catch (error) {
      logger.error('Orders database seeding failed:', error);
      throw error;
    }
  }

  /**
   * Clear all orders data (for testing)
   */
  async clearData() {
    try {
      logger.warn('Clearing all orders data...');
      
      await query('TRUNCATE orders.delivery_tracking CASCADE');
      await query('TRUNCATE orders.order_status_history CASCADE');
      await query('TRUNCATE orders.cylinder_tracking CASCADE');
      await query('TRUNCATE orders.deliveries CASCADE');
      await query('TRUNCATE orders.order_items CASCADE');
      await query('TRUNCATE orders.orders CASCADE');
      
      logger.info('All orders data cleared');
    } catch (error) {
      logger.error('Failed to clear orders data:', error);
      throw error;
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  const seeder = new DatabaseSeeder();
  
  try {
    switch (command) {
      case 'clear':
        await seeder.clearData();
        break;
        
      case 'orders':
        await seeder.seedTestOrders();
        break;
        
      case 'gas-types':
        await seeder.seedGasTypes();
        break;
        
      case 'run':
      default:
        await seeder.runSeeders();
        break;
    }
    
    process.exit(0);
  } catch (error) {
    logger.error('Orders seeding command failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = DatabaseSeeder;
