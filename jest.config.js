module.exports = {
  testEnvironment: 'node',
  testTimeout: 30000, // Reduced from 60000 for faster failure detection
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  globalSetup: '<rootDir>/tests/globalSetup.js',
  globalTeardown: '<rootDir>/tests/globalTeardown.js',
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/tests/**/*.spec.js'
  ],
  collectCoverageFrom: [
    'services/**/*.js',
    '!services/**/node_modules/**',
    '!services/**/coverage/**',
    '!services/**/dist/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
  maxWorkers: process.env.CI ? 1 : '50%', // Use 50% of cores locally, sequential in CI
  maxConcurrency: 5, // Limit concurrent tests
  testSequencer: '<rootDir>/tests/testSequencer.js',
  // Global variables for tests
  globals: {
    'TEST_CONFIG': {
      'BASE_URL': process.env.TEST_CONFIG_BASE_URL || 'https://localhost',
      'HTTP_URL': process.env.TEST_CONFIG_HTTP_URL || 'http://localhost',
      'TIMEOUT': parseInt(process.env.TEST_CONFIG_TIMEOUT) || 30000
    }
  }
};
