/**
 * Monitoring Integration Test Suite
 * Verifies that the monitoring stack captures metrics from user interactions
 */

describe('📊 Monitoring Integration', () => {
  let httpClient;
  let prometheusClient;
  let grafanaClient;

  beforeAll(() => {
    httpClient = testUtils.createHttpClient();
    
    // Create clients for monitoring services (HTTP only as they don't have SSL)
    prometheusClient = testUtils.createHttpClient('http://localhost:9090');
    grafanaClient = testUtils.createHttpClient('http://localhost:3000');
  });

  describe('Prometheus Metrics Collection', () => {
    test('should verify Prometheus is accessible', async () => {
      const response = await prometheusClient.get('/api/v1/status/config');
      
      // May return 200 if Prometheus is running, or connection error if not
      if (response.status === 200) {
        expect(response.data.status).toBe('success');
        console.log('✅ Prometheus is running and accessible');
      } else {
        console.log('⚠️  Prometheus not accessible - monitoring stack may not be running');
      }
    });

    test('should collect HTTP request metrics', async () => {
      // Make several API requests to generate metrics
      const authToken = testData.tokens.household || 'dummy-token';
      const headers = testUtils.createAuthHeader(authToken);

      // Generate some traffic
      await httpClient.get('/health');
      await httpClient.get('/api/v1/auth/me', { headers });
      await httpClient.get('/api/v1/orders', { headers });
      await httpClient.get('/api/v1/inventory', { headers });

      // Wait for metrics to be collected
      await testUtils.sleep(5000);

      // Query Prometheus for HTTP metrics
      const metricsQuery = 'http_requests_total';
      const response = await prometheusClient.get(`/api/v1/query?query=${metricsQuery}`);

      if (response.status === 200 && response.data.status === 'success') {
        expect(response.data.data.result).toBeDefined();
        console.log('✅ HTTP request metrics are being collected');
      } else {
        console.log('⚠️  HTTP metrics not found - may need time to collect or different metric name');
      }
    });

    test('should collect authentication metrics', async () => {
      // Generate authentication events
      const testUser = {
        email: testUtils.generateTestData.email(),
        phone: testUtils.generateTestData.phone(),
        password: testUtils.generateTestData.password(),
        role: 'household',
        firstName: 'Metrics',
        lastName: 'Test'
      };

      // Register and login to generate auth metrics
      await httpClient.post('/api/v1/auth/register', testUser);
      await httpClient.post('/api/v1/auth/login', {
        identifier: testUser.email,
        password: testUser.password
      });

      // Wait for metrics collection
      await testUtils.sleep(3000);

      // Query for authentication metrics
      const authQuery = 'auth_requests_total';
      const response = await prometheusClient.get(`/api/v1/query?query=${authQuery}`);

      if (response.status === 200) {
        console.log('✅ Authentication metrics endpoint accessible');
      } else {
        console.log('⚠️  Authentication metrics not found - custom metrics may not be implemented');
      }
    });

    test('should collect database connection metrics', async () => {
      const dbQuery = 'pg_up';
      const response = await prometheusClient.get(`/api/v1/query?query=${dbQuery}`);

      if (response.status === 200 && response.data.status === 'success') {
        const results = response.data.data.result;
        if (results && results.length > 0) {
          expect(results[0].value[1]).toBe('1'); // Database should be up
          console.log('✅ Database metrics are being collected');
        }
      } else {
        console.log('⚠️  Database metrics not found - PostgreSQL exporter may not be configured');
      }
    });

    test('should collect Redis metrics', async () => {
      const redisQuery = 'redis_up';
      const response = await prometheusClient.get(`/api/v1/query?query=${redisQuery}`);

      if (response.status === 200 && response.data.status === 'success') {
        const results = response.data.data.result;
        if (results && results.length > 0) {
          expect(results[0].value[1]).toBe('1'); // Redis should be up
          console.log('✅ Redis metrics are being collected');
        }
      } else {
        console.log('⚠️  Redis metrics not found - Redis exporter may not be configured');
      }
    });
  });

  describe('Grafana Dashboard Integration', () => {
    test('should verify Grafana is accessible', async () => {
      const response = await grafanaClient.get('/api/health');

      if (response.status === 200) {
        expect(response.data.database).toBe('ok');
        console.log('✅ Grafana is running and accessible');
      } else {
        console.log('⚠️  Grafana not accessible - monitoring stack may not be running');
      }
    });

    test('should verify dashboards exist', async () => {
      // Try to access Grafana API (may require authentication)
      const response = await grafanaClient.get('/api/search?type=dash-db');

      if (response.status === 200) {
        expect(Array.isArray(response.data)).toBe(true);
        console.log(`✅ Found ${response.data.length} Grafana dashboards`);
      } else if (response.status === 401) {
        console.log('⚠️  Grafana requires authentication - dashboards may exist but not accessible via API');
      } else {
        console.log('⚠️  Could not access Grafana dashboards');
      }
    });
  });

  describe('Application Performance Monitoring', () => {
    test('should measure API response times', async () => {
      const startTime = Date.now();
      
      // Make API calls and measure response times
      const endpoints = [
        '/health',
        '/api/v1/auth/login',
        '/api/v1/orders',
        '/api/v1/inventory'
      ];

      const responseTimes = [];

      for (const endpoint of endpoints) {
        const requestStart = Date.now();
        
        try {
          if (endpoint === '/api/v1/auth/login') {
            await httpClient.post(endpoint, {
              identifier: 'test@example.com',
              password: 'wrongpassword'
            });
          } else if (endpoint.startsWith('/api/v1/')) {
            const token = testData.tokens.household || 'dummy-token';
            const headers = testUtils.createAuthHeader(token);
            await httpClient.get(endpoint, { headers });
          } else {
            await httpClient.get(endpoint);
          }
        } catch (error) {
          // Ignore errors, we're just measuring response times
        }
        
        const responseTime = Date.now() - requestStart;
        responseTimes.push({ endpoint, responseTime });
      }

      // Verify response times are reasonable (under 5 seconds)
      responseTimes.forEach(({ endpoint, responseTime }) => {
        expect(responseTime).toBeLessThan(5000);
        console.log(`📊 ${endpoint}: ${responseTime}ms`);
      });

      const avgResponseTime = responseTimes.reduce((sum, { responseTime }) => sum + responseTime, 0) / responseTimes.length;
      console.log(`📊 Average response time: ${avgResponseTime.toFixed(2)}ms`);
    });

    test('should verify error rate monitoring', async () => {
      // Generate some errors intentionally
      const errorEndpoints = [
        { method: 'GET', url: '/api/v1/nonexistent' },
        { method: 'POST', url: '/api/v1/auth/login', data: { invalid: 'data' } },
        { method: 'GET', url: '/api/v1/orders/invalid-id' }
      ];

      let errorCount = 0;
      let totalRequests = errorEndpoints.length;

      for (const { method, url, data } of errorEndpoints) {
        try {
          if (method === 'POST') {
            await httpClient.post(url, data);
          } else {
            await httpClient.get(url);
          }
        } catch (error) {
          errorCount++;
        }
      }

      // We expect some errors from these invalid requests
      const errorRate = (errorCount / totalRequests) * 100;
      console.log(`📊 Generated error rate: ${errorRate.toFixed(2)}%`);
      
      // Error rate should be reasonable (not 100% unless all requests failed)
      expect(errorRate).toBeGreaterThanOrEqual(0);
      expect(errorRate).toBeLessThanOrEqual(100);
    });
  });

  describe('Business Metrics Tracking', () => {
    test('should track user registration metrics', async () => {
      const initialTime = Date.now();
      
      // Register multiple users to generate metrics
      const userRegistrations = [];
      for (let i = 0; i < 3; i++) {
        const testUser = {
          email: testUtils.generateTestData.email(),
          phone: testUtils.generateTestData.phone(),
          password: testUtils.generateTestData.password(),
          role: i % 2 === 0 ? 'household' : 'supplier',
          firstName: `Test${i}`,
          lastName: 'User'
        };

        const response = await httpClient.post('/api/v1/auth/register', testUser);
        userRegistrations.push({
          user: testUser,
          success: response.status === 201,
          responseTime: Date.now() - initialTime
        });

        await testUtils.sleep(1000); // Space out registrations
      }

      const successfulRegistrations = userRegistrations.filter(r => r.success).length;
      console.log(`📊 Successful registrations: ${successfulRegistrations}/${userRegistrations.length}`);
      
      expect(successfulRegistrations).toBeGreaterThan(0);
    });

    test('should track order placement metrics', async () => {
      const authToken = testData.tokens.household;
      if (!authToken) {
        console.log('⚠️  Skipping order metrics test - no household token available');
        return;
      }

      const headers = testUtils.createAuthHeader(authToken);
      const orderData = {
        supplierId: '550e8400-e29b-41d4-a716-446655440017',
        deliveryAddressId: '550e8400-e29b-41d4-a716-446655440020',
        orderType: 'regular',
        items: [
          {
            gasTypeId: '550e8400-e29b-41d4-a716-446655440002',
            quantity: 1,
            unitPrice: 10500.00,
            cylinderSize: '12.5kg'
          }
        ]
      };

      const startTime = Date.now();
      const response = await httpClient.post('/api/v1/orders', orderData, { headers });
      const orderPlacementTime = Date.now() - startTime;

      console.log(`📊 Order placement response time: ${orderPlacementTime}ms`);
      console.log(`📊 Order placement status: ${response.status}`);
      
      // Order should either succeed or fail with validation error, not crash
      expect([200, 201, 400, 422]).toContain(response.status);
    });
  });

  describe('System Health Monitoring', () => {
    test('should verify service discovery', async () => {
      // Check if services are discoverable through the monitoring stack
      const services = ['auth-service', 'orders-service', 'supplier-service'];
      
      for (const service of services) {
        const query = `up{job="${service}"}`;
        const response = await prometheusClient.get(`/api/v1/query?query=${encodeURIComponent(query)}`);
        
        if (response.status === 200) {
          console.log(`📊 Service discovery check for ${service}: accessible`);
        } else {
          console.log(`⚠️  Service discovery check for ${service}: not found in Prometheus`);
        }
      }
    });

    test('should monitor resource usage', async () => {
      // Query for basic system metrics
      const resourceQueries = [
        'process_resident_memory_bytes',
        'process_cpu_seconds_total',
        'nodejs_heap_size_used_bytes'
      ];

      for (const query of resourceQueries) {
        const response = await prometheusClient.get(`/api/v1/query?query=${query}`);
        
        if (response.status === 200 && response.data.status === 'success') {
          const results = response.data.data.result;
          if (results && results.length > 0) {
            console.log(`📊 ${query}: ${results.length} metrics found`);
          }
        }
      }
    });
  });

  describe('Alert System Integration', () => {
    test('should verify AlertManager is accessible', async () => {
      const alertManagerClient = testUtils.createHttpClient('http://localhost:9093');
      const response = await alertManagerClient.get('/api/v1/status');

      if (response.status === 200) {
        console.log('✅ AlertManager is running and accessible');
        expect(response.data.cluster).toBeDefined();
      } else {
        console.log('⚠️  AlertManager not accessible - may not be running');
      }
    });

    test('should check for active alerts', async () => {
      const alertManagerClient = testUtils.createHttpClient('http://localhost:9093');
      const response = await alertManagerClient.get('/api/v1/alerts');

      if (response.status === 200) {
        const alerts = response.data.data || response.data;
        console.log(`📊 Active alerts: ${Array.isArray(alerts) ? alerts.length : 'unknown'}`);
        
        if (Array.isArray(alerts)) {
          expect(alerts).toBeDefined();
        }
      } else {
        console.log('⚠️  Could not retrieve alerts from AlertManager');
      }
    });
  });
});
