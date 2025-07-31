/**
 * Global teardown for Jest tests
 * Runs once after all test suites complete
 */

module.exports = async () => {
  console.log('🧹 Starting global test teardown...');
  
  try {
    // Clean up global variables
    if (global.TEST_HTTP_CLIENT) {
      delete global.TEST_HTTP_CLIENT;
    }
    
    if (global.TEST_HTTP_CLIENT_INSECURE) {
      delete global.TEST_HTTP_CLIENT_INSECURE;
    }
    
    if (global.TEST_DATA_POOL) {
      delete global.TEST_DATA_POOL;
    }
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    console.log('✅ Global test teardown completed');
    
  } catch (error) {
    console.error('❌ Global test teardown failed:', error.message);
  }
};
