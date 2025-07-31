# GasConnect API Documentation

This document provides comprehensive API documentation for the GasConnect platform.

## Base URLs

- **Production**: `https://api.gasconnect.com`
- **Staging**: `https://staging-api.gasconnect.com`
- **Development**: `http://localhost` (via API Gateway)

## Authentication

GasConnect uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

### Token Lifecycle

- **Access Token**: Valid for 24 hours
- **Refresh Token**: Valid for 7 days
- **Token Rotation**: Refresh tokens are rotated on use for security

## Rate Limiting

API requests are rate-limited to prevent abuse:

- **Global**: 10 requests per second per IP
- **Authentication**: 5 requests per minute per IP
- **API Endpoints**: 20 requests per second per IP
- **Per User**: 100 requests per second per authenticated user

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Request limit
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Reset time (ISO 8601)

## Error Handling

All errors follow a consistent format:

```json
{
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE",
    "statusCode": 400,
    "validation": [
      {
        "field": "email",
        "message": "Valid email is required",
        "value": "invalid-email"
      }
    ]
  },
  "timestamp": "2024-07-30T12:00:00.000Z",
  "path": "/api/v1/auth/register",
  "method": "POST",
  "requestId": "req-123456"
}
```

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (authentication required)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (resource already exists)
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error

## Authentication Endpoints

### Register User

```http
POST /api/v1/auth/register
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "phone": "+2348012345678",
  "password": "SecurePass123!",
  "role": "household",
  "firstName": "John",
  "lastName": "Doe",
  "businessName": "Optional Business Name"
}
```

**Response:**
```json
{
  "message": "User registered successfully",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "email": "user@example.com",
    "phone": "+2348012345678",
    "role": "household",
    "isActive": true,
    "isVerified": false,
    "createdAt": "2024-07-30T12:00:00.000Z"
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 86400,
    "tokenType": "Bearer"
  }
}
```

### Login

```http
POST /api/v1/auth/login
```

**Request Body:**
```json
{
  "identifier": "user@example.com",
  "password": "SecurePass123!"
}
```

### Refresh Token

```http
POST /api/v1/auth/refresh
```

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Get Current User

```http
GET /api/v1/auth/me
Authorization: Bearer <token>
```

### Logout

```http
POST /api/v1/auth/logout
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

## Order Management Endpoints

### Create Order

```http
POST /api/v1/orders
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "supplierId": "550e8400-e29b-41d4-a716-446655440017",
  "deliveryAddressId": "550e8400-e29b-41d4-a716-446655440020",
  "orderType": "regular",
  "items": [
    {
      "gasTypeId": "550e8400-e29b-41d4-a716-446655440002",
      "quantity": 2,
      "unitPrice": 10500.00,
      "cylinderSize": "12.5kg"
    }
  ],
  "specialInstructions": "Please call before delivery"
}
```

**Response:**
```json
{
  "message": "Order created successfully",
  "order": {
    "id": "550e8400-e29b-41d4-a716-446655440030",
    "orderNumber": "GC1690728000ABC123",
    "userId": "550e8400-e29b-41d4-a716-446655440001",
    "supplierId": "550e8400-e29b-41d4-a716-446655440017",
    "status": "pending",
    "orderType": "regular",
    "priority": "normal",
    "subtotal": 21000.00,
    "taxAmount": 1575.00,
    "deliveryFee": 1500.00,
    "totalAmount": 24075.00,
    "currency": "NGN",
    "createdAt": "2024-07-30T12:00:00.000Z"
  }
}
```

### Get Orders

```http
GET /api/v1/orders?status=pending&limit=20&offset=0
Authorization: Bearer <token>
```

### Get Order by ID

```http
GET /api/v1/orders/{orderId}
Authorization: Bearer <token>
```

### Cancel Order

```http
POST /api/v1/orders/{orderId}/cancel
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "reason": "Changed mind about the order"
}
```

### Emergency SOS Order

```http
POST /api/v1/orders
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "supplierId": "550e8400-e29b-41d4-a716-446655440017",
  "deliveryAddressId": "550e8400-e29b-41d4-a716-446655440020",
  "orderType": "emergency_sos",
  "priority": "emergency",
  "items": [
    {
      "gasTypeId": "550e8400-e29b-41d4-a716-446655440001",
      "quantity": 1,
      "unitPrice": 20000.00,
      "cylinderSize": "10L"
    }
  ],
  "emergencyContactPhone": "+2348012345679",
  "specialInstructions": "URGENT: Medical emergency"
}
```

## Supplier Management Endpoints

### Get Inventory

```http
GET /api/v1/inventory?gasType=cooking&lowStock=true
Authorization: Bearer <token>
```

### Add Inventory Item

```http
POST /api/v1/inventory
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "gasTypeId": "550e8400-e29b-41d4-a716-446655440002",
  "cylinderSize": "12.5kg",
  "quantityAvailable": 100,
  "reorderLevel": 10,
  "unitCost": 8000.00
}
```

### Update Pricing

```http
POST /api/v1/pricing
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "gasTypeId": "550e8400-e29b-41d4-a716-446655440002",
  "cylinderSize": "12.5kg",
  "basePrice": 10500.00,
  "promotionalPrice": 9500.00,
  "bulkDiscountThreshold": 5,
  "bulkDiscountPercentage": 8.0,
  "deliveryFee": 1500.00
}
```

### Get Analytics

```http
GET /api/v1/analytics/dashboard?period=monthly
Authorization: Bearer <token>
```

**Response:**
```json
{
  "period": "monthly",
  "totalOrders": 150,
  "completedOrders": 142,
  "totalRevenue": 1500000.00,
  "averageOrderValue": 10563.38,
  "topSellingProducts": [
    {
      "gasType": "Cooking Gas",
      "cylinderSize": "12.5kg",
      "quantity": 300,
      "revenue": 900000.00
    }
  ],
  "revenueGrowth": 15.5,
  "orderGrowth": 12.3
}
```

## Real-time Updates (WebSocket)

Connect to WebSocket for real-time updates:

```javascript
const socket = io('ws://localhost/ws', {
  auth: {
    token: 'your-jwt-token'
  }
});

// Subscribe to order updates
socket.emit('subscribe_order', orderId);

// Listen for order status changes
socket.on('order_status_changed', (data) => {
  console.log('Order status updated:', data);
});

// Listen for delivery updates
socket.on('delivery_updated', (data) => {
  console.log('Delivery updated:', data);
});

// Send driver location update (drivers only)
socket.emit('driver_location_update', {
  orderId: 'order-id',
  latitude: 6.5244,
  longitude: 3.3792
});
```

## Webhooks

GasConnect supports webhooks for real-time notifications:

### Webhook Events

- `order.created` - New order created
- `order.status.changed` - Order status updated
- `delivery.status.changed` - Delivery status updated
- `payment.processed` - Payment completed
- `user.verified` - User verification completed

### Webhook Payload

```json
{
  "event": "order.status.changed",
  "data": {
    "orderId": "550e8400-e29b-41d4-a716-446655440030",
    "previousStatus": "pending",
    "newStatus": "confirmed",
    "timestamp": "2024-07-30T12:00:00.000Z"
  },
  "timestamp": "2024-07-30T12:00:00.000Z",
  "signature": "sha256=..."
}
```

## SDKs and Libraries

### JavaScript/Node.js

```bash
npm install gasconnect-sdk
```

```javascript
const GasConnect = require('gasconnect-sdk');

const client = new GasConnect({
  apiKey: 'your-api-key',
  environment: 'production' // or 'sandbox'
});

// Create order
const order = await client.orders.create({
  supplierId: 'supplier-id',
  items: [{ gasTypeId: 'gas-type-id', quantity: 2 }]
});
```

### Python

```bash
pip install gasconnect-python
```

```python
import gasconnect

client = gasconnect.Client(
    api_key='your-api-key',
    environment='production'
)

# Create order
order = client.orders.create({
    'supplier_id': 'supplier-id',
    'items': [{'gas_type_id': 'gas-type-id', 'quantity': 2}]
})
```

## Testing

### Test Environment

- **Base URL**: `http://localhost` (Docker Compose)
- **Test Database**: Separate test database with sample data
- **Test Users**: Pre-created test users for each role

### Sample Test Data

```json
{
  "testUsers": {
    "customer": {
      "email": "test.customer@example.com",
      "password": "TestPass123!",
      "role": "household"
    },
    "supplier": {
      "email": "test.supplier@example.com",
      "password": "TestPass123!",
      "role": "supplier"
    },
    "driver": {
      "email": "test.driver@example.com",
      "password": "TestPass123!",
      "role": "delivery_driver"
    }
  }
}
```

## Support

For API support:
- **Documentation**: `/api/docs` on each service
- **Status Page**: `https://status.gasconnect.com`
- **Support Email**: `api-support@gasconnect.com`
- **GitHub Issues**: Create an issue for bugs or feature requests
