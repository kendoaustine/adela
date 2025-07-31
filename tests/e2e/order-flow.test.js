const request = require('supertest');
const { Pool } = require('pg');

// Test configuration
const TEST_CONFIG = {
  api_gateway_url: process.env.API_GATEWAY_URL || 'http://localhost:80',
  database_url: process.env.TEST_DATABASE_URL || 'postgresql://gasconnect:gasconnect_password@localhost:5432/gasconnect_test',
};

describe('End-to-End Order Flow Tests', () => {
  let dbPool;
  let customerTokens;
  let supplierTokens;
  let driverTokens;
  let testOrder;
  let testSupplier;
  let testCustomer;

  beforeAll(async () => {
    // Setup test database connection
    dbPool = new Pool({ connectionString: TEST_CONFIG.database_url });
    
    // Clean up test data
    await dbPool.query('DELETE FROM auth.users WHERE email LIKE %e2e.test%');
    
    // Create test users
    await createTestUsers();
  });

  afterAll(async () => {
    // Cleanup test data
    if (testOrder) {
      await dbPool.query('DELETE FROM orders.orders WHERE id = $1', [testOrder.id]);
    }
    await dbPool.query('DELETE FROM auth.users WHERE email LIKE %e2e.test%');
    await dbPool.end();
  });

  async function createTestUsers() {
    // Create customer
    const customerResponse = await request(TEST_CONFIG.api_gateway_url)
      .post('/api/v1/auth/register')
      .send({
        email: 'e2e.test.customer@example.com',
        phone: '+2348012345690',
        password: 'SecurePass123!',
        role: 'household',
        firstName: 'E2E',
        lastName: 'Customer',
      })
      .expect(201);

    testCustomer = customerResponse.body.user;
    customerTokens = customerResponse.body.tokens;

    // Create supplier
    const supplierResponse = await request(TEST_CONFIG.api_gateway_url)
      .post('/api/v1/auth/register')
      .send({
        email: 'e2e.test.supplier@example.com',
        phone: '+2348012345691',
        password: 'SecurePass123!',
        role: 'supplier',
        firstName: 'E2E',
        lastName: 'Supplier',
        businessName: 'E2E Gas Supply Ltd',
      })
      .expect(201);

    testSupplier = supplierResponse.body.user;
    supplierTokens = supplierResponse.body.tokens;

    // Create delivery driver
    const driverResponse = await request(TEST_CONFIG.api_gateway_url)
      .post('/api/v1/auth/register')
      .send({
        email: 'e2e.test.driver@example.com',
        phone: '+2348012345692',
        password: 'SecurePass123!',
        role: 'delivery_driver',
        firstName: 'E2E',
        lastName: 'Driver',
      })
      .expect(201);

    driverTokens = driverResponse.body.tokens;

    // Add customer address
    await request(TEST_CONFIG.api_gateway_url)
      .post('/api/v1/addresses')
      .set('Authorization', `Bearer ${customerTokens.accessToken}`)
      .send({
        label: 'Home',
        addressLine1: '123 Test Street',
        city: 'Lagos',
        state: 'Lagos State',
        country: 'Nigeria',
        latitude: 6.5244,
        longitude: 3.3792,
        isDefault: true,
      })
      .expect(201);

    // Add supplier address
    await request(TEST_CONFIG.api_gateway_url)
      .post('/api/v1/addresses')
      .set('Authorization', `Bearer ${supplierTokens.accessToken}`)
      .send({
        label: 'Warehouse',
        addressLine1: '456 Industrial Estate',
        city: 'Lagos',
        state: 'Lagos State',
        country: 'Nigeria',
        latitude: 6.5833,
        longitude: 3.3333,
        isDefault: true,
      })
      .expect(201);

    // Add supplier inventory
    await request(TEST_CONFIG.api_gateway_url)
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${supplierTokens.accessToken}`)
      .send({
        gasTypeId: '550e8400-e29b-41d4-a716-446655440002', // Cooking Gas
        cylinderSize: '12.5kg',
        quantityAvailable: 100,
        reorderLevel: 10,
        unitCost: 8000.00,
      })
      .expect(201);

    // Add supplier pricing
    await request(TEST_CONFIG.api_gateway_url)
      .post('/api/v1/pricing')
      .set('Authorization', `Bearer ${supplierTokens.accessToken}`)
      .send({
        gasTypeId: '550e8400-e29b-41d4-a716-446655440002',
        cylinderSize: '12.5kg',
        basePrice: 10500.00,
        deliveryFee: 1500.00,
      })
      .expect(201);
  }

  describe('Complete Order Flow', () => {
    test('1. Customer creates a regular order', async () => {
      // Get customer addresses
      const addressResponse = await request(TEST_CONFIG.api_gateway_url)
        .get('/api/v1/addresses')
        .set('Authorization', `Bearer ${customerTokens.accessToken}`)
        .expect(200);

      const deliveryAddress = addressResponse.body.find(addr => addr.isDefault);

      // Create order
      const orderData = {
        supplierId: testSupplier.id,
        deliveryAddressId: deliveryAddress.id,
        orderType: 'regular',
        items: [
          {
            gasTypeId: '550e8400-e29b-41d4-a716-446655440002',
            quantity: 2,
            unitPrice: 10500.00,
            cylinderSize: '12.5kg',
          },
        ],
        specialInstructions: 'Please call before delivery',
      };

      const response = await request(TEST_CONFIG.api_gateway_url)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerTokens.accessToken}`)
        .send(orderData)
        .expect(201);

      expect(response.body).toHaveProperty('order');
      expect(response.body.order.status).toBe('pending');
      expect(response.body.order.userId).toBe(testCustomer.id);
      expect(response.body.order.supplierId).toBe(testSupplier.id);

      testOrder = response.body.order;
    });

    test('2. Supplier confirms the order', async () => {
      const response = await request(TEST_CONFIG.api_gateway_url)
        .put(`/api/v1/orders/${testOrder.id}/status`)
        .set('Authorization', `Bearer ${supplierTokens.accessToken}`)
        .send({
          status: 'confirmed',
          reason: 'Order confirmed and being prepared',
        })
        .expect(200);

      expect(response.body.order.status).toBe('confirmed');
    });

    test('3. Supplier updates order to preparing', async () => {
      const response = await request(TEST_CONFIG.api_gateway_url)
        .put(`/api/v1/orders/${testOrder.id}/status`)
        .set('Authorization', `Bearer ${supplierTokens.accessToken}`)
        .send({
          status: 'preparing',
          reason: 'Order is being prepared for delivery',
        })
        .expect(200);

      expect(response.body.order.status).toBe('preparing');
    });

    test('4. Supplier assigns delivery driver', async () => {
      const response = await request(TEST_CONFIG.api_gateway_url)
        .post(`/api/v1/delivery/${testOrder.id}/assign-driver`)
        .set('Authorization', `Bearer ${supplierTokens.accessToken}`)
        .send({
          driverId: driverTokens.userId, // This would be extracted from JWT in real implementation
        })
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('assigned');
    });

    test('5. Driver picks up the order', async () => {
      const response = await request(TEST_CONFIG.api_gateway_url)
        .put(`/api/v1/delivery/${testOrder.id}/status`)
        .set('Authorization', `Bearer ${driverTokens.accessToken}`)
        .send({
          status: 'picked_up',
          notes: 'Order picked up from supplier warehouse',
        })
        .expect(200);

      expect(response.body.deliveryStatus).toBe('picked_up');
    });

    test('6. Driver updates location during transit', async () => {
      const response = await request(TEST_CONFIG.api_gateway_url)
        .post(`/api/v1/tracking/${testOrder.id}/location`)
        .set('Authorization', `Bearer ${driverTokens.accessToken}`)
        .send({
          latitude: 6.5400,
          longitude: 3.3500,
          status: 'in_transit',
        })
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('updated');
    });

    test('7. Driver delivers the order', async () => {
      const response = await request(TEST_CONFIG.api_gateway_url)
        .put(`/api/v1/delivery/${testOrder.id}/status`)
        .set('Authorization', `Bearer ${driverTokens.accessToken}`)
        .send({
          status: 'delivered',
          notes: 'Order delivered successfully to customer',
          deliveryProof: {
            signature: 'customer_signature_data',
            photo: 'delivery_photo_url',
          },
        })
        .expect(200);

      expect(response.body.deliveryStatus).toBe('delivered');
    });

    test('8. Order status is automatically updated to delivered', async () => {
      const response = await request(TEST_CONFIG.api_gateway_url)
        .get(`/api/v1/orders/${testOrder.id}`)
        .set('Authorization', `Bearer ${customerTokens.accessToken}`)
        .expect(200);

      expect(response.body.order.status).toBe('delivered');
      expect(response.body.order.deliveredAt).toBeTruthy();
    });

    test('9. Customer can view order history', async () => {
      const response = await request(TEST_CONFIG.api_gateway_url)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${customerTokens.accessToken}`)
        .expect(200);

      expect(response.body.orders).toHaveLength(1);
      expect(response.body.orders[0].id).toBe(testOrder.id);
      expect(response.body.orders[0].status).toBe('delivered');
    });

    test('10. Supplier can view order analytics', async () => {
      const response = await request(TEST_CONFIG.api_gateway_url)
        .get('/api/v1/analytics/dashboard')
        .set('Authorization', `Bearer ${supplierTokens.accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('totalOrders');
      expect(response.body).toHaveProperty('totalRevenue');
      expect(response.body).toHaveProperty('completedOrders');
    });
  });

  describe('Emergency SOS Order Flow', () => {
    test('1. Customer creates emergency SOS order', async () => {
      // Get customer addresses
      const addressResponse = await request(TEST_CONFIG.api_gateway_url)
        .get('/api/v1/addresses')
        .set('Authorization', `Bearer ${customerTokens.accessToken}`)
        .expect(200);

      const deliveryAddress = addressResponse.body.find(addr => addr.isDefault);

      const emergencyOrderData = {
        supplierId: testSupplier.id,
        deliveryAddressId: deliveryAddress.id,
        orderType: 'emergency_sos',
        priority: 'emergency',
        items: [
          {
            gasTypeId: '550e8400-e29b-41d4-a716-446655440001', // Medical Oxygen
            quantity: 1,
            unitPrice: 20000.00,
            cylinderSize: '10L',
          },
        ],
        emergencyContactPhone: '+2348012345693',
        specialInstructions: 'URGENT: Medical emergency - patient needs oxygen immediately',
      };

      const response = await request(TEST_CONFIG.api_gateway_url)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerTokens.accessToken}`)
        .send(emergencyOrderData)
        .expect(201);

      expect(response.body.order.orderType).toBe('emergency_sos');
      expect(response.body.order.priority).toBe('emergency');
      expect(response.body.order.totalAmount).toBeGreaterThan(emergencyOrderData.items[0].unitPrice); // Should include emergency surcharge
    });
  });

  describe('Order Cancellation Flow', () => {
    test('1. Customer cancels pending order', async () => {
      // Create a new order to cancel
      const addressResponse = await request(TEST_CONFIG.api_gateway_url)
        .get('/api/v1/addresses')
        .set('Authorization', `Bearer ${customerTokens.accessToken}`)
        .expect(200);

      const deliveryAddress = addressResponse.body.find(addr => addr.isDefault);

      const orderResponse = await request(TEST_CONFIG.api_gateway_url)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerTokens.accessToken}`)
        .send({
          supplierId: testSupplier.id,
          deliveryAddressId: deliveryAddress.id,
          orderType: 'regular',
          items: [
            {
              gasTypeId: '550e8400-e29b-41d4-a716-446655440002',
              quantity: 1,
              unitPrice: 10500.00,
              cylinderSize: '12.5kg',
            },
          ],
        })
        .expect(201);

      const orderToCancel = orderResponse.body.order;

      // Cancel the order
      const cancelResponse = await request(TEST_CONFIG.api_gateway_url)
        .post(`/api/v1/orders/${orderToCancel.id}/cancel`)
        .set('Authorization', `Bearer ${customerTokens.accessToken}`)
        .send({
          reason: 'Changed mind about the order',
        })
        .expect(200);

      expect(cancelResponse.body.order.status).toBe('cancelled');
      expect(cancelResponse.body.order.cancellationReason).toBe('Changed mind about the order');
    });
  });
});
