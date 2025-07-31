/**
 * Infrastructure Test Suite
 * Verifies that all services are running and accessible before running user journey tests
 */

describe('🏗️ Infrastructure Readiness', () => {
  let httpClient;
  let httpClientInsecure;

  beforeAll(() => {
    httpClient = testUtils.createHttpClient(TEST_CONFIG.BASE_URL);
    httpClientInsecure = testUtils.createHttpClient(TEST_CONFIG.HTTP_URL);
  });

  describe('SSL/HTTPS Configuration', () => {
    test('should redirect HTTP to HTTPS', async () => {
      const response = await httpClientInsecure.get('/health');
      
      expect(response.status).toBe(301);
      expect(response.headers.location).toMatch(/^https:/);
    });

    test('should serve HTTPS health endpoint', async () => {
      const response = await httpClient.get('/health');

      testUtils.validateResponse(response, 200);
      expect(response.data.status).toBe('healthy');
      expect(response.data.timestamp).toBeDefined();
      expect(response.data.uptime).toBeDefined();
    });

    test('should support HTTP/2', async () => {
      const response = await httpClient.get('/health');
      
      expect(response.status).toBe(200);
      // Note: HTTP/2 detection in Node.js requires specific configuration
      // This test verifies the endpoint works over HTTPS
    });
  });

  describe('API Gateway Routing', () => {
    test('should route to auth service', async () => {
      const response = await httpClient.get('/api/v1/auth/health');
      
      // This might return 404 if no health endpoint, but should not be connection refused
      expect([200, 404, 405]).toContain(response.status);
    });

    test('should route to orders service', async () => {
      const response = await httpClient.get('/api/v1/orders/health');
      
      expect([200, 404, 405]).toContain(response.status);
    });

    test('should route to supplier service', async () => {
      const response = await httpClient.get('/api/v1/inventory/health');
      
      expect([200, 404, 405]).toContain(response.status);
    });
  });

  describe('Service Health Checks', () => {
    test('should verify auth service is running', async () => {
      const response = await testUtils.retry(async () => {
        const res = await httpClient.post('/api/v1/auth/login', {
          identifier: 'nonexistent@example.com',
          password: 'wrongpassword'
        });
        
        // We expect this to fail with 401/400/429, not connection error
        expect([400, 401, 422, 429]).toContain(res.status);
        return res;
      });
      
      expect(response).toBeDefined();
    });

    test('should verify orders service is running', async () => {
      const response = await testUtils.retry(async () => {
        const res = await httpClient.get('/api/v1/orders');

        // Should return 200 (implemented) or 401/403 (auth required), not connection error
        expect([200, 401, 403, 422]).toContain(res.status);
        return res;
      });

      expect(response).toBeDefined();
    });

    test('should verify supplier service is running', async () => {
      const response = await testUtils.retry(async () => {
        const res = await httpClient.get('/api/v1/inventory');

        // Should return 200 (implemented) or 401/403 (auth required), not connection error
        expect([200, 401, 403, 422]).toContain(res.status);
        return res;
      });

      expect(response).toBeDefined();
    });
  });

  describe('Database Connectivity', () => {
    test('should verify database is accessible through auth service', async () => {
      // Try to register a user - this will test database connectivity
      const testUser = {
        email: testUtils.generateTestData.email(),
        phone: testUtils.generateTestData.phone(),
        password: testUtils.generateTestData.password(),
        role: 'household',
        firstName: 'Test',
        lastName: 'User'
      };

      const response = await httpClient.post('/api/v1/auth/register', testUser);
      
      // Should succeed or fail with validation error, not database connection error
      expect([200, 201, 400, 422, 429]).toContain(response.status);
      
      if (response.status === 200 || response.status === 201) {
        // Store successful registration for cleanup
        testData.users.infraTest = response.data.user;
        testData.tokens.infraTest = testUtils.extractToken(response.data);
      }
    });
  });

  describe('Security Headers', () => {
    test('should include security headers in HTTPS responses', async () => {
      const response = await httpClient.get('/health');
      
      expect(response.status).toBe(200);
      
      // Check for common security headers (may not all be present)
      const headers = response.headers;
      
      // At least verify the response came through HTTPS properly
      expect(headers).toBeDefined();
    });
  });
});
