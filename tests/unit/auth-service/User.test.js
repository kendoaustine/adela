const User = require('../../../services/auth-service/src/models/User');
const { Pool } = require('pg');

// Mock database connection
jest.mock('../../../services/auth-service/src/database/connection', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
}));

const { query, transaction } = require('../../../services/auth-service/src/database/connection');

describe('User Model Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('User.create()', () => {
    test('should create a new user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        phone: '+2348012345678',
        password: 'SecurePass123!',
        role: 'household',
      };

      const mockUserData = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        email: userData.email,
        phone: userData.phone,
        password_hash: '$argon2id$v=19$m=65536,t=3,p=4$salt$hash',
        role: userData.role,
        is_active: true,
        is_verified: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      query.mockResolvedValueOnce({ rows: [mockUserData] });

      const user = await User.create(userData);

      expect(user).toBeInstanceOf(User);
      expect(user.email).toBe(userData.email);
      expect(user.role).toBe(userData.role);
      expect(user.isActive).toBe(true);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO auth.users'),
        expect.arrayContaining([
          expect.any(String), // UUID
          userData.email,
          userData.phone,
          expect.any(String), // password hash
          userData.role,
        ])
      );
    });

    test('should throw error when email already exists', async () => {
      const userData = {
        email: 'existing@example.com',
        phone: '+2348012345678',
        password: 'SecurePass123!',
        role: 'household',
      };

      const dbError = new Error('duplicate key value violates unique constraint');
      dbError.code = '23505';
      query.mockRejectedValueOnce(dbError);

      await expect(User.create(userData)).rejects.toThrow();
      expect(query).toHaveBeenCalledTimes(1);
    });
  });

  describe('User.findById()', () => {
    test('should find user by ID', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440001';
      const mockUserData = {
        id: userId,
        email: 'test@example.com',
        phone: '+2348012345678',
        password_hash: '$argon2id$v=19$m=65536,t=3,p=4$salt$hash',
        role: 'household',
        is_active: true,
        is_verified: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      query.mockResolvedValueOnce({ rows: [mockUserData] });

      const user = await User.findById(userId);

      expect(user).toBeInstanceOf(User);
      expect(user.id).toBe(userId);
      expect(user.email).toBe(mockUserData.email);
      expect(query).toHaveBeenCalledWith(
        'SELECT * FROM auth.users WHERE id = $1 AND is_active = true',
        [userId]
      );
    });

    test('should return null when user not found', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440999';
      query.mockResolvedValueOnce({ rows: [] });

      const user = await User.findById(userId);

      expect(user).toBeNull();
      expect(query).toHaveBeenCalledWith(
        'SELECT * FROM auth.users WHERE id = $1 AND is_active = true',
        [userId]
      );
    });
  });

  describe('User.findByEmail()', () => {
    test('should find user by email', async () => {
      const email = 'test@example.com';
      const mockUserData = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        email: email,
        phone: '+2348012345678',
        password_hash: '$argon2id$v=19$m=65536,t=3,p=4$salt$hash',
        role: 'household',
        is_active: true,
        is_verified: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      query.mockResolvedValueOnce({ rows: [mockUserData] });

      const user = await User.findByEmail(email);

      expect(user).toBeInstanceOf(User);
      expect(user.email).toBe(email);
      expect(query).toHaveBeenCalledWith(
        'SELECT * FROM auth.users WHERE email = $1 AND is_active = true',
        [email]
      );
    });
  });

  describe('User.prototype.verifyPassword()', () => {
    test('should verify correct password', async () => {
      const mockUserData = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        email: 'test@example.com',
        password_hash: '$argon2id$v=19$m=65536,t=3,p=4$salt$hash',
        role: 'household',
        is_active: true,
      };

      const user = new User(mockUserData);
      
      // Mock argon2.verify
      const argon2 = require('argon2');
      jest.spyOn(argon2, 'verify').mockResolvedValueOnce(true);

      const isValid = await user.verifyPassword('SecurePass123!');

      expect(isValid).toBe(true);
      expect(argon2.verify).toHaveBeenCalledWith(
        mockUserData.password_hash,
        'SecurePass123!'
      );
    });

    test('should reject incorrect password', async () => {
      const mockUserData = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        email: 'test@example.com',
        password_hash: '$argon2id$v=19$m=65536,t=3,p=4$salt$hash',
        role: 'household',
        is_active: true,
      };

      const user = new User(mockUserData);
      
      // Mock argon2.verify
      const argon2 = require('argon2');
      jest.spyOn(argon2, 'verify').mockResolvedValueOnce(false);

      const isValid = await user.verifyPassword('WrongPassword');

      expect(isValid).toBe(false);
      expect(argon2.verify).toHaveBeenCalledWith(
        mockUserData.password_hash,
        'WrongPassword'
      );
    });
  });

  describe('User.prototype.updateLastLogin()', () => {
    test('should update last login timestamp', async () => {
      const mockUserData = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        email: 'test@example.com',
        role: 'household',
        is_active: true,
        failed_login_attempts: 2,
        locked_until: new Date(),
      };

      const user = new User(mockUserData);
      query.mockResolvedValueOnce({ rows: [] });

      await user.updateLastLogin();

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE auth.users'),
        [user.id]
      );
      expect(user.failedLoginAttempts).toBe(0);
      expect(user.lockedUntil).toBeNull();
    });
  });

  describe('User.prototype.incrementFailedLoginAttempts()', () => {
    test('should increment failed login attempts', async () => {
      const mockUserData = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        email: 'test@example.com',
        role: 'household',
        is_active: true,
        failed_login_attempts: 2,
      };

      const user = new User(mockUserData);
      query.mockResolvedValueOnce({ 
        rows: [{ failed_login_attempts: 3, locked_until: null }] 
      });

      await user.incrementFailedLoginAttempts();

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE auth.users'),
        expect.arrayContaining([user.id, 5]) // maxAttempts
      );
      expect(user.failedLoginAttempts).toBe(3);
    });

    test('should lock account after max attempts', async () => {
      const mockUserData = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        email: 'test@example.com',
        role: 'household',
        is_active: true,
        failed_login_attempts: 4,
      };

      const user = new User(mockUserData);
      const lockTime = new Date();
      query.mockResolvedValueOnce({ 
        rows: [{ failed_login_attempts: 5, locked_until: lockTime }] 
      });

      await user.incrementFailedLoginAttempts();

      expect(user.failedLoginAttempts).toBe(5);
      expect(user.lockedUntil).toBe(lockTime);
    });
  });

  describe('User.prototype.isLocked()', () => {
    test('should return true when account is locked', () => {
      const futureTime = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now
      const mockUserData = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        email: 'test@example.com',
        role: 'household',
        is_active: true,
        locked_until: futureTime,
      };

      const user = new User(mockUserData);
      expect(user.isLocked()).toBe(true);
    });

    test('should return false when lock has expired', () => {
      const pastTime = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
      const mockUserData = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        email: 'test@example.com',
        role: 'household',
        is_active: true,
        locked_until: pastTime,
      };

      const user = new User(mockUserData);
      expect(user.isLocked()).toBe(false);
    });

    test('should return false when not locked', () => {
      const mockUserData = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        email: 'test@example.com',
        role: 'household',
        is_active: true,
        locked_until: null,
      };

      const user = new User(mockUserData);
      expect(user.isLocked()).toBe(false);
    });
  });

  describe('User.prototype.toJSON()', () => {
    test('should return user data without sensitive information', () => {
      const mockUserData = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        email: 'test@example.com',
        phone: '+2348012345678',
        password_hash: '$argon2id$v=19$m=65536,t=3,p=4$salt$hash',
        role: 'household',
        is_active: true,
        is_verified: false,
        email_verified_at: null,
        phone_verified_at: null,
        last_login_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const user = new User(mockUserData);
      const json = user.toJSON();

      expect(json).toHaveProperty('id');
      expect(json).toHaveProperty('email');
      expect(json).toHaveProperty('phone');
      expect(json).toHaveProperty('role');
      expect(json).toHaveProperty('isActive');
      expect(json).toHaveProperty('isVerified');
      expect(json).not.toHaveProperty('passwordHash');
      expect(json).not.toHaveProperty('password_hash');
    });
  });
});
