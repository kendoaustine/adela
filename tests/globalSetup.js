/**
 * Global setup for Jest tests
 * Runs once before all test suites
 */

const axios = require('axios');

// Create HTTP client with optimized settings
const createOptimizedHttpClient = (baseURL = 'https://localhost') => {
  return axios.create({
    baseURL,
    timeout: 10000, // Reduced timeout for faster failure detection
    httpsAgent: new (require('https').Agent)({
      rejectUnauthorized: false, // Accept self-signed certificates
      keepAlive: true,           // Reuse connections
      maxSockets: 10,            // Limit concurrent connections
      maxFreeSockets: 5          // Keep some connections open
    }),
    httpAgent: new (require('http').Agent)({
      keepAlive: true,
      maxSockets: 10,
      maxFreeSockets: 5
    }),
    headers: {
      'User-Agent': 'GasConnect-E2E-Tests/1.0',
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  });
};

// Wait for services to be ready
const waitForServices = async () => {
  const services = [
    { name: 'API Gateway (HTTPS)', url: 'https://localhost/health' },
    { name: 'Auth Service', url: 'https://localhost/api/v1/auth/login' }
  ];

  console.log('🔍 Waiting for services to be ready...');
  
  for (const service of services) {
    let retries = 30; // 30 retries = 30 seconds max wait
    let ready = false;
    
    while (retries > 0 && !ready) {
      try {
        const client = createOptimizedHttpClient();
        const response = await client.get(service.url);
        
        if (response.status === 200 || response.status === 400 || response.status === 401) {
          console.log(`✅ ${service.name} is ready`);
          ready = true;
        }
      } catch (error) {
        retries--;
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    if (!ready) {
      console.warn(`⚠️  ${service.name} not ready after 30 seconds`);
    }
  }
};

// Pre-generate test data pool
const generateTestDataPool = () => {
  const testDataPool = {
    users: [],
    suppliers: [],
    orders: []
  };

  // Generate 50 unique users
  for (let i = 0; i < 50; i++) {
    testDataPool.users.push({
      email: `test-user-${i}-${Date.now()}@example.com`,
      phone: `+1555000${String(i).padStart(4, '0')}`,
      password: 'TestPassword123!',
      firstName: `TestUser${i}`,
      lastName: 'Generated',
      role: i % 3 === 0 ? 'supplier' : 'household'
    });
  }

  // Generate 20 suppliers
  for (let i = 0; i < 20; i++) {
    testDataPool.suppliers.push({
      businessName: `Test Supplier ${i}`,
      businessType: 'gas_distributor',
      taxId: `TAX${String(i).padStart(6, '0')}`,
      licenseNumber: `LIC${String(i).padStart(6, '0')}`,
      contactEmail: `supplier-${i}-${Date.now()}@example.com`,
      contactPhone: `+1555100${String(i).padStart(4, '0')}`
    });
  }

  // Store in global for tests to use
  global.TEST_DATA_POOL = testDataPool;
  console.log(`📊 Generated test data pool: ${testDataPool.users.length} users, ${testDataPool.suppliers.length} suppliers`);
};

module.exports = async () => {
  console.log('🚀 Starting global test setup...');
  
  try {
    // Wait for services to be ready
    await waitForServices();
    
    // Generate test data pool
    generateTestDataPool();
    
    // Create optimized HTTP clients for tests
    global.TEST_HTTP_CLIENT = createOptimizedHttpClient('https://localhost');
    global.TEST_HTTP_CLIENT_INSECURE = createOptimizedHttpClient('http://localhost');
    
    console.log('✅ Global test setup completed successfully');
    
  } catch (error) {
    console.error('❌ Global test setup failed:', error.message);
    throw error;
  }
};
