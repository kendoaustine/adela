#!/usr/bin/env node

/**
 * Database migration runner for Auth Service
 */

const fs = require('fs').promises;
const path = require('path');
const { query } = require('./connection');
const logger = require('../utils/logger');

class MigrationRunner {
  constructor() {
    this.migrationsDir = path.join(__dirname, 'migrations');
    this.migrationTable = 'auth.migrations';
  }

  /**
   * Initialize migration system
   */
  async initialize() {
    try {
      // Create migrations table if it doesn't exist
      await query(`
        CREATE TABLE IF NOT EXISTS ${this.migrationTable} (
          id SERIAL PRIMARY KEY,
          filename VARCHAR(255) NOT NULL UNIQUE,
          executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          checksum VARCHAR(64) NOT NULL
        )
      `);

      logger.info('Migration system initialized');
    } catch (error) {
      logger.error('Failed to initialize migration system:', error);
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
        logger.warn('Migrations directory not found, creating it...');
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
      logger.error('Failed to get executed migrations:', error);
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
      logger.info(`Executing migration: ${filename}`);
      
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
        logger.info(`Migration completed: ${filename}`);
      } catch (error) {
        await query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error(`Migration failed: ${filename}`, error);
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
        logger.info('No pending migrations');
        return;
      }
      
      logger.info(`Found ${pendingMigrations.length} pending migrations`);
      
      for (const migration of pendingMigrations) {
        await this.executeMigration(migration);
      }
      
      logger.info('All migrations completed successfully');
    } catch (error) {
      logger.error('Migration process failed:', error);
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

-- Add your migration SQL here
-- Example:
-- CREATE TABLE IF NOT EXISTS auth.example_table (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   name VARCHAR(255) NOT NULL,
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
      
      logger.info(`Created migration file: ${filename}`);
      return filename;
    } catch (error) {
      logger.error('Failed to create migration:', error);
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
      
      console.log('\n📊 Migration Status:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      if (migrationFiles.length === 0) {
        console.log('No migration files found');
        return;
      }
      
      migrationFiles.forEach(file => {
        const status = executedMigrations.includes(file) ? '✅ Executed' : '⏳ Pending';
        console.log(`${status} ${file}`);
      });
      
      const pendingCount = migrationFiles.length - executedMigrations.length;
      console.log(`\nTotal: ${migrationFiles.length} migrations, ${pendingCount} pending`);
    } catch (error) {
      logger.error('Failed to show migration status:', error);
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
    logger.error('Migration command failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = MigrationRunner;
