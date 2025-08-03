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

# Frontend API Integration Strategy

## 🎯 Integration Overview

**Status**: 85% of APIs ready for immediate integration
**Strategy**: Progressive enhancement with graceful degradation
**Timeline**: Start immediately with existing APIs, enhance as gaps are filled

## 📊 API Readiness Matrix

### ✅ Ready for Immediate Integration (85%)

| Service | Endpoints | Status | Integration Priority |
|---------|-----------|---------|---------------------|
| **Auth Service** | Login, Register, Profile | ✅ Complete | **Critical** |
| **Auth Service** | Address List/Create | ✅ Complete | **High** |
| **Orders Service** | Order CRUD, Status | ✅ Complete | **Critical** |
| **Orders Service** | Delivery Management | ✅ Complete | **High** |
| **Supplier Service** | Inventory, Pricing | ✅ Complete | **Critical** |
| **Supplier Service** | Analytics, Bundles | ✅ Complete | **Medium** |

### ⚠️ Requires Workarounds (10%)

| Service | Endpoints | Workaround Strategy | Timeline |
|---------|-----------|-------------------|----------|
| **Auth Service** | Address Edit/Delete | Delete + Create pattern | Week 1 |
| **Orders Service** | Order Tracking | Status polling fallback | Week 1 |
| **Orders Service** | Real-time Updates | Periodic refresh | Week 2 |

### ❌ Blocked Until Implementation (5%)

| Service | Endpoints | Impact | Expected |
|---------|-----------|---------|----------|
| **Orders Service** | Advanced Tracking | Enhanced UX | Week 2 |
| **Supplier Service** | Payment Processing | Revenue | Week 3 |
| **Auth Service** | Cloud Storage | Scalability | Week 4 |

## 🔧 Integration Architecture

### API Client Configuration

```typescript
// services/api/config.ts
export const API_CONFIG = {
  baseURLs: {
    auth: process.env.REACT_APP_AUTH_SERVICE_URL || 'http://localhost:3001',
    orders: process.env.REACT_APP_ORDERS_SERVICE_URL || 'http://localhost:3002',
    supplier: process.env.REACT_APP_SUPPLIER_SERVICE_URL || 'http://localhost:3003'
  },
  timeout: 10000,
  retries: 3,
  retryDelay: 1000
};

// Feature flags for missing endpoints
export const FEATURE_FLAGS = {
  addressEditing: false, // Enable when PUT /addresses/:id ready
  realTimeTracking: false, // Enable when WebSocket ready
  paymentProcessing: false, // Enable when Paystack ready
  advancedAnalytics: true, // Available now
  fileUpload: true, // Local storage available
  notifications: false // Enable when email/SMS ready
};
```

### Progressive API Client

```typescript
// services/api/client.ts
class ApiClient {
  private baseURL: string;
  private retryCount: number = 0;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  async request<T>(endpoint: string, options: RequestOptions): Promise<T> {
    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TokenService.getAccessToken()}`,
          ...options.headers
        }
      });

      if (response.status === 401) {
        await this.handleTokenRefresh();
        return this.request(endpoint, options);
      }

      if (!response.ok) {
        throw new ApiError(response.status, await response.text());
      }

      return response.json();
    } catch (error) {
      return this.handleError(error, endpoint, options);
    }
  }

  private async handleError<T>(
    error: any,
    endpoint: string,
    options: RequestOptions
  ): Promise<T> {
    // Graceful degradation for missing endpoints
    if (error.status === 404 && this.isMissingEndpoint(endpoint)) {
      return this.getMockResponse(endpoint);
    }

    // Retry logic for network errors
    if (this.shouldRetry(error) && this.retryCount < API_CONFIG.retries) {
      this.retryCount++;
      await this.delay(API_CONFIG.retryDelay * this.retryCount);
      return this.request(endpoint, options);
    }

    throw error;
  }

  private isMissingEndpoint(endpoint: string): boolean {
    const missingEndpoints = [
      '/api/v1/addresses/.*/(edit|delete|default)',
      '/api/v1/tracking/.*',
      '/api/v1/payments/process'
    ];

    return missingEndpoints.some(pattern =>
      new RegExp(pattern).test(endpoint)
    );
  }

  private getMockResponse(endpoint: string): any {
    // Return appropriate mock responses for missing endpoints
    if (endpoint.includes('/tracking/')) {
      return {
        status: 'pending',
        location: null,
        estimatedArrival: null,
        message: 'Enhanced tracking coming soon'
      };
    }

    return { message: 'Feature coming soon' };
  }
}
```

## 🔄 Graceful Degradation Strategies

### 1. Address Management Workaround

```typescript
// services/api/addressService.ts
class AddressService {
  async updateAddress(id: string, data: AddressData): Promise<Address> {
    if (FEATURE_FLAGS.addressEditing) {
      // Use real endpoint when available
      return this.apiClient.put(`/api/v1/addresses/${id}`, data);
    } else {
      // Workaround: Delete + Create pattern
      const addresses = await this.getAddresses();
      const oldAddress = addresses.find(addr => addr.id === id);

      if (!oldAddress) throw new Error('Address not found');

      // Delete old address (when endpoint available)
      // For now, just create new and mark old as inactive client-side
      const newAddress = await this.createAddress({
        ...data,
        isDefault: oldAddress.isDefault
      });

      // Store mapping for cleanup later
      this.storeAddressMapping(id, newAddress.id);

      return newAddress;
    }
  }

  async deleteAddress(id: string): Promise<void> {
    if (FEATURE_FLAGS.addressEditing) {
      return this.apiClient.delete(`/api/v1/addresses/${id}`);
    } else {
      // Soft delete client-side until endpoint ready
      this.markAddressDeleted(id);
      throw new Error('Address deletion temporarily unavailable');
    }
  }

  async setDefaultAddress(id: string): Promise<void> {
    if (FEATURE_FLAGS.addressEditing) {
      return this.apiClient.put(`/api/v1/addresses/${id}/default`);
    } else {
      // Client-side default management
      const addresses = await this.getAddresses();
      addresses.forEach(addr => {
        addr.isDefault = addr.id === id;
      });
      this.cacheAddresses(addresses);
    }
  }
}
```

### 2. Order Tracking Fallback

```typescript
// services/api/trackingService.ts
class TrackingService {
  async getOrderTracking(orderId: string): Promise<TrackingData> {
    if (FEATURE_FLAGS.realTimeTracking) {
      // Use real tracking endpoint
      return this.apiClient.get(`/api/v1/tracking/${orderId}`);
    } else {
      // Fallback to order status polling
      const order = await this.orderService.getOrder(orderId);
      return this.convertOrderStatusToTracking(order);
    }
  }

  private convertOrderStatusToTracking(order: Order): TrackingData {
    const statusMap = {
      'pending': { step: 1, message: 'Order received' },
      'confirmed': { step: 2, message: 'Order confirmed' },
      'preparing': { step: 3, message: 'Preparing your order' },
      'out_for_delivery': { step: 4, message: 'Out for delivery' },
      'delivered': { step: 5, message: 'Delivered' }
    };

    return {
      orderId: order.id,
      status: order.status,
      currentStep: statusMap[order.status]?.step || 1,
      message: statusMap[order.status]?.message || 'Processing',
      estimatedArrival: order.scheduledDeliveryDate,
      location: null, // Not available in fallback
      isRealTime: false
    };
  }

  // Upgrade to real-time when WebSocket available
  subscribeToRealTimeUpdates(orderId: string, callback: (data: TrackingData) => void) {
    if (FEATURE_FLAGS.realTimeTracking) {
      // WebSocket subscription
      this.websocketService.subscribe(`order:${orderId}`, callback);
    } else {
      // Polling fallback
      const interval = setInterval(async () => {
        const tracking = await this.getOrderTracking(orderId);
        callback(tracking);
      }, 30000); // Poll every 30 seconds

      return () => clearInterval(interval);
    }
  }
}
```

### 3. Payment Processing Preparation

```typescript
// services/api/paymentService.ts
class PaymentService {
  async processPayment(paymentData: PaymentData): Promise<PaymentResult> {
    if (FEATURE_FLAGS.paymentProcessing) {
      // Real Paystack integration
      return this.apiClient.post('/api/v1/payments/process', paymentData);
    } else {
      // Mock payment for development
      return this.mockPaymentProcess(paymentData);
    }
  }

  private async mockPaymentProcess(data: PaymentData): Promise<PaymentResult> {
    // Simulate payment processing delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    return {
      success: true,
      transactionId: `mock_${Date.now()}`,
      amount: data.amount,
      currency: data.currency,
      status: 'completed',
      message: 'Payment processed (mock mode)'
    };
  }

  // Prepare for real Paystack integration
  async initializePaystack(orderData: OrderData): Promise<PaystackInitResponse> {
    const paystackData = {
      email: orderData.customerEmail,
      amount: orderData.totalAmount * 100, // Convert to kobo
      currency: 'NGN',
      reference: `gasconnect_${orderData.orderId}_${Date.now()}`,
      callback_url: `${window.location.origin}/payment/callback`,
      metadata: {
        orderId: orderData.orderId,
        customerId: orderData.customerId
      }
    };

    if (FEATURE_FLAGS.paymentProcessing) {
      return this.apiClient.post('/api/v1/payments/initialize', paystackData);
    } else {
      return this.mockPaystackInit(paystackData);
    }
  }
}
```

## 🔄 Real-time Updates Strategy

### WebSocket Integration with Fallback

```typescript
// services/websocket/websocketService.ts
class WebSocketService {
  private socket: Socket | null = null;
  private fallbackIntervals: Map<string, NodeJS.Timeout> = new Map();

  connect(): void {
    if (FEATURE_FLAGS.realTimeTracking) {
      this.socket = io(API_CONFIG.baseURLs.orders, {
        auth: {
          token: TokenService.getAccessToken()
        }
      });

      this.socket.on('connect', () => {
        console.log('WebSocket connected');
        this.clearAllFallbacks();
      });

      this.socket.on('disconnect', () => {
        console.log('WebSocket disconnected, falling back to polling');
        this.activateFallbacks();
      });
    }
  }

  subscribe(channel: string, callback: (data: any) => void): () => void {
    if (this.socket?.connected) {
      // Real-time subscription
      this.socket.on(channel, callback);
      return () => this.socket?.off(channel, callback);
    } else {
      // Polling fallback
      return this.createPollingFallback(channel, callback);
    }
  }

  private createPollingFallback(channel: string, callback: (data: any) => void): () => void {
    const interval = setInterval(async () => {
      try {
        const data = await this.fetchChannelData(channel);
        callback(data);
      } catch (error) {
        console.warn(`Polling fallback failed for ${channel}:`, error);
      }
    }, 10000); // Poll every 10 seconds

    this.fallbackIntervals.set(channel, interval);

    return () => {
      clearInterval(interval);
      this.fallbackIntervals.delete(channel);
    };
  }

  private async fetchChannelData(channel: string): Promise<any> {
    // Convert WebSocket channel to REST endpoint
    if (channel.startsWith('order:')) {
      const orderId = channel.split(':')[1];
      return this.trackingService.getOrderTracking(orderId);
    }

    return null;
  }
}
```

## 📱 Feature Flag Management

```typescript
// services/featureFlags/featureFlags.ts
class FeatureFlagService {
  private flags: Map<string, boolean> = new Map();

  constructor() {
    this.initializeFlags();
    this.setupDynamicUpdates();
  }

  private initializeFlags(): void {
    // Load from environment or API
    Object.entries(FEATURE_FLAGS).forEach(([key, value]) => {
      this.flags.set(key, value);
    });
  }

  private setupDynamicUpdates(): void {
    // Check for backend endpoint availability
    setInterval(async () => {
      await this.checkEndpointAvailability();
    }, 60000); // Check every minute
  }

  private async checkEndpointAvailability(): void {
    const checks = [
      { flag: 'addressEditing', endpoint: '/api/v1/addresses/test/edit' },
      { flag: 'realTimeTracking', endpoint: '/api/v1/tracking/test' },
      { flag: 'paymentProcessing', endpoint: '/api/v1/payments/health' }
    ];

    for (const check of checks) {
      try {
        await fetch(`${API_CONFIG.baseURLs.auth}${check.endpoint}`, {
          method: 'HEAD'
        });
        this.enableFeature(check.flag);
      } catch {
        // Endpoint not available yet
      }
    }
  }

  isEnabled(flag: string): boolean {
    return this.flags.get(flag) || false;
  }

  enableFeature(flag: string): void {
    if (!this.flags.get(flag)) {
      this.flags.set(flag, true);
      this.notifyFeatureEnabled(flag);
    }
  }

  private notifyFeatureEnabled(flag: string): void {
    // Notify components that feature is now available
    window.dispatchEvent(new CustomEvent('featureEnabled', {
      detail: { flag }
    }));
  }
}
```

## 🧪 Testing Strategy

### API Integration Tests

```typescript
// tests/integration/apiIntegration.test.ts
describe('API Integration', () => {
  describe('Existing Endpoints', () => {
    test('should authenticate user successfully', async () => {
      const response = await authService.login({
        identifier: 'test@example.com',
        password: 'password123'
      });

      expect(response.user).toBeDefined();
      expect(response.tokens.accessToken).toBeDefined();
    });

    test('should create order with real API', async () => {
      const order = await orderService.createOrder({
        supplierId: 'test-supplier-id',
        deliveryAddressId: 'test-address-id',
        items: [{ gasTypeId: 'test-gas-id', quantity: 1, unitPrice: 1000 }]
      });

      expect(order.id).toBeDefined();
      expect(order.status).toBe('pending');
    });
  });

  describe('Missing Endpoints', () => {
    test('should handle missing tracking endpoint gracefully', async () => {
      const tracking = await trackingService.getOrderTracking('test-order-id');

      expect(tracking.isRealTime).toBe(false);
      expect(tracking.message).toContain('coming soon');
    });

    test('should fallback to polling for real-time updates', async () => {
      const mockCallback = jest.fn();
      const unsubscribe = trackingService.subscribeToRealTimeUpdates(
        'test-order-id',
        mockCallback
      );

      // Wait for polling interval
      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(mockCallback).toHaveBeenCalled();
      unsubscribe();
    });
  });

  describe('Feature Flags', () => {
    test('should enable features when endpoints become available', async () => {
      // Mock endpoint becoming available
      fetchMock.mockResponseOnce('', { status: 200 });

      await featureFlagService.checkEndpointAvailability();

      expect(featureFlagService.isEnabled('addressEditing')).toBe(true);
    });
  });
});
```

## 📈 Monitoring & Analytics

```typescript
// services/monitoring/apiMonitoring.ts
class ApiMonitoringService {
  trackApiCall(endpoint: string, method: string, duration: number, success: boolean): void {
    // Track API performance and success rates
    analytics.track('api_call', {
      endpoint,
      method,
      duration,
      success,
      timestamp: Date.now()
    });
  }

  trackFeatureUsage(feature: string, fallbackUsed: boolean): void {
    // Track which features are being used and fallback frequency
    analytics.track('feature_usage', {
      feature,
      fallbackUsed,
      timestamp: Date.now()
    });
  }

  trackEndpointAvailability(endpoint: string, available: boolean): void {
    // Track when missing endpoints become available
    analytics.track('endpoint_availability', {
      endpoint,
      available,
      timestamp: Date.now()
    });
  }
}
```

This integration strategy ensures the frontend can start development immediately while gracefully handling missing backend endpoints and progressively enhancing as they become available.

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
