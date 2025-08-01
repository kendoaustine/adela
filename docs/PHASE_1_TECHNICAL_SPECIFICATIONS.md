# 🔧 Phase 1: Technical Implementation Specifications

## 📋 Task 1.1: User Profile Management

### **Endpoints to Implement**

#### `GET /api/v1/profiles`
```javascript
// Expected Response
{
  "profile": {
    "userId": "uuid",
    "firstName": "string",
    "lastName": "string", 
    "businessName": "string|null", // Only for suppliers
    "createdAt": "timestamp",
    "updatedAt": "timestamp"
  }
}
```

#### `PUT /api/v1/profiles`
```javascript
// Request Body
{
  "firstName": "string", // 1-100 chars
  "lastName": "string",  // 1-100 chars
  "businessName": "string|null" // Only for suppliers, max 255 chars
}
```

### **Database Implementation**
```sql
-- Query for GET /profiles
SELECT p.*, u.role 
FROM auth.profiles p 
JOIN auth.users u ON p.user_id = u.id 
WHERE p.user_id = $1;

-- Query for PUT /profiles
UPDATE auth.profiles 
SET first_name = $2, last_name = $3, business_name = $4, updated_at = CURRENT_TIMESTAMP
WHERE user_id = $1
RETURNING *;
```

### **Validation Rules**
- `firstName`: Required, 1-100 characters, trim whitespace
- `lastName`: Required, 1-100 characters, trim whitespace  
- `businessName`: Optional for non-suppliers, required for suppliers, max 255 chars

### **Error Handling**
- `404`: Profile not found
- `400`: Validation errors
- `403`: Business name update attempted by non-supplier

---

## 📋 Task 1.2: Address Management

### **Endpoints to Implement**

#### `GET /api/v1/addresses`
```javascript
// Expected Response
{
  "addresses": [
    {
      "id": "uuid",
      "userId": "uuid",
      "label": "string", // "Home", "Office", etc.
      "addressLine1": "string",
      "addressLine2": "string|null",
      "city": "string",
      "state": "string", 
      "postalCode": "string",
      "country": "string",
      "latitude": "decimal|null",
      "longitude": "decimal|null",
      "isDefault": "boolean",
      "createdAt": "timestamp"
    }
  ],
  "pagination": {
    "total": "number",
    "page": "number", 
    "limit": "number"
  }
}
```

#### `POST /api/v1/addresses`
```javascript
// Request Body
{
  "label": "string", // max 50 chars
  "addressLine1": "string", // required, max 255 chars
  "addressLine2": "string|null", // optional, max 255 chars
  "city": "string", // required, max 100 chars
  "state": "string", // required, max 100 chars
  "postalCode": "string", // required, max 20 chars
  "country": "string", // required, max 100 chars
  "isDefault": "boolean" // optional, default false
}
```

### **Database Implementation**
```sql
-- Query for GET /addresses
SELECT * FROM auth.addresses 
WHERE user_id = $1 
ORDER BY is_default DESC, created_at DESC
LIMIT $2 OFFSET $3;

-- Query for POST /addresses (with default handling)
BEGIN;
-- If setting as default, unset other defaults
UPDATE auth.addresses SET is_default = false WHERE user_id = $1 AND is_default = true;
-- Insert new address
INSERT INTO auth.addresses (id, user_id, label, address_line1, address_line2, city, state, postal_code, country, is_default)
VALUES ($2, $1, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;
COMMIT;
```

### **Business Logic**
- **Default Address**: Only one default address per user
- **Geocoding**: Optional latitude/longitude for delivery optimization
- **Validation**: Address format validation, postal code format
- **Limits**: Maximum 10 addresses per user

---

## 📋 Task 1.3: Email/Phone Verification

### **Endpoints to Implement**

#### `POST /api/v1/auth/send-email-verification`
```javascript
// Request: No body (uses authenticated user)
// Response
{
  "message": "Verification email sent",
  "expiresAt": "timestamp" // 10 minutes from now
}
```

#### `POST /api/v1/auth/verify-email`
```javascript
// Request Body
{
  "token": "string" // 6-digit code
}

// Response
{
  "message": "Email verified successfully",
  "user": {
    "emailVerifiedAt": "timestamp"
  }
}
```

### **Database Implementation**
```sql
-- Create OTP token
INSERT INTO auth.otp_tokens (id, user_id, token, type, expires_at)
VALUES ($1, $2, $3, 'email_verification', $4);

-- Verify OTP token
SELECT * FROM auth.otp_tokens 
WHERE user_id = $1 AND token = $2 AND type = 'email_verification' 
AND expires_at > CURRENT_TIMESTAMP AND used_at IS NULL;

-- Mark email as verified
UPDATE auth.users 
SET email_verified_at = CURRENT_TIMESTAMP, is_verified = true
WHERE id = $1;

-- Mark token as used
UPDATE auth.otp_tokens 
SET used_at = CURRENT_TIMESTAMP 
WHERE id = $1;
```

### **Integration Requirements**
- **Email Service**: SendGrid/SMTP configuration
- **SMS Service**: Twilio for phone verification
- **Rate Limiting**: Max 3 verification attempts per hour
- **Token Security**: Cryptographically secure random tokens

---

## 📋 Task 1.4: Supplier Document Upload & Verification

### **Endpoints to Implement**

#### `POST /api/v1/suppliers/documents`
```javascript
// Request: Multipart form data
{
  "documentType": "business_license|tax_certificate|insurance_certificate",
  "file": "File object",
  "description": "string|optional"
}

// Response
{
  "message": "Document uploaded successfully",
  "document": {
    "id": "uuid",
    "documentType": "string",
    "fileName": "string",
    "fileSize": "number",
    "uploadedAt": "timestamp",
    "verificationStatus": "pending"
  }
}
```

#### `GET /api/v1/suppliers/verification-status`
```javascript
// Response
{
  "verificationStatus": "pending|approved|rejected",
  "documents": [
    {
      "id": "uuid",
      "documentType": "string",
      "fileName": "string",
      "verificationStatus": "pending|approved|rejected",
      "uploadedAt": "timestamp",
      "reviewedAt": "timestamp|null",
      "reviewNotes": "string|null"
    }
  ],
  "requiredDocuments": ["business_license", "tax_certificate", "insurance_certificate"],
  "missingDocuments": ["string"],
  "canStartSelling": "boolean"
}
```

### **File Upload Configuration**
```javascript
// Multer configuration
const upload = multer({
  storage: multer.diskStorage({
    destination: './uploads/supplier-documents/',
    filename: (req, file, cb) => {
      const uniqueName = `${req.user.id}-${Date.now()}-${file.originalname}`;
      cb(null, uniqueName);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and PDF allowed.'));
    }
  }
});
```

### **Database Implementation**
```sql
-- Insert document record
INSERT INTO auth.supplier_documents (
  id, supplier_id, document_type, file_name, file_path, file_size, 
  verification_status, description
) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
RETURNING *;

-- Get verification status
SELECT 
  sd.*,
  CASE 
    WHEN COUNT(CASE WHEN sd.verification_status = 'approved' THEN 1 END) >= 3 
    THEN true 
    ELSE false 
  END as can_start_selling
FROM auth.supplier_documents sd
WHERE sd.supplier_id = $1
GROUP BY sd.id;
```

### **Business Rules**
- **Required Documents**: Business license, tax certificate, insurance
- **File Validation**: Max 10MB, PDF/JPEG/PNG only
- **Verification Process**: Manual admin review required
- **Selling Permission**: All 3 documents must be approved

---

## 🔧 Implementation Guidelines

### **Code Structure**
```
services/auth-service/src/
├── controllers/
│   ├── profileController.js     # Task 1.1
│   ├── addressController.js     # Task 1.2
│   ├── verificationController.js # Task 1.3
│   └── supplierController.js    # Task 1.4
├── models/
│   ├── Profile.js
│   ├── Address.js
│   └── SupplierDocument.js
├── services/
│   ├── emailService.js
│   ├── smsService.js
│   └── fileUploadService.js
└── validators/
    ├── profileValidator.js
    ├── addressValidator.js
    └── documentValidator.js
```

### **Testing Requirements**
- **Unit Tests**: 80%+ coverage for all controllers
- **Integration Tests**: Database operations and API endpoints
- **E2E Tests**: Complete user journeys for each role
- **Performance Tests**: Response times under 200ms

### **Security Considerations**
- **File Upload Security**: Virus scanning, file type validation
- **Input Sanitization**: All user inputs sanitized
- **Rate Limiting**: Verification attempts, file uploads
- **Audit Logging**: All profile/document changes logged

### **Performance Targets**
- **Profile Operations**: < 100ms response time
- **Address Operations**: < 150ms response time
- **File Uploads**: < 2s for 10MB files
- **Verification**: < 500ms for token validation

---

## 📊 Database Schema Verification

### **Required Tables** (✅ All exist)
- `auth.users` - User accounts
- `auth.profiles` - User profile information  
- `auth.addresses` - Delivery addresses
- `auth.otp_tokens` - Verification tokens
- `auth.supplier_documents` - Document uploads

### **Required Indexes** (To be added)
```sql
-- Performance indexes for Phase 1
CREATE INDEX idx_profiles_user_id ON auth.profiles(user_id);
CREATE INDEX idx_addresses_user_id ON auth.addresses(user_id);
CREATE INDEX idx_addresses_default ON auth.addresses(user_id, is_default);
CREATE INDEX idx_otp_tokens_lookup ON auth.otp_tokens(user_id, token, type, expires_at);
CREATE INDEX idx_supplier_docs_supplier ON auth.supplier_documents(supplier_id, verification_status);
```

---

## 🚀 Ready to Start Implementation

**Phase 1 is ready for implementation with**:
- ✅ Complete technical specifications
- ✅ Database schema verified
- ✅ API contracts defined
- ✅ Security requirements specified
- ✅ Performance targets set
- ✅ Testing strategy outlined

**Next Step**: Begin implementation of Task 1.1 (User Profile Management) as the foundation for all subsequent features.
