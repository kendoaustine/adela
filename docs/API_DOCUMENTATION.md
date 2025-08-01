# **GasConnect API Documentation**

## **Overview**

The GasConnect API consists of three microservices:
- **Auth Service** (Port 3001): User authentication, profiles, and user management
- **Orders Service** (Port 3002): Order management, delivery tracking, and cylinder management
- **Supplier Service** (Port 3003): Inventory, pricing, payments, and analytics

All APIs follow RESTful conventions and return JSON responses with consistent error handling.

---

## **Authentication**

### **JWT Token Structure**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600,
  "tokenType": "Bearer"
}
```

### **Required Headers**
```http
Authorization: Bearer <access_token>
Content-Type: application/json
X-Request-ID: <optional_request_id>
```

---

## **Auth Service API (Port 3001)**

### **Authentication Endpoints**

#### **POST /api/v1/auth/register**
Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "phone": "+2348012345678",
  "password": "SecurePassword123!",
  "firstName": "John",
  "lastName": "Doe",
  "role": "household",
  "acceptTerms": true
}
```

**Response (201):**
```json
{
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "phone": "+2348012345678",
      "firstName": "John",
      "lastName": "Doe",
      "role": "household",
      "isActive": true,
      "isVerified": false,
      "createdAt": "2024-01-01T00:00:00.000Z"
    },
    "tokens": {
      "accessToken": "jwt_token",
      "refreshToken": "refresh_token",
      "expiresIn": 3600,
      "tokenType": "Bearer"
    }
  }
}
```

#### **POST /api/v1/auth/login**
Authenticate user and receive tokens.

**Request Body:**
```json
{
  "identifier": "user@example.com", // email or phone
  "password": "SecurePassword123!",
  "rememberMe": false
}
```

**Response (200):**
```json
{
  "message": "Login successful",
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": "household",
      "lastLoginAt": "2024-01-01T00:00:00.000Z"
    },
    "tokens": {
      "accessToken": "jwt_token",
      "refreshToken": "refresh_token",
      "expiresIn": 3600,
      "tokenType": "Bearer"
    }
  }
}
```

#### **POST /api/v1/auth/refresh**
Refresh access token using refresh token.

**Request Body:**
```json
{
  "refreshToken": "refresh_token_here"
}
```

**Response (200):**
```json
{
  "data": {
    "tokens": {
      "accessToken": "new_jwt_token",
      "refreshToken": "new_refresh_token",
      "expiresIn": 3600,
      "tokenType": "Bearer"
    }
  }
}
```

#### **GET /api/v1/auth/me**
Get current user information.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "phone": "+2348012345678",
    "firstName": "John",
    "lastName": "Doe",
    "role": "household",
    "isActive": true,
    "isVerified": true,
    "emailVerifiedAt": "2024-01-01T00:00:00.000Z",
    "phoneVerifiedAt": "2024-01-01T00:00:00.000Z",
    "lastLoginAt": "2024-01-01T00:00:00.000Z",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### **Profile Management**

#### **GET /api/v1/profiles**
Get user profile information.

**Response (200):**
```json
{
  "data": {
    "id": "uuid",
    "userId": "user_uuid",
    "dateOfBirth": "1990-01-01",
    "gender": "male",
    "occupation": "Engineer",
    "emergencyContactName": "Jane Doe",
    "emergencyContactPhone": "+2348087654321",
    "preferences": {
      "notifications": {
        "email": true,
        "sms": true,
        "push": true
      },
      "language": "en",
      "currency": "NGN"
    },
    "avatarUrl": "https://example.com/avatar.jpg",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### **PUT /api/v1/profiles**
Update user profile.

**Request Body:**
```json
{
  "dateOfBirth": "1990-01-01",
  "gender": "male",
  "occupation": "Engineer",
  "emergencyContactName": "Jane Doe",
  "emergencyContactPhone": "+2348087654321",
  "preferences": {
    "notifications": {
      "email": true,
      "sms": false,
      "push": true
    }
  }
}
```

### **Address Management**

#### **GET /api/v1/addresses**
Get user addresses.

**Query Parameters:**
- `type` (optional): Filter by address type (home, work, other)
- `default` (optional): Filter by default status (true, false)

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "userId": "user_uuid",
      "type": "home",
      "label": "Home Address",
      "street": "123 Main Street",
      "city": "Lagos",
      "state": "Lagos",
      "postalCode": "100001",
      "country": "Nigeria",
      "latitude": 6.5244,
      "longitude": 3.3792,
      "isDefault": true,
      "deliveryInstructions": "Gate code: 1234",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### **POST /api/v1/addresses**
Create new address.

**Request Body:**
```json
{
  "type": "home",
  "label": "Home Address",
  "street": "123 Main Street",
  "city": "Lagos",
  "state": "Lagos",
  "postalCode": "100001",
  "country": "Nigeria",
  "latitude": 6.5244,
  "longitude": 3.3792,
  "isDefault": true,
  "deliveryInstructions": "Gate code: 1234"
}
```

---

## **Orders Service API (Port 3002)**

### **Order Management**

#### **POST /api/v1/orders**
Create a new order.

**Request Body:**
```json
{
  "supplierId": "supplier_uuid",
  "deliveryAddressId": "address_uuid",
  "orderType": "regular",
  "items": [
    {
      "gasTypeId": "gas_type_uuid",
      "cylinderSize": "12.5kg",
      "quantity": 2,
      "specialRequirements": "Handle with care"
    }
  ],
  "specialInstructions": "Call before delivery",
  "emergencyContactPhone": "+2348087654321",
  "scheduledDeliveryDate": "2024-01-02T10:00:00.000Z"
}
```

**Response (201):**
```json
{
  "message": "Order created successfully",
  "data": {
    "id": "order_uuid",
    "orderNumber": "GC-2024-001",
    "userId": "user_uuid",
    "supplierId": "supplier_uuid",
    "deliveryAddressId": "address_uuid",
    "orderType": "regular",
    "status": "pending",
    "priority": 1,
    "subtotal": 15000.00,
    "taxAmount": 1125.00,
    "deliveryFee": 2000.00,
    "totalAmount": 18125.00,
    "specialInstructions": "Call before delivery",
    "emergencyContactPhone": "+2348087654321",
    "scheduledDeliveryDate": "2024-01-02T10:00:00.000Z",
    "estimatedDeliveryTime": "2024-01-02T12:00:00.000Z",
    "items": [
      {
        "id": "item_uuid",
        "gasTypeId": "gas_type_uuid",
        "gasTypeName": "Cooking Gas",
        "cylinderSize": "12.5kg",
        "quantity": 2,
        "unitPrice": 7500.00,
        "totalPrice": 15000.00,
        "specialRequirements": "Handle with care"
      }
    ],
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### **GET /api/v1/orders**
Get user orders with pagination and filtering.

**Query Parameters:**
- `status` (optional): Filter by order status
- `orderType` (optional): Filter by order type
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)
- `sortBy` (optional): Sort field (default: createdAt)
- `sortOrder` (optional): Sort order (asc, desc, default: desc)

**Response (200):**
```json
{
  "data": [
    {
      "id": "order_uuid",
      "orderNumber": "GC-2024-001",
      "status": "pending",
      "orderType": "regular",
      "totalAmount": 18125.00,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "items": [
        {
          "gasTypeName": "Cooking Gas",
          "cylinderSize": "12.5kg",
          "quantity": 2
        }
      ]
    }
  ],
  "meta": {
    "total": 25,
    "page": 1,
    "limit": 10,
    "hasNext": true,
    "hasPrev": false
  }
}
```

#### **GET /api/v1/orders/:id**
Get specific order details.

**Response (200):**
```json
{
  "data": {
    "id": "order_uuid",
    "orderNumber": "GC-2024-001",
    "userId": "user_uuid",
    "supplierId": "supplier_uuid",
    "deliveryAddressId": "address_uuid",
    "orderType": "regular",
    "status": "confirmed",
    "priority": 1,
    "subtotal": 15000.00,
    "taxAmount": 1125.00,
    "deliveryFee": 2000.00,
    "totalAmount": 18125.00,
    "specialInstructions": "Call before delivery",
    "emergencyContactPhone": "+2348087654321",
    "scheduledDeliveryDate": "2024-01-02T10:00:00.000Z",
    "estimatedDeliveryTime": "2024-01-02T12:00:00.000Z",
    "items": [
      {
        "id": "item_uuid",
        "gasTypeId": "gas_type_uuid",
        "gasTypeName": "Cooking Gas",
        "cylinderSize": "12.5kg",
        "quantity": 2,
        "unitPrice": 7500.00,
        "totalPrice": 15000.00,
        "specialRequirements": "Handle with care"
      }
    ],
    "delivery": {
      "id": "delivery_uuid",
      "status": "assigned",
      "driverId": "driver_uuid",
      "estimatedArrival": "2024-01-02T12:00:00.000Z"
    },
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### **Order Tracking**

#### **GET /api/v1/tracking/:orderId**
Get real-time order tracking information.

**Response (200):**
```json
{
  "data": {
    "orderId": "order_uuid",
    "status": "out_for_delivery",
    "currentLocation": {
      "latitude": 6.5244,
      "longitude": 3.3792,
      "timestamp": "2024-01-02T11:30:00.000Z"
    },
    "estimatedArrival": "2024-01-02T12:15:00.000Z",
    "driver": {
      "id": "driver_uuid",
      "name": "John Driver",
      "phone": "+2348012345678",
      "vehicleNumber": "ABC-123-XY"
    },
    "timeline": [
      {
        "status": "pending",
        "timestamp": "2024-01-01T00:00:00.000Z",
        "message": "Order placed"
      },
      {
        "status": "confirmed",
        "timestamp": "2024-01-01T00:15:00.000Z",
        "message": "Order confirmed by supplier"
      },
      {
        "status": "preparing",
        "timestamp": "2024-01-02T10:00:00.000Z",
        "message": "Order is being prepared"
      },
      {
        "status": "out_for_delivery",
        "timestamp": "2024-01-02T11:00:00.000Z",
        "message": "Order is out for delivery"
      }
    ]
  }
}
```

#### **GET /api/v1/orders**
Get user orders with pagination and filtering.

**Query Parameters:**
- `status` (optional): Filter by order status
- `orderType` (optional): Filter by order type
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)
- `sortBy` (optional): Sort field (default: createdAt)
- `sortOrder` (optional): Sort order (asc, desc, default: desc)

**Response (200):**
```json
{
  "data": [
    {
      "id": "order_uuid",
      "orderNumber": "GC-2024-001",
      "status": "pending",
      "orderType": "regular",
      "totalAmount": 18125.00,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "items": [
        {
          "gasTypeName": "Cooking Gas",
          "cylinderSize": "12.5kg",
          "quantity": 2
        }
      ]
    }
  ],
  "meta": {
    "total": 25,
    "page": 1,
    "limit": 10,
    "hasNext": true,
    "hasPrev": false
  }
}
```

#### **PUT /api/v1/orders/:id/cancel**
Cancel an order.

**Request Body:**
```json
{
  "reason": "Changed my mind"
}
```

**Response (200):**
```json
{
  "message": "Order cancelled successfully",
  "data": {
    "id": "order_uuid",
    "status": "cancelled",
    "cancelledAt": "2024-01-01T00:00:00.000Z",
    "cancellationReason": "Changed my mind"
  }
}
```

### **Order Tracking**

#### **GET /api/v1/tracking/:orderId**
Get real-time order tracking information.

**Response (200):**
```json
{
  "data": {
    "orderId": "order_uuid",
    "status": "out_for_delivery",
    "currentLocation": {
      "latitude": 6.5244,
      "longitude": 3.3792,
      "timestamp": "2024-01-02T11:30:00.000Z"
    },
    "estimatedArrival": "2024-01-02T12:15:00.000Z",
    "driver": {
      "id": "driver_uuid",
      "name": "John Driver",
      "phone": "+2348012345678",
      "vehicleNumber": "ABC-123-XY"
    },
    "timeline": [
      {
        "status": "pending",
        "timestamp": "2024-01-01T00:00:00.000Z",
        "message": "Order placed"
      },
      {
        "status": "confirmed",
        "timestamp": "2024-01-01T00:15:00.000Z",
        "message": "Order confirmed by supplier"
      },
      {
        "status": "preparing",
        "timestamp": "2024-01-02T10:00:00.000Z",
        "message": "Order is being prepared"
      },
      {
        "status": "out_for_delivery",
        "timestamp": "2024-01-02T11:00:00.000Z",
        "message": "Order is out for delivery"
      }
    ]
  }
}
```

---

## **Supplier Service API (Port 3003)**

### **Inventory Management**

#### **GET /api/v1/inventory**
Get supplier inventory.

**Query Parameters:**
- `gasTypeId` (optional): Filter by gas type
- `cylinderSize` (optional): Filter by cylinder size
- `available` (optional): Filter by availability (true, false)
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)

**Response (200):**
```json
{
  "data": [
    {
      "id": "inventory_uuid",
      "supplierId": "supplier_uuid",
      "gasTypeId": "gas_type_uuid",
      "gasTypeName": "Cooking Gas",
      "cylinderSize": "12.5kg",
      "availableQuantity": 50,
      "reservedQuantity": 10,
      "reorderLevel": 20,
      "maxStockLevel": 100,
      "unitCost": 6000.00,
      "lastRestockedAt": "2024-01-01T00:00:00.000Z",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "meta": {
    "total": 15,
    "page": 1,
    "limit": 10,
    "hasNext": true,
    "hasPrev": false
  }
}
```

#### **PUT /api/v1/inventory/:id**
Update inventory item.

**Request Body:**
```json
{
  "availableQuantity": 75,
  "reorderLevel": 25,
  "maxStockLevel": 120,
  "unitCost": 6200.00
}
```

### **Pricing Management**

#### **POST /api/v1/pricing/calculate**
Calculate price for order items.

**Request Body:**
```json
{
  "gasTypeId": "gas_type_uuid",
  "cylinderSize": "12.5kg",
  "quantity": 2,
  "customerType": "household",
  "orderType": "regular",
  "deliveryAddressId": "address_uuid"
}
```

**Response (200):**
```json
{
  "data": {
    "gasTypeId": "gas_type_uuid",
    "cylinderSize": "12.5kg",
    "quantity": 2,
    "unitPrice": 7500.00,
    "subtotal": 15000.00,
    "discountAmount": 0.00,
    "emergencySurcharge": 0.00,
    "deliveryFee": 2000.00,
    "taxAmount": 1275.00,
    "totalAmount": 18275.00,
    "breakdown": {
      "basePrice": 7500.00,
      "discount": 0.00,
      "emergency": 0.00,
      "delivery": 2000.00,
      "tax": 1275.00
    }
  }
}
```

### **Payment Management**

#### **POST /api/v1/payments/paystack/initialize**
Initialize Paystack payment.

**Request Body:**
```json
{
  "amount": 18275.00,
  "currency": "NGN",
  "email": "user@example.com",
  "orderId": "order_uuid",
  "description": "Payment for Order GC-2024-001",
  "callback_url": "https://yourapp.com/payment/callback"
}
```

**Response (200):**
```json
{
  "message": "Payment initialized successfully",
  "data": {
    "transaction": {
      "id": "transaction_uuid",
      "reference": "paystack_reference",
      "status": "pending"
    },
    "paystack": {
      "authorization_url": "https://checkout.paystack.com/...",
      "access_code": "access_code",
      "reference": "paystack_reference"
    }
  }
}
```

#### **GET /api/v1/payments/paystack/verify/:reference**
Verify Paystack payment.

**Response (200):**
```json
{
  "data": {
    "transaction": {
      "id": "transaction_uuid",
      "reference": "paystack_reference",
      "status": "completed",
      "amount": 18275.00,
      "currency": "NGN",
      "processedAt": "2024-01-01T00:00:00.000Z"
    },
    "paystack": {
      "status": "success",
      "reference": "paystack_reference",
      "amount": 1827500,
      "gateway_response": "Successful",
      "paid_at": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

---

## **WebSocket Events**

### **Client to Server Events**

#### **subscribe_order**
Subscribe to order updates.
```json
{
  "orderId": "order_uuid"
}
```

#### **driver_location_update**
Update driver location (for drivers).
```json
{
  "orderId": "order_uuid",
  "latitude": 6.5244,
  "longitude": 3.3792
}
```

#### **emergency_sos**
Send emergency SOS signal.
```json
{
  "orderId": "order_uuid",
  "location": {
    "latitude": 6.5244,
    "longitude": 3.3792
  },
  "message": "Emergency assistance needed"
}
```

### **Server to Client Events**

#### **order_status_changed**
Order status update notification.
```json
{
  "orderId": "order_uuid",
  "status": "confirmed",
  "message": "Your order has been confirmed",
  "updatedBy": "supplier_uuid",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### **driver_location**
Driver location update.
```json
{
  "orderId": "order_uuid",
  "driverId": "driver_uuid",
  "latitude": 6.5244,
  "longitude": 3.3792,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### **notification**
General notification.
```json
{
  "type": "order_update",
  "title": "Order Update",
  "message": "Your order is out for delivery",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "orderId": "order_uuid"
}
```

---

## **Error Codes**

| Code | Status | Description |
|------|--------|-------------|
| VALIDATION_ERROR | 400 | Request validation failed |
| UNAUTHORIZED | 401 | Authentication required |
| FORBIDDEN | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource not found |
| CONFLICT | 409 | Resource conflict |
| RATE_LIMIT_EXCEEDED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Internal server error |
| SERVICE_UNAVAILABLE | 503 | Service temporarily unavailable |

---

## **Rate Limiting**

All endpoints are rate limited:
- **Global**: 100 requests per 15 minutes
- **Auth endpoints**: 5 requests per 15 minutes
- **Registration**: 3 requests per hour
- **Password reset**: 3 requests per hour
- **API endpoints**: 60 requests per minute

Rate limit headers are included in responses:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```
