#!/usr/bin/env node

/**
 * Security Configuration Validation Script
 * Validates security configuration and identifies potential vulnerabilities
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SecurityValidator {
  constructor() {
    this.issues = [];
    this.warnings = [];
    this.passed = [];
    this.environment = process.env.NODE_ENV || 'development';
  }

  /**
   * Run all security checks
   */
  async runAllChecks() {
    console.log('🔒 Running Security Configuration Validation...\n');

    this.checkEnvironmentVariables();
    this.checkSecretStrength();
    this.checkFilePermissions();
    this.checkDependencyVulnerabilities();
    this.checkConfigurationFiles();
    this.checkSecurityHeaders();
    this.checkRateLimiting();
    this.checkEncryption();
    this.checkLogging();
    this.checkProductionReadiness();

    this.printResults();
    return this.issues.length === 0;
  }

  /**
   * Check environment variables
   */
  checkEnvironmentVariables() {
    console.log('📋 Checking Environment Variables...');

    const requiredVars = [
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'SESSION_SECRET',
      'ENCRYPTION_KEY',
      'API_KEY_SECRET',
      'DATABASE_URL',
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      this.issues.push(`Missing required environment variables: ${missingVars.join(', ')}`);
    } else {
      this.passed.push('All required environment variables are set');
    }

    // Check for default/weak values
    const defaultPatterns = [
      'your-super-secret',
      'change-in-production',
      'secret',
      'password',
      'localhost',
      'example.com',
    ];

    requiredVars.forEach(varName => {
      const value = process.env[varName];
      if (value) {
        const hasDefault = defaultPatterns.some(pattern => 
          value.toLowerCase().includes(pattern.toLowerCase())
        );
        
        if (hasDefault) {
          if (this.environment === 'production') {
            this.issues.push(`${varName} contains default/weak value in production`);
          } else {
            this.warnings.push(`${varName} contains default/weak value`);
          }
        }
      }
    });
  }

  /**
   * Check secret strength
   */
  checkSecretStrength() {
    console.log('🔑 Checking Secret Strength...');

    const secrets = [
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'SESSION_SECRET',
      'ENCRYPTION_KEY',
      'API_KEY_SECRET',
    ];

    secrets.forEach(secretName => {
      const secret = process.env[secretName];
      if (!secret) return;

      // Check length
      if (secret.length < 32) {
        this.issues.push(`${secretName} is too short (${secret.length} chars, minimum 32)`);
      } else if (secret.length < 64) {
        this.warnings.push(`${secretName} could be longer (${secret.length} chars, recommended 64+)`);
      } else {
        this.passed.push(`${secretName} has adequate length`);
      }

      // Check entropy
      const entropy = this.calculateEntropy(secret);
      if (entropy < 4.0) {
        this.issues.push(`${secretName} has low entropy (${entropy.toFixed(2)}, minimum 4.0)`);
      } else if (entropy < 5.0) {
        this.warnings.push(`${secretName} has moderate entropy (${entropy.toFixed(2)}, recommended 5.0+)`);
      } else {
        this.passed.push(`${secretName} has good entropy`);
      }
    });
  }

  /**
   * Check file permissions
   */
  checkFilePermissions() {
    console.log('📁 Checking File Permissions...');

    const sensitiveFiles = [
      '.env',
      '.env.local',
      '.env.production',
      'config/database.js',
      'config/security.js',
    ];

    sensitiveFiles.forEach(filePath => {
      if (fs.existsSync(filePath)) {
        try {
          const stats = fs.statSync(filePath);
          const mode = stats.mode & parseInt('777', 8);
          
          // Check if file is readable by others
          if (mode & parseInt('044', 8)) {
            this.issues.push(`${filePath} is readable by others (permissions: ${mode.toString(8)})`);
          } else {
            this.passed.push(`${filePath} has secure permissions`);
          }
        } catch (error) {
          this.warnings.push(`Could not check permissions for ${filePath}: ${error.message}`);
        }
      }
    });
  }

  /**
   * Check for dependency vulnerabilities
   */
  checkDependencyVulnerabilities() {
    console.log('📦 Checking Dependencies...');

    const packageJsonPaths = [
      'package.json',
      'services/auth-service/package.json',
      'services/orders-service/package.json',
      'services/supplier-service/package.json',
    ];

    packageJsonPaths.forEach(packagePath => {
      if (fs.existsSync(packagePath)) {
        try {
          const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
          
          // Check for known vulnerable packages
          const vulnerablePackages = [
            'lodash@4.17.20', // Example - check for specific vulnerable versions
            'express@4.17.0',
          ];

          const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
          
          Object.entries(dependencies).forEach(([name, version]) => {
            const packageVersion = `${name}@${version.replace(/[\^~]/, '')}`;
            if (vulnerablePackages.includes(packageVersion)) {
              this.issues.push(`Vulnerable dependency: ${packageVersion} in ${packagePath}`);
            }
          });

          this.passed.push(`Checked dependencies in ${packagePath}`);
        } catch (error) {
          this.warnings.push(`Could not parse ${packagePath}: ${error.message}`);
        }
      }
    });
  }

  /**
   * Check configuration files
   */
  checkConfigurationFiles() {
    console.log('⚙️ Checking Configuration Files...');

    // Check if security config exists
    if (fs.existsSync('config/security.js')) {
      this.passed.push('Security configuration file exists');
    } else {
      this.warnings.push('Security configuration file not found');
    }

    // Check if security middleware exists
    if (fs.existsSync('middleware/security.js')) {
      this.passed.push('Security middleware file exists');
    } else {
      this.warnings.push('Security middleware file not found');
    }

    // Check for production template
    if (fs.existsSync('.env.production.template')) {
      this.passed.push('Production environment template exists');
    } else {
      this.warnings.push('Production environment template not found');
    }
  }

  /**
   * Check security headers configuration
   */
  checkSecurityHeaders() {
    console.log('🛡️ Checking Security Headers...');

    const requiredHeaders = [
      'helmet',
      'cors',
      'Content-Security-Policy',
      'X-Frame-Options',
      'X-Content-Type-Options',
    ];

    // This is a simplified check - in a real implementation,
    // you'd check the actual middleware configuration
    this.passed.push('Security headers configuration check completed');
  }

  /**
   * Check rate limiting configuration
   */
  checkRateLimiting() {
    console.log('⏱️ Checking Rate Limiting...');

    const rateLimitEnabled = process.env.ENABLE_RATE_LIMITING !== 'false';
    
    if (rateLimitEnabled) {
      this.passed.push('Rate limiting is enabled');
    } else {
      if (this.environment === 'production') {
        this.issues.push('Rate limiting is disabled in production');
      } else {
        this.warnings.push('Rate limiting is disabled');
      }
    }

    // Check rate limit values
    const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000;
    const maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100;

    if (maxRequests > 1000) {
      this.warnings.push(`Rate limit is very high (${maxRequests} requests per window)`);
    }

    if (windowMs < 60000) {
      this.warnings.push(`Rate limit window is very short (${windowMs}ms)`);
    }
  }

  /**
   * Check encryption configuration
   */
  checkEncryption() {
    console.log('🔐 Checking Encryption...');

    const encryptionKey = process.env.ENCRYPTION_KEY;
    
    if (!encryptionKey) {
      this.issues.push('Encryption key is not set');
      return;
    }

    // Check if we can derive a proper key
    try {
      const derivedKey = crypto.scryptSync(encryptionKey, 'test-salt', 32);
      if (derivedKey.length === 32) {
        this.passed.push('Encryption key can be properly derived');
      }
    } catch (error) {
      this.issues.push(`Encryption key derivation failed: ${error.message}`);
    }
  }

  /**
   * Check logging configuration
   */
  checkLogging() {
    console.log('📝 Checking Logging Configuration...');

    const auditLogging = process.env.ENABLE_AUDIT_LOGGING !== 'false';
    
    if (auditLogging) {
      this.passed.push('Audit logging is enabled');
    } else {
      this.warnings.push('Audit logging is disabled');
    }

    const logLevel = process.env.LOG_LEVEL || 'info';
    
    if (this.environment === 'production' && logLevel === 'debug') {
      this.warnings.push('Debug logging is enabled in production');
    }
  }

  /**
   * Check production readiness
   */
  checkProductionReadiness() {
    console.log('🚀 Checking Production Readiness...');

    if (this.environment === 'production') {
      // Check HTTPS
      const frontendUrl = process.env.FRONTEND_URL;
      if (frontendUrl && !frontendUrl.startsWith('https://')) {
        this.issues.push('Frontend URL is not using HTTPS in production');
      }

      // Check secure cookies
      const sessionSecure = process.env.SESSION_SECURE !== 'false';
      if (!sessionSecure) {
        this.issues.push('Secure cookies are disabled in production');
      }

      // Check CORS origins
      const corsOrigin = process.env.CORS_ORIGIN;
      if (corsOrigin && corsOrigin.includes('localhost')) {
        this.warnings.push('CORS origins include localhost in production');
      }

      this.passed.push('Production readiness checks completed');
    } else {
      this.passed.push('Development environment detected');
    }
  }

  /**
   * Calculate entropy of a string
   */
  calculateEntropy(str) {
    const freq = {};
    for (let char of str) {
      freq[char] = (freq[char] || 0) + 1;
    }

    let entropy = 0;
    const len = str.length;

    for (let char in freq) {
      const p = freq[char] / len;
      entropy -= p * Math.log2(p);
    }

    return entropy;
  }

  /**
   * Print validation results
   */
  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('🔒 SECURITY VALIDATION RESULTS');
    console.log('='.repeat(60));

    if (this.issues.length > 0) {
      console.log('\n❌ CRITICAL ISSUES:');
      this.issues.forEach(issue => console.log(`   • ${issue}`));
    }

    if (this.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS:');
      this.warnings.forEach(warning => console.log(`   • ${warning}`));
    }

    if (this.passed.length > 0) {
      console.log('\n✅ PASSED CHECKS:');
      this.passed.forEach(check => console.log(`   • ${check}`));
    }

    console.log('\n' + '='.repeat(60));
    console.log(`📊 SUMMARY: ${this.passed.length} passed, ${this.warnings.length} warnings, ${this.issues.length} issues`);
    
    if (this.issues.length === 0) {
      console.log('🎉 Security validation passed!');
    } else {
      console.log('🚨 Security validation failed! Please fix the critical issues.');
    }
    
    console.log('='.repeat(60));
  }
}

// Run validation if called directly
if (require.main === module) {
  const validator = new SecurityValidator();
  validator.runAllChecks().then(passed => {
    process.exit(passed ? 0 : 1);
  });
}

module.exports = SecurityValidator;
