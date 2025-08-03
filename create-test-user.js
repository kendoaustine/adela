const argon2 = require('./services/auth-service/node_modules/argon2');

async function createTestUser() {
  const password = 'testpass123';
  const config = {
    type: 2, // argon2id
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 4,
  };
  
  try {
    const hash = await argon2.hash(password, config);
    console.log('Password:', password);
    console.log('Hash:', hash);
    
    // SQL to insert user
    console.log('\nSQL to insert user:');
    console.log(`INSERT INTO auth.users (id, email, phone, password_hash, role, is_active, is_verified, email_verified_at, phone_verified_at) 
VALUES (gen_random_uuid(), 'testuser@example.com', '+2348099999999', '${hash}', 'household', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`);
    
    // Test verification
    const verify = await argon2.verify(hash, password);
    console.log('\nVerification test:', verify);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

createTestUser();
