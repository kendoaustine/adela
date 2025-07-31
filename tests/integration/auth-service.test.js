const request = require('supertest');
const { Pool } = require('pg');
const redis = require('redis');

// Test configuration
const TEST_CONFIG = {
  auth_service_url: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  database_url: process.env.TEST_DATABASE_URL || 'postgresql://gasconnect:gasconnect_password@localhost:5432/gasconnect_test',
  redis_url: process.env.TEST_REDIS_URL || 'redis://localhost:6379/1',
};

describe('Auth Service Integration Tests', () => {
  let dbPool;
  let redisClient;
  let testUser;
  let authTokens;

  beforeAll(async () => {
    // Setup test database connection
    dbPool = new Pool({ connectionString: TEST_CONFIG.database_url });
    
    // Setup test Redis connection
    redisClient = redis.createClient({ url: TEST_CONFIG.redis_url });
    await redisClient.connect();
    
    // Clean up test data
    await dbPool.query('DELETE FROM auth.users WHERE email LIKE %test%');
    await redisClient.flushDb();
  });

  afterAll(async () => {
    // Cleanup
    if (testUser) {
      await dbPool.query('DELETE FROM auth.users WHERE id = $1', [testUser.id]);
    }
    await dbPool.end();
    await redisClient.quit();
  });

  describe('User Registration', () => {
    test('should register a new household user successfully', async () => {
      const userData = {
        email: 'test.household@example.com',
        phone: '+2348012345678',
        password: 'SecurePass123!',
        role: 'household',
        firstName: 'Test',
        lastName: 'User',
      };

      const response = await request(TEST_CONFIG.auth_service_url)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toHaveProperty('message', 'User registered successfully');
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('tokens');
      expect(response.body.user.email).toBe(userData.email);
      expect(response.body.user.role).toBe(userData.role);
      expect(response.body.tokens).toHaveProperty('accessToken');
      expect(response.body.tokens).toHaveProperty('refreshToken');

      testUser = response.body.user;
      authTokens = response.body.tokens;
    });

    test('should register a new supplier user successfully', async () => {
      const supplierData = {
        email: 'test.supplier@example.com',
        phone: '+2348012345679',
        password: 'SecurePass123!',
        role: 'supplier',
        firstName: 'Test',
        lastName: 'Supplier',
        businessName: 'Test Gas Supply Ltd',
      };

      const response = await request(TEST_CONFIG.auth_service_url)
        .post('/api/v1/auth/register')
        .send(supplierData)
        .expect(201);

      expect(response.body.user.role).toBe('supplier');
      expect(response.body.user.email).toBe(supplierData.email);
    });

    test('should reject registration with duplicate email', async () => {
      const duplicateData = {
        email: 'test.household@example.com', // Same as first test
        phone: '+2348012345680',
        password: 'SecurePass123!',
        role: 'household',
        firstName: 'Duplicate',
        lastName: 'User',
      };

      const response = await request(TEST_CONFIG.auth_service_url)
        .post('/api/v1/auth/register')
        .send(duplicateData)
        .expect(409);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.message).toContain('already exists');
    });

    test('should reject registration with invalid password', async () => {
      const invalidData = {
        email: 'test.invalid@example.com',
        phone: '+2348012345681',
        password: 'weak', // Too weak
        role: 'household',
        firstName: 'Test',
        lastName: 'User',
      };

      const response = await request(TEST_CONFIG.auth_service_url)
        .post('/api/v1/auth/register')
        .send(invalidData)
        .expect(400);

      expect(response.body).toHaveProperty('errors');
    });
  });

  describe('User Authentication', () => {
    test('should login with valid credentials', async () => {
      const loginData = {
        identifier: 'test.household@example.com',
        password: 'SecurePass123!',
      };

      const response = await request(TEST_CONFIG.auth_service_url)
        .post('/api/v1/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Login successful');
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('tokens');
      expect(response.body.tokens).toHaveProperty('accessToken');
      expect(response.body.tokens).toHaveProperty('refreshToken');

      authTokens = response.body.tokens;
    });

    test('should reject login with invalid credentials', async () => {
      const invalidLogin = {
        identifier: 'test.household@example.com',
        password: 'WrongPassword123!',
      };

      const response = await request(TEST_CONFIG.auth_service_url)
        .post('/api/v1/auth/login')
        .send(invalidLogin)
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.message).toBe('Invalid credentials');
    });

    test('should refresh access token with valid refresh token', async () => {
      const response = await request(TEST_CONFIG.auth_service_url)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: authTokens.refreshToken })
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Token refreshed successfully');
      expect(response.body).toHaveProperty('tokens');
      expect(response.body.tokens).toHaveProperty('accessToken');

      authTokens = response.body.tokens;
    });
  });

  describe('Protected Endpoints', () => {
    test('should access user profile with valid token', async () => {
      const response = await request(TEST_CONFIG.auth_service_url)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${authTokens.accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('profile');
      expect(response.body.user.email).toBe('test.household@example.com');
    });

    test('should reject access without token', async () => {
      const response = await request(TEST_CONFIG.auth_service_url)
        .get('/api/v1/auth/me')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    test('should reject access with invalid token', async () => {
      const response = await request(TEST_CONFIG.auth_service_url)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Email Verification', () => {
    test('should send email verification', async () => {
      const response = await request(TEST_CONFIG.auth_service_url)
        .post('/api/v1/auth/send-email-verification')
        .set('Authorization', `Bearer ${authTokens.accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Email verification sent');
      expect(response.body).toHaveProperty('verificationToken'); // Remove in production
    });

    test('should verify email with valid token', async () => {
      // First get verification token
      const sendResponse = await request(TEST_CONFIG.auth_service_url)
        .post('/api/v1/auth/send-email-verification')
        .set('Authorization', `Bearer ${authTokens.accessToken}`)
        .expect(200);

      const verificationToken = sendResponse.body.verificationToken;

      const response = await request(TEST_CONFIG.auth_service_url)
        .post('/api/v1/auth/verify-email')
        .set('Authorization', `Bearer ${authTokens.accessToken}`)
        .send({ token: verificationToken })
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Email verified successfully');
      expect(response.body.user.emailVerifiedAt).toBeTruthy();
    });
  });

  describe('Phone Verification', () => {
    test('should send phone verification OTP', async () => {
      const response = await request(TEST_CONFIG.auth_service_url)
        .post('/api/v1/auth/send-phone-verification')
        .set('Authorization', `Bearer ${authTokens.accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Phone verification OTP sent');
      expect(response.body).toHaveProperty('otp'); // Remove in production
    });

    test('should verify phone with valid OTP', async () => {
      // First get OTP
      const sendResponse = await request(TEST_CONFIG.auth_service_url)
        .post('/api/v1/auth/send-phone-verification')
        .set('Authorization', `Bearer ${authTokens.accessToken}`)
        .expect(200);

      const otp = sendResponse.body.otp;

      const response = await request(TEST_CONFIG.auth_service_url)
        .post('/api/v1/auth/verify-phone')
        .set('Authorization', `Bearer ${authTokens.accessToken}`)
        .send({ otp })
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Phone verified successfully');
      expect(response.body.user.phoneVerifiedAt).toBeTruthy();
    });
  });

  describe('Password Reset', () => {
    test('should request password reset', async () => {
      const response = await request(TEST_CONFIG.auth_service_url)
        .post('/api/v1/auth/request-password-reset')
        .send({ identifier: 'test.household@example.com' })
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('password reset link');
    });

    test('should reset password with valid token', async () => {
      // First request reset
      const requestResponse = await request(TEST_CONFIG.auth_service_url)
        .post('/api/v1/auth/request-password-reset')
        .send({ identifier: 'test.household@example.com' })
        .expect(200);

      const resetToken = requestResponse.body.resetToken; // Remove in production

      const response = await request(TEST_CONFIG.auth_service_url)
        .post('/api/v1/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: 'NewSecurePass123!',
        })
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Password reset successfully');

      // Verify can login with new password
      const loginResponse = await request(TEST_CONFIG.auth_service_url)
        .post('/api/v1/auth/login')
        .send({
          identifier: 'test.household@example.com',
          password: 'NewSecurePass123!',
        })
        .expect(200);

      expect(loginResponse.body).toHaveProperty('tokens');
    });
  });

  describe('User Logout', () => {
    test('should logout successfully', async () => {
      const response = await request(TEST_CONFIG.auth_service_url)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${authTokens.accessToken}`)
        .send({ refreshToken: authTokens.refreshToken })
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Logout successful');
    });

    test('should not access protected endpoints after logout', async () => {
      const response = await request(TEST_CONFIG.auth_service_url)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${authTokens.accessToken}`)
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });
});
