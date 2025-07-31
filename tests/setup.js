// Global test setup for GasConnect E2E tests
const axios = require('axios');

// Global configuration
global.TEST_CONFIG = {
  BASE_URL: 'https://localhost',
  HTTP_URL: 'http://localhost',
  TIMEOUT: 30000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000
};

// Global test utilities
global.testUtils = {
  // Wait for a specified amount of time
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Retry a function with exponential backoff
  retry: async (fn, attempts = 3, delay = 1000) => {
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === attempts - 1) throw error;
        await global.testUtils.sleep(delay * Math.pow(2, i));
      }
    }
  },
  
  // Create axios instance with SSL disabled for testing
  createHttpClient: (baseURL = global.TEST_CONFIG.BASE_URL) => {
    return axios.create({
      baseURL,
      timeout: global.TEST_CONFIG.TIMEOUT,
      httpsAgent: new (require('https').Agent)({
        rejectUnauthorized: false // Accept self-signed certificates
      }),
      maxRedirects: 0, // Don't follow redirects - important for testing redirects
      validateStatus: () => true // Don't throw on HTTP error status
    });
  },
  
  // Generate random test data
  generateTestData: {
    email: () => `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@example.com`,
    phone: () => `+234${Math.floor(Math.random() * 9000000000) + 1000000000}`,
    password: () => 'TestPass123!',
    businessName: () => `Test Business ${Date.now()}`,
    address: () => ({
      street: `${Math.floor(Math.random() * 999) + 1} Test Street`,
      city: 'Lagos',
      state: 'Lagos',
      country: 'Nigeria',
      postalCode: `${Math.floor(Math.random() * 90000) + 10000}`
    })
  },
  
  // Validate response structure
  validateResponse: (response, expectedStatus = 200) => {
    expect(response.status).toBe(expectedStatus);
    expect(response.data).toBeDefined();
    return response.data;
  },
  
  // Extract JWT token from login response
  extractToken: (loginResponse) => {
    expect(loginResponse.tokens).toBeDefined();
    expect(loginResponse.tokens.accessToken).toBeDefined();
    return loginResponse.tokens.accessToken;
  },
  
  // Create authorization header
  createAuthHeader: (token) => ({
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  })
};

// Global test data storage
global.testData = {
  users: {},
  tokens: {},
  orders: {},
  suppliers: {}
};

// Setup and teardown hooks
beforeAll(async () => {
  console.log('🚀 Starting GasConnect E2E Test Suite');
  console.log(`Testing against: ${global.TEST_CONFIG.BASE_URL}`);
  
  // Wait for services to be ready
  await global.testUtils.sleep(5000);
});

afterAll(async () => {
  console.log('✅ GasConnect E2E Test Suite completed');
  
  // Cleanup any test data if needed
  global.testData = { users: {}, tokens: {}, orders: {}, suppliers: {} };
});
