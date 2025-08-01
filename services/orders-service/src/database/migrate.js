#!/usr/bin/env node

/**
 * Database migration runner for Orders Service
 */

const fs = require('fs').promises;
const path = require('path');
const { query } = require('./connection');
const logger = require('../utils/logger');

class MigrationRunner {
  constructor() {
    this.migrationsDir = path.join(__dirname, 'migrations');
    this.migrationTable = 'orders.migrations';
  }

  /**
   * Initialize migration system
   */
  async initialize() {
    try {
      // Create orders schema if it doesn't exist
      await query('CREATE SCHEMA IF NOT EXISTS orders');
      
      // Create migrations table if it doesn't exist
      await query(`
        CREATE TABLE IF NOT EXISTS ${this.migrationTable} (
          id SERIAL PRIMARY KEY,
          filename VARCHAR(255) NOT NULL UNIQUE,
          executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          checksum VARCHAR(64) NOT NULL
        )
      `);

      logger.info('Orders migration system initialized');
    } catch (error) {
      logger.error('Failed to initialize orders migration system:', error);
      throw error;
    }
  }

  /**
   * Get list of migration files
   */
  async getMigrationFiles() {
    try {
      const files = await fs.readdir(this.migrationsDir);
      return files
        .filter(file => file.endsWith('.sql'))
        .sort(); // Ensure migrations run in order
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.warn('Orders migrations directory not found, creating it...');
        await fs.mkdir(this.migrationsDir, { recursive: true });
        return [];
      }
      throw error;
    }
  }

  /**
   * Get executed migrations from database
   */
  async getExecutedMigrations() {
    try {
      const result = await query(`SELECT filename FROM ${this.migrationTable} ORDER BY id`);
      return result.rows.map(row => row.filename);
    } catch (error) {
      logger.error('Failed to get executed orders migrations:', error);
      throw error;
    }
  }

  /**
   * Calculate file checksum
   */
  async calculateChecksum(filePath) {
    const crypto = require('crypto');
    const content = await fs.readFile(filePath, 'utf8');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Execute a single migration
   */
  async executeMigration(filename) {
    const filePath = path.join(this.migrationsDir, filename);
    
    try {
      logger.info(`Executing orders migration: ${filename}`);
      
      const content = await fs.readFile(filePath, 'utf8');
      const checksum = await this.calculateChecksum(filePath);
      
      // Execute migration in a transaction
      await query('BEGIN');
      
      try {
        // Execute the migration SQL
        await query(content);
        
        // Record the migration
        await query(
          `INSERT INTO ${this.migrationTable} (filename, checksum) VALUES ($1, $2)`,
          [filename, checksum]
        );
        
        await query('COMMIT');
        logger.info(`Orders migration completed: ${filename}`);
      } catch (error) {
        await query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error(`Orders migration failed: ${filename}`, error);
      throw error;
    }
  }

  /**
   * Run all pending migrations
   */
  async runMigrations() {
    try {
      await this.initialize();
      
      const migrationFiles = await this.getMigrationFiles();
      const executedMigrations = await this.getExecutedMigrations();
      
      const pendingMigrations = migrationFiles.filter(
        file => !executedMigrations.includes(file)
      );
      
      if (pendingMigrations.length === 0) {
        logger.info('No pending orders migrations');
        return;
      }
      
      logger.info(`Found ${pendingMigrations.length} pending orders migrations`);
      
      for (const migration of pendingMigrations) {
        await this.executeMigration(migration);
      }
      
      logger.info('All orders migrations completed successfully');
    } catch (error) {
      logger.error('Orders migration process failed:', error);
      throw error;
    }
  }

  /**
   * Create a new migration file
   */
  async createMigration(name) {
    try {
      const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
      const filename = `${timestamp}_${name.replace(/\s+/g, '_').toLowerCase()}.sql`;
      const filePath = path.join(this.migrationsDir, filename);
      
      const template = `-- Migration: ${name}
-- Created: ${new Date().toISOString()}

-- Add your orders migration SQL here
-- Example:
-- CREATE TABLE IF NOT EXISTS orders.example_table (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   order_id UUID NOT NULL REFERENCES orders.orders(id),
--   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
-- );

-- Remember to:
-- 1. Use IF NOT EXISTS for CREATE statements
-- 2. Use transactions for complex operations
-- 3. Add proper indexes
-- 4. Include rollback instructions in comments if needed
`;

      await fs.mkdir(this.migrationsDir, { recursive: true });
      await fs.writeFile(filePath, template);
      
      logger.info(`Created orders migration file: ${filename}`);
      return filename;
    } catch (error) {
      logger.error('Failed to create orders migration:', error);
      throw error;
    }
  }

  /**
   * Show migration status
   */
  async showStatus() {
    try {
      await this.initialize();
      
      const migrationFiles = await this.getMigrationFiles();
      const executedMigrations = await this.getExecutedMigrations();
      
      console.log('\n📊 Orders Migration Status:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      if (migrationFiles.length === 0) {
        console.log('No orders migration files found');
        return;
      }
      
      migrationFiles.forEach(file => {
        const status = executedMigrations.includes(file) ? '✅ Executed' : '⏳ Pending';
        console.log(`${status} ${file}`);
      });
      
      const pendingCount = migrationFiles.length - executedMigrations.length;
      console.log(`\nTotal: ${migrationFiles.length} migrations, ${pendingCount} pending`);
    } catch (error) {
      logger.error('Failed to show orders migration status:', error);
      throw error;
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  const runner = new MigrationRunner();
  
  try {
    switch (command) {
      case 'create':
        const name = args.slice(1).join(' ');
        if (!name) {
          console.error('Usage: node migrate.js create <migration_name>');
          process.exit(1);
        }
        await runner.createMigration(name);
        break;
        
      case 'status':
        await runner.showStatus();
        break;
        
      case 'run':
      default:
        await runner.runMigrations();
        break;
    }
    
    process.exit(0);
  } catch (error) {
    logger.error('Orders migration command failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = MigrationRunner;
