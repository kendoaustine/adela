#!/usr/bin/env node

/**
 * Database seeder for Auth Service
 */

const { query } = require('./connection');
const bcrypt = require('bcrypt');
const logger = require('../utils/logger');

class DatabaseSeeder {
  constructor() {
    this.saltRounds = 12;
  }

  /**
   * Hash password
   */
  async hashPassword(password) {
    return await bcrypt.hash(password, this.saltRounds);
  }

  /**
   * Seed admin user
   */
  async seedAdminUser() {
    try {
      // Check if admin user already exists
      const existingAdmin = await query(
        'SELECT id FROM auth.users WHERE role = $1 LIMIT 1',
        ['platform_admin']
      );

      if (existingAdmin.rows.length > 0) {
        logger.info('Admin user already exists, skipping...');
        return;
      }

      const adminPassword = await this.hashPassword('admin123!@#');
      
      // Create admin user
      const adminResult = await query(`
        INSERT INTO auth.users (
          email, password_hash, role, is_active, is_verified, 
          email_verified_at, phone_verified_at
        ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
      `, [
        'admin@gasconnect.com',
        adminPassword,
        'platform_admin',
        true,
        true
      ]);

      const adminId = adminResult.rows[0].id;

      // Create admin profile
      await query(`
        INSERT INTO auth.profiles (user_id, first_name, last_name)
        VALUES ($1, $2, $3)
      `, [adminId, 'System', 'Administrator']);

      logger.info('Admin user created successfully');
      console.log('📧 Admin Email: admin@gasconnect.com');
      console.log('🔑 Admin Password: admin123!@#');
      console.log('⚠️  Please change the admin password after first login!');
    } catch (error) {
      logger.error('Failed to seed admin user:', error);
      throw error;
    }
  }

  /**
   * Seed test users
   */
  async seedTestUsers() {
    try {
      const testPassword = await this.hashPassword('test123');

      const testUsers = [
        {
          email: 'household@test.com',
          role: 'household',
          firstName: 'John',
          lastName: 'Doe',
          phone: '+2348012345678'
        },
        {
          email: 'supplier@test.com',
          role: 'supplier',
          firstName: 'Jane',
          lastName: 'Smith',
          businessName: 'Lagos Gas Supply Co.',
          phone: '+2348087654321'
        },
        {
          email: 'driver@test.com',
          role: 'delivery_driver',
          firstName: 'Mike',
          lastName: 'Johnson',
          phone: '+2348011111111'
        }
      ];

      for (const userData of testUsers) {
        // Check if user already exists
        const existingUser = await query(
          'SELECT id FROM auth.users WHERE email = $1',
          [userData.email]
        );

        if (existingUser.rows.length > 0) {
          logger.info(`Test user ${userData.email} already exists, skipping...`);
          continue;
        }

        // Create user
        const userResult = await query(`
          INSERT INTO auth.users (
            email, phone, password_hash, role, is_active, is_verified,
            email_verified_at, phone_verified_at
          ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          RETURNING id
        `, [
          userData.email,
          userData.phone,
          testPassword,
          userData.role,
          true,
          true
        ]);

        const userId = userResult.rows[0].id;

        // Create profile
        await query(`
          INSERT INTO auth.profiles (user_id, first_name, last_name, business_name)
          VALUES ($1, $2, $3, $4)
        `, [userId, userData.firstName, userData.lastName, userData.businessName || null]);

        // Create supplier profile if needed
        if (userData.role === 'supplier') {
          await query(`
            INSERT INTO auth.supplier_profiles (
              user_id, business_registration_number, business_address,
              business_phone, business_email, description, service_areas,
              operating_hours, is_verified
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [
            userId,
            'RC123456789',
            '123 Business District, Lagos, Nigeria',
            userData.phone,
            userData.email,
            'Premium gas supplier serving Lagos and surrounding areas',
            ['Lagos', 'Ikeja', 'Victoria Island'],
            JSON.stringify({
              monday: { open: '08:00', close: '18:00' },
              tuesday: { open: '08:00', close: '18:00' },
              wednesday: { open: '08:00', close: '18:00' },
              thursday: { open: '08:00', close: '18:00' },
              friday: { open: '08:00', close: '18:00' },
              saturday: { open: '09:00', close: '16:00' },
              sunday: { closed: true }
            }),
            true
          ]);
        }

        // Create test address for household users
        if (userData.role === 'household') {
          await query(`
            INSERT INTO auth.addresses (
              user_id, label, address_line_1, city, state, country,
              latitude, longitude, is_default
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [
            userId,
            'Home',
            '456 Residential Street',
            'Lagos',
            'Lagos State',
            'Nigeria',
            6.5244, // Lagos coordinates
            3.3792,
            true
          ]);
        }

        logger.info(`Test user created: ${userData.email} (${userData.role})`);
      }

      console.log('\n👥 Test Users Created:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📧 household@test.com (password: test123) - Household User');
      console.log('📧 supplier@test.com (password: test123) - Gas Supplier');
      console.log('📧 driver@test.com (password: test123) - Delivery Driver');
      console.log('⚠️  These are test accounts for development only!');
    } catch (error) {
      logger.error('Failed to seed test users:', error);
      throw error;
    }
  }

  /**
   * Run all seeders
   */
  async runSeeders() {
    try {
      logger.info('Starting database seeding...');
      
      await this.seedAdminUser();
      await this.seedTestUsers();
      
      logger.info('Database seeding completed successfully');
    } catch (error) {
      logger.error('Database seeding failed:', error);
      throw error;
    }
  }

  /**
   * Clear all data (for testing)
   */
  async clearData() {
    try {
      logger.warn('Clearing all auth data...');
      
      await query('TRUNCATE auth.supplier_profiles CASCADE');
      await query('TRUNCATE auth.addresses CASCADE');
      await query('TRUNCATE auth.profiles CASCADE');
      await query('TRUNCATE auth.users CASCADE');
      
      logger.info('All auth data cleared');
    } catch (error) {
      logger.error('Failed to clear data:', error);
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
        
      case 'admin':
        await seeder.seedAdminUser();
        break;
        
      case 'test':
        await seeder.seedTestUsers();
        break;
        
      case 'run':
      default:
        await seeder.runSeeders();
        break;
    }
    
    process.exit(0);
  } catch (error) {
    logger.error('Seeding command failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = DatabaseSeeder;
