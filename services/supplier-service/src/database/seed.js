#!/usr/bin/env node

/**
 * Database seeder for Supplier Service
 */

const { query } = require('./connection');
const logger = require('../utils/logger');

class DatabaseSeeder {
  constructor() {
    // Sample data for testing
  }

  /**
   * Seed gas types
   */
  async seedGasTypes() {
    try {
      // Check if gas types already exist
      const existingGasTypes = await query('SELECT id FROM supplier.gas_types LIMIT 1');
      
      if (existingGasTypes.rows.length > 0) {
        logger.info('Gas types already exist, skipping...');
        return;
      }

      const gasTypes = [
        {
          name: 'LPG Cooking Gas',
          description: 'Liquefied Petroleum Gas for household cooking',
          category: 'cooking'
        },
        {
          name: 'Industrial LPG',
          description: 'High-grade LPG for industrial applications',
          category: 'industrial'
        },
        {
          name: 'Autogas LPG',
          description: 'LPG for automotive fuel systems',
          category: 'automotive'
        },
        {
          name: 'Medical Oxygen',
          description: 'Medical grade oxygen for healthcare facilities',
          category: 'medical'
        }
      ];

      for (const gasType of gasTypes) {
        await query(`
          INSERT INTO supplier.gas_types (name, description, category)
          VALUES ($1, $2, $3)
        `, [gasType.name, gasType.description, gasType.category]);
        
        logger.info(`Gas type created: ${gasType.name}`);
      }

      console.log('\n⛽ Gas Types Created:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      gasTypes.forEach(gasType => {
        console.log(`🔥 ${gasType.name} (${gasType.category})`);
      });
    } catch (error) {
      logger.error('Failed to seed gas types:', error);
      throw error;
    }
  }

  /**
   * Seed test inventory and pricing
   */
  async seedTestInventory() {
    try {
      // Get gas types
      const gasTypesResult = await query('SELECT id, name FROM supplier.gas_types');
      const gasTypes = gasTypesResult.rows;
      
      if (gasTypes.length === 0) {
        logger.warn('No gas types found, skipping inventory seeding');
        return;
      }

      // Sample supplier ID (would be real supplier user ID after auth seeding)
      const testSupplierId = '22222222-2222-2222-2222-222222222222';

      // Check if inventory already exists
      const existingInventory = await query(
        'SELECT id FROM supplier.inventory WHERE supplier_id = $1 LIMIT 1',
        [testSupplierId]
      );
      
      if (existingInventory.rows.length > 0) {
        logger.info('Test inventory already exists, skipping...');
        return;
      }

      const cylinderSizes = ['6kg', '12.5kg', '25kg', '50kg'];
      
      for (const gasType of gasTypes) {
        for (const size of cylinderSizes) {
          // Create inventory record
          await query(`
            INSERT INTO supplier.inventory (
              supplier_id, gas_type_id, cylinder_size, quantity_available,
              reorder_level, max_stock_level, unit_cost
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            testSupplierId,
            gasType.id,
            size,
            Math.floor(Math.random() * 50) + 20, // 20-70 units
            10,
            100,
            parseFloat(size) * 100 // Simple cost calculation
          ]);

          // Create pricing record
          const basePrice = parseFloat(size) * 200; // Simple pricing
          await query(`
            INSERT INTO supplier.pricing (
              supplier_id, gas_type_id, cylinder_size, customer_type,
              unit_price, bulk_discount_threshold, bulk_discount_percentage
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            testSupplierId,
            gasType.id,
            size,
            'household',
            basePrice,
            10,
            5.0
          ]);

          // Create wholesale pricing
          await query(`
            INSERT INTO supplier.pricing (
              supplier_id, gas_type_id, cylinder_size, customer_type,
              unit_price, bulk_discount_threshold, bulk_discount_percentage
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            testSupplierId,
            gasType.id,
            size,
            'wholesale',
            basePrice * 0.85, // 15% discount for wholesale
            5,
            10.0
          ]);
        }
      }

      console.log('\n📦 Test Inventory Created:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📋 Inventory for all gas types and cylinder sizes');
      console.log('💰 Pricing for household and wholesale customers');
      console.log('⚠️  This is test data for development only!');
    } catch (error) {
      logger.error('Failed to seed test inventory:', error);
      throw error;
    }
  }

  /**
   * Seed test cylinders
   */
  async seedTestCylinders() {
    try {
      // Get gas types
      const gasTypesResult = await query('SELECT id, name FROM supplier.gas_types LIMIT 1');
      const gasTypes = gasTypesResult.rows;
      
      if (gasTypes.length === 0) {
        logger.warn('No gas types found, skipping cylinder seeding');
        return;
      }

      const testSupplierId = '22222222-2222-2222-2222-222222222222';
      
      // Check if cylinders already exist
      const existingCylinders = await query(
        'SELECT id FROM supplier.cylinders WHERE supplier_id = $1 LIMIT 1',
        [testSupplierId]
      );
      
      if (existingCylinders.rows.length > 0) {
        logger.info('Test cylinders already exist, skipping...');
        return;
      }

      const cylinderSizes = ['6kg', '12.5kg'];
      const gasType = gasTypes[0]; // Use first gas type
      
      for (let i = 1; i <= 20; i++) {
        const size = cylinderSizes[i % cylinderSizes.length];
        const serialNumber = `CYL${String(i).padStart(6, '0')}`;
        
        await query(`
          INSERT INTO supplier.cylinders (
            supplier_id, serial_number, gas_type_id, size,
            manufacturing_date, last_inspection_date, next_inspection_date,
            status, condition
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          testSupplierId,
          serialNumber,
          gasType.id,
          size,
          new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000), // Random date within last year
          new Date(Date.now() - Math.random() * 180 * 24 * 60 * 60 * 1000), // Random date within last 6 months
          new Date(Date.now() + (365 - Math.random() * 180) * 24 * 60 * 60 * 1000), // Random date within next 6-12 months
          'available',
          'good'
        ]);
      }

      console.log('\n🛢️ Test Cylinders Created:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📋 20 test cylinders with serial numbers CYL000001-CYL000020');
      console.log('🔍 Various sizes and inspection dates');
      console.log('⚠️  This is test data for development only!');
    } catch (error) {
      logger.error('Failed to seed test cylinders:', error);
      throw error;
    }
  }

  /**
   * Run all seeders
   */
  async runSeeders() {
    try {
      logger.info('Starting supplier database seeding...');
      
      await this.seedGasTypes();
      await this.seedTestInventory();
      await this.seedTestCylinders();
      
      logger.info('Supplier database seeding completed successfully');
    } catch (error) {
      logger.error('Supplier database seeding failed:', error);
      throw error;
    }
  }

  /**
   * Clear all supplier data (for testing)
   */
  async clearData() {
    try {
      logger.warn('Clearing all supplier data...');
      
      await query('TRUNCATE supplier.supplier_analytics CASCADE');
      await query('TRUNCATE supplier.inventory_transactions CASCADE');
      await query('TRUNCATE supplier.cylinders CASCADE');
      await query('TRUNCATE supplier.pricing CASCADE');
      await query('TRUNCATE supplier.inventory CASCADE');
      await query('TRUNCATE supplier.gas_types CASCADE');
      
      logger.info('All supplier data cleared');
    } catch (error) {
      logger.error('Failed to clear supplier data:', error);
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
        
      case 'gas-types':
        await seeder.seedGasTypes();
        break;
        
      case 'inventory':
        await seeder.seedTestInventory();
        break;
        
      case 'cylinders':
        await seeder.seedTestCylinders();
        break;
        
      case 'run':
      default:
        await seeder.runSeeders();
        break;
    }
    
    process.exit(0);
  } catch (error) {
    logger.error('Supplier seeding command failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = DatabaseSeeder;
