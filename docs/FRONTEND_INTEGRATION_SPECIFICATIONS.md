# **GasConnect Frontend Integration Specifications**

## **Table of Contents**
1. [API Documentation](#api-documentation)
2. [TypeScript Interfaces](#typescript-interfaces)
3. [Authentication Flow](#authentication-flow)
4. [Real-time Features](#real-time-features)
5. [Security Integration](#security-integration)
6. [React Best Practices](#react-best-practices)
7. [Nigerian Market Requirements](#nigerian-market-requirements)
8. [Deployment Configuration](#deployment-configuration)

---

## **1. API Documentation**

### **Service Endpoints Overview**

#### **Auth Service (Port 3001)**
```typescript
// Base URL: http://localhost:3001/api/v1
const AUTH_ENDPOINTS = {
  // Authentication
  register: 'POST /auth/register',
  login: 'POST /auth/login',
  logout: 'POST /auth/logout',
  refresh: 'POST /auth/refresh',
  validate: 'GET /auth/validate',
  me: 'GET /auth/me',
  
  // Verification
  sendEmailVerification: 'POST /auth/send-email-verification',
  verifyEmail: 'POST /auth/verify-email',
  sendPhoneVerification: 'POST /auth/send-phone-verification',
  verifyPhone: 'POST /auth/verify-phone',
  
  // Password Management
  requestPasswordReset: 'POST /auth/request-password-reset',
  resetPassword: 'POST /auth/reset-password',
  changePassword: 'POST /auth/change-password',
  
  // Profile Management
  getProfile: 'GET /profiles',
  updateProfile: 'PUT /profiles',
  uploadAvatar: 'POST /profiles/avatar',
  
  // Address Management
  getAddresses: 'GET /addresses',
  createAddress: 'POST /addresses',
  updateAddress: 'PUT /addresses/:id',
  deleteAddress: 'DELETE /addresses/:id',
  setDefaultAddress: 'PUT /addresses/:id/default',
  
  // User Management (Admin)
  getUsers: 'GET /users',
  getUserById: 'GET /users/:id',
  updateUser: 'PUT /users/:id',
  deleteUser: 'DELETE /users/:id',
  
  // Supplier Management
  getSuppliers: 'GET /suppliers',
  getSupplierById: 'GET /suppliers/:id',
  updateSupplierStatus: 'PUT /suppliers/:id/status',
  
  // Health Check
  health: 'GET /health'
};
```

#### **Orders Service (Port 3002)**
```typescript
// Base URL: http://localhost:3002/api/v1
const ORDERS_ENDPOINTS = {
  // Order Management
  createOrder: 'POST /orders',
  getUserOrders: 'GET /orders',
  getOrderById: 'GET /orders/:id',
  updateOrderStatus: 'PUT /orders/:id/status',
  cancelOrder: 'PUT /orders/:id/cancel',
  
  // Delivery Management
  getDeliveries: 'GET /delivery',
  getDeliveryById: 'GET /delivery/:id',
  updateDeliveryStatus: 'PUT /delivery/:id/status',
  assignDriver: 'PUT /delivery/:id/assign',
  
  // Cylinder Management
  getCylinders: 'GET /cylinders',
  getCylinderById: 'GET /cylinders/:id',
  updateCylinderStatus: 'PUT /cylinders/:id/status',
  createInspection: 'POST /cylinders/:id/inspections',
  
  // Tracking
  getOrderTracking: 'GET /tracking/:orderId',
  updateDriverLocation: 'POST /tracking/:orderId/location',
  
  // Health Check
  health: 'GET /health'
};
```

#### **Supplier Service (Port 3003)**
```typescript
// Base URL: http://localhost:3003/api/v1
const SUPPLIER_ENDPOINTS = {
  // Inventory Management
  getInventory: 'GET /inventory',
  updateInventory: 'PUT /inventory/:id',
  addInventoryItem: 'POST /inventory',
  deleteInventoryItem: 'DELETE /inventory/:id',
  getAvailableSuppliers: 'GET /inventory/available',
  checkReorderAlerts: 'POST /inventory/reorder-alerts/check',
  
  // Pricing Management
  getPricing: 'GET /pricing',
  updatePricing: 'PUT /pricing/:id',
  createPricing: 'POST /pricing',
  deletePricing: 'DELETE /pricing/:id',
  calculatePrice: 'POST /pricing/calculate',
  
  // Payment Management
  initializePayment: 'POST /payments/paystack/initialize',
  verifyPayment: 'GET /payments/paystack/verify/:reference',
  getTransactions: 'GET /payments/transactions',
  processRefund: 'POST /payments/refund',
  
  // Analytics
  getDashboard: 'GET /analytics/dashboard',
  getReports: 'GET /analytics/reports',
  getMetrics: 'GET /analytics/metrics',
  
  // Bundles
  getBundles: 'GET /bundles',
  createBundle: 'POST /bundles',
  updateBundle: 'PUT /bundles/:id',
  deleteBundle: 'DELETE /bundles/:id',
  
  // Health Check
  health: 'GET /health'
};
```

### **Authentication Requirements**

All endpoints except health checks and public endpoints require JWT authentication:

```typescript
// Headers required for authenticated requests
const authHeaders = {
  'Authorization': `Bearer ${accessToken}`,
  'Content-Type': 'application/json',
  'X-Request-ID': generateRequestId(), // Optional but recommended
};
```

### **Error Response Format**

All services return consistent error responses:

```typescript
interface ErrorResponse {
  error: {
    message: string;
    code: string;
    statusCode: number;
    details?: any;
    stack?: string; // Only in development
  };
  timestamp: string;
  path: string;
  method: string;
  requestId: string;
}
```

### **Success Response Format**

```typescript
interface SuccessResponse<T = any> {
  message?: string;
  data?: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    hasNext?: boolean;
    hasPrev?: boolean;
  };
  timestamp: string;
  requestId: string;
}
```

---

## **2. TypeScript Interfaces**

### **Core Data Types**

```typescript
// User and Authentication Types
interface User {
  id: string;
  email: string;
  phone: string;
  role: 'household' | 'supplier' | 'delivery_driver' | 'platform_admin';
  firstName: string;
  lastName: string;
  isActive: boolean;
  isVerified: boolean;
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

interface LoginRequest {
  identifier: string; // email or phone
  password: string;
  rememberMe?: boolean;
}

interface RegisterRequest {
  email: string;
  phone: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'household' | 'supplier' | 'delivery_driver';
  acceptTerms: boolean;
}

// Profile Types
interface UserProfile {
  id: string;
  userId: string;
  dateOfBirth: string | null;
  gender: 'male' | 'female' | 'other' | null;
  occupation: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  preferences: Record<string, any>;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Address {
  id: string;
  userId: string;
  type: 'home' | 'work' | 'other';
  label: string;
  street: string;
  city: string;
  state: string;
  postalCode: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  isDefault: boolean;
  deliveryInstructions: string | null;
  createdAt: string;
  updatedAt: string;
}

// Order Types
interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  supplierId: string;
  deliveryAddressId: string;
  orderType: 'regular' | 'emergency_sos' | 'recurring';
  status: 'pending' | 'confirmed' | 'preparing' | 'out_for_delivery' | 'delivered' | 'cancelled';
  priority: number;
  subtotal: number;
  taxAmount: number;
  deliveryFee: number;
  totalAmount: number;
  specialInstructions: string | null;
  emergencyContactPhone: string | null;
  scheduledDeliveryDate: string | null;
  estimatedDeliveryTime: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  recurringConfig: RecurringConfig | null;
  parentOrderId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface OrderItem {
  id: string;
  orderId: string;
  gasTypeId: string;
  gasTypeName: string;
  cylinderSize: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  specialRequirements: string | null;
  createdAt: string;
}

interface CreateOrderRequest {
  supplierId: string;
  deliveryAddressId: string;
  orderType?: 'regular' | 'emergency_sos' | 'recurring';
  items: {
    gasTypeId: string;
    cylinderSize: string;
    quantity: number;
    specialRequirements?: string;
  }[];
  specialInstructions?: string;
  emergencyContactPhone?: string;
  scheduledDeliveryDate?: string;
  recurringConfig?: RecurringConfig;
}

interface RecurringConfig {
  frequency: 'daily' | 'weekly' | 'monthly';
  interval: number;
  endDate: string | null;
  maxOccurrences: number | null;
  nextOrderDate: string;
}

// Delivery Types
interface Delivery {
  id: string;
  orderId: string;
  driverId: string | null;
  status: 'assigned' | 'in_transit' | 'delivered' | 'failed';
  estimatedArrival: string | null;
  actualArrival: string | null;
  deliveryNotes: string | null;
  signatureUrl: string | null;
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DeliveryTracking {
  id: string;
  orderId: string;
  driverId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: string;
  createdAt: string;
}

// Inventory Types
interface InventoryItem {
  id: string;
  supplierId: string;
  gasTypeId: string;
  gasTypeName: string;
  cylinderSize: string;
  availableQuantity: number;
  reservedQuantity: number;
  reorderLevel: number;
  maxStockLevel: number;
  unitCost: number;
  lastRestockedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface GasType {
  id: string;
  name: string;
  category: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Pricing Types
interface Pricing {
  id: string;
  supplierId: string;
  gasTypeId: string;
  cylinderSize: string;
  basePrice: number;
  customerType: 'household' | 'hospital' | 'artisan';
  minimumQuantity: number;
  maximumQuantity: number | null;
  discountPercentage: number;
  emergencySurcharge: number;
  isActive: boolean;
  validFrom: string;
  validUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PriceCalculationRequest {
  gasTypeId: string;
  cylinderSize: string;
  quantity: number;
  customerType: 'household' | 'hospital' | 'artisan';
  orderType?: 'regular' | 'emergency_sos';
  deliveryAddressId?: string;
}

interface PriceCalculationResponse {
  gasTypeId: string;
  cylinderSize: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  discountAmount: number;
  emergencySurcharge: number;
  deliveryFee: number;
  taxAmount: number;
  totalAmount: number;
  breakdown: {
    basePrice: number;
    discount: number;
    emergency: number;
    delivery: number;
    tax: number;
  };
}

// Payment Types
interface PaymentTransaction {
  id: string;
  userId: string;
  orderId: string | null;
  type: 'payment' | 'refund' | 'payout';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  amount: number;
  currency: string;
  description: string | null;
  externalReference: string | null;
  provider: 'paystack' | 'bank_transfer' | 'cash';
  metadata: Record<string, any> | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PaystackInitializeRequest {
  amount: number;
  currency?: string;
  email: string;
  orderId?: string;
  description?: string;
  callback_url?: string;
}

interface PaystackInitializeResponse {
  message: string;
  transaction: {
    id: string;
    reference: string;
    status: string;
  };
  paystack: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

// Analytics Types
interface DashboardMetrics {
  period: string;
  totalOrders: number;
  completedOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  topSellingProducts: {
    gasType: string;
    cylinderSize: string;
    quantity: number;
    revenue: number;
  }[];
  revenueGrowth: number;
  orderGrowth: number;
}

// WebSocket Types
interface SocketEvents {
  // Client to Server
  subscribe_order: (orderId: string) => void;
  subscribe_delivery: (orderId: string) => void;
  driver_location_update: (data: {
    orderId: string;
    latitude: number;
    longitude: number;
  }) => void;
  emergency_sos: (data: {
    orderId: string;
    location: { latitude: number; longitude: number };
    message: string;
  }) => void;
  order_status_update: (data: {
    orderId: string;
    status: string;
    message?: string;
  }) => void;

  // Server to Client
  order_status_changed: (data: {
    orderId: string;
    status: string;
    message?: string;
    updatedBy: string;
    timestamp: string;
  }) => void;
  order_updated: (data: {
    orderId: string;
    timestamp: string;
    [key: string]: any;
  }) => void;
  delivery_updated: (data: {
    orderId: string;
    timestamp: string;
    [key: string]: any;
  }) => void;
  driver_location: (data: {
    orderId: string;
    driverId: string;
    latitude: number;
    longitude: number;
    timestamp: string;
  }) => void;
  notification: (data: {
    type: string;
    title: string;
    message: string;
    timestamp: string;
    [key: string]: any;
  }) => void;
  emergency_alert: (data: {
    orderId: string;
    userId: string;
    location: { latitude: number; longitude: number };
    message: string;
    timestamp: string;
  }) => void;
  driver_assigned: (data: {
    orderId: string;
    driverId: string;
    timestamp: string;
    [key: string]: any;
  }) => void;
  error: (data: { message: string }) => void;
}
```

---

## **3. Authentication Flow**

### **JWT Token Management**

```typescript
// Token Storage Service
class TokenService {
  private static readonly ACCESS_TOKEN_KEY = 'gasconnect_access_token';
  private static readonly REFRESH_TOKEN_KEY = 'gasconnect_refresh_token';
  private static readonly TOKEN_EXPIRY_KEY = 'gasconnect_token_expiry';

  static setTokens(tokens: AuthTokens): void {
    const expiryTime = Date.now() + (tokens.expiresIn * 1000);

    localStorage.setItem(this.ACCESS_TOKEN_KEY, tokens.accessToken);
    localStorage.setItem(this.REFRESH_TOKEN_KEY, tokens.refreshToken);
    localStorage.setItem(this.TOKEN_EXPIRY_KEY, expiryTime.toString());
  }

  static getAccessToken(): string | null {
    return localStorage.getItem(this.ACCESS_TOKEN_KEY);
  }

  static getRefreshToken(): string | null {
    return localStorage.getItem(this.REFRESH_TOKEN_KEY);
  }

  static isTokenExpired(): boolean {
    const expiry = localStorage.getItem(this.TOKEN_EXPIRY_KEY);
    if (!expiry) return true;

    return Date.now() > parseInt(expiry);
  }

  static clearTokens(): void {
    localStorage.removeItem(this.ACCESS_TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
    localStorage.removeItem(this.TOKEN_EXPIRY_KEY);
  }

  static isAuthenticated(): boolean {
    return !!this.getAccessToken() && !this.isTokenExpired();
  }
}
```

### **API Client with Auto-Refresh**

```typescript
// API Client Service
class ApiClient {
  private baseURL: string;
  private refreshPromise: Promise<AuthTokens> | null = null;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private async refreshTokens(): Promise<AuthTokens> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.performTokenRefresh();

    try {
      const tokens = await this.refreshPromise;
      TokenService.setTokens(tokens);
      return tokens;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async performTokenRefresh(): Promise<AuthTokens> {
    const refreshToken = TokenService.getRefreshToken();
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await fetch(`${this.baseURL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      TokenService.clearTokens();
      throw new Error('Token refresh failed');
    }

    const data = await response.json();
    return data.tokens;
  }

  async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    let accessToken = TokenService.getAccessToken();

    // Check if token needs refresh
    if (TokenService.isTokenExpired() && TokenService.getRefreshToken()) {
      try {
        const tokens = await this.refreshTokens();
        accessToken = tokens.accessToken;
      } catch (error) {
        // Redirect to login
        window.location.href = '/login';
        throw error;
      }
    }

    const headers = {
      'Content-Type': 'application/json',
      ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      ...options.headers,
    };

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers,
    });

    // Handle 401 responses
    if (response.status === 401 && TokenService.getRefreshToken()) {
      try {
        const tokens = await this.refreshTokens();
        // Retry original request with new token
        return this.request(endpoint, {
          ...options,
          headers: {
            ...options.headers,
            Authorization: `Bearer ${tokens.accessToken}`,
          },
        });
      } catch (refreshError) {
        TokenService.clearTokens();
        window.location.href = '/login';
        throw refreshError;
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || 'Request failed');
    }

    return response.json();
  }

  // Convenience methods
  get<T = any>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  post<T = any>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  put<T = any>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  delete<T = any>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}
```
