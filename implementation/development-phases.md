# **GasConnect Frontend Development Phases**

## **Phase 2: Core Infrastructure & Authentication (Week 2)**

### **2.1 TypeScript Types & Interfaces**

**Priority: Critical**
**Estimated Time: 2 days**

```typescript
// src/types/api.ts
export interface ApiResponse<T = any> {
  message?: string;
  data?: T;
  meta?: PaginationMeta;
  timestamp: string;
  requestId: string;
}

export interface ApiError {
  error: {
    message: string;
    code: string;
    statusCode: number;
    details?: any;
  };
  timestamp: string;
  path: string;
  method: string;
  requestId: string;
}

// src/types/auth.ts
export interface User {
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

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface LoginRequest {
  identifier: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterRequest {
  email: string;
  phone: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'household' | 'supplier' | 'delivery_driver';
  acceptTerms: boolean;
}
```

### **2.2 API Client Implementation**

**Priority: Critical**
**Estimated Time: 3 days**

```typescript
// src/services/api/ApiClient.ts
export class ApiClient {
  private baseURL: string;
  private refreshPromise: Promise<AuthTokens> | null = null;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    // Implementation with auto-refresh logic
    // Error handling and retry logic
    // Request/response interceptors
  }

  // Convenience methods
  get<T = any>(endpoint: string): Promise<T> { /* */ }
  post<T = any>(endpoint: string, data?: any): Promise<T> { /* */ }
  put<T = any>(endpoint: string, data?: any): Promise<T> { /* */ }
  delete<T = any>(endpoint: string): Promise<T> { /* */ }
}

// src/services/api/clients.ts
export const authApi = new ApiClient(import.meta.env.VITE_AUTH_SERVICE_URL);
export const ordersApi = new ApiClient(import.meta.env.VITE_ORDERS_SERVICE_URL);
export const supplierApi = new ApiClient(import.meta.env.VITE_SUPPLIER_SERVICE_URL);
```

### **2.3 Authentication Store & Hooks**

**Priority: Critical**
**Estimated Time: 2 days**

```typescript
// src/stores/authStore.ts
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Implementation
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ 
        user: state.user, 
        isAuthenticated: state.isAuthenticated 
      }),
    }
  )
);

// src/hooks/auth/useAuth.ts
export const useAuth = () => {
  const authStore = useAuthStore();
  
  return {
    ...authStore,
    isLoading: authStore.isLoading,
    hasRole: (role: string) => authStore.user?.role === role,
    hasAnyRole: (roles: string[]) => roles.includes(authStore.user?.role || ''),
  };
};
```

**Deliverables for Phase 2:**
- ✅ Complete TypeScript type definitions
- ✅ API client with auto-refresh functionality
- ✅ Authentication store with persistence
- ✅ Token management service
- ✅ Basic error handling

**Integration Test:**
```bash
# Test API connectivity
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"test@example.com","password":"password"}'
```

---

## **Phase 3: UI Foundation & Components (Week 3)**

### **3.1 Design System Components**

**Priority: High**
**Estimated Time: 4 days**

```typescript
// src/components/ui/Button.tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ /* */ }) => {
  // Implementation with accessibility
};

// src/components/ui/Input.tsx
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({ /* */ }) => {
  // Implementation with validation states
};

// Additional components: Modal, Toast, Card, Badge, etc.
```

### **3.2 Layout Components**

**Priority: High**
**Estimated Time: 2 days**

```typescript
// src/components/layout/AppLayout.tsx
export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

// src/components/layout/Header.tsx
export const Header: React.FC = () => {
  const { user, logout } = useAuth();
  
  return (
    <header className="bg-white shadow-sm border-b">
      {/* Navigation, user menu, notifications */}
    </header>
  );
};
```

### **3.3 Form Components**

**Priority: High**
**Estimated Time: 2 days**

```typescript
// src/components/forms/FormField.tsx
interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactElement;
}

export const FormField: React.FC<FormFieldProps> = ({ /* */ }) => {
  // Implementation with accessibility
};

// src/components/forms/PhoneInput.tsx
export const PhoneInput: React.FC<PhoneInputProps> = ({ /* */ }) => {
  const { value, isValid, carrier, onChange } = usePhoneInput();
  
  return (
    <div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="+234 801 234 5678"
      />
      {carrier && <span className="text-sm text-gray-500">{carrier}</span>}
    </div>
  );
};
```

**Deliverables for Phase 3:**
- ✅ Complete design system components
- ✅ Responsive layout components
- ✅ Form components with validation
- ✅ Nigerian phone input component
- ✅ Storybook documentation (optional)

**Validation:**
- All components render correctly
- Responsive design works on mobile/desktop
- Accessibility features implemented
- Form validation working

---

## **Phase 4: Authentication Pages (Week 4)**

### **4.1 Login & Registration Pages**

**Priority: Critical**
**Estimated Time: 3 days**

```typescript
// src/pages/auth/LoginPage.tsx
export const LoginPage: React.FC = () => {
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();
  
  const handleSubmit = async (data: LoginRequest) => {
    try {
      await login(data);
      navigate('/dashboard');
    } catch (error) {
      // Handle error
    }
  };

  return (
    <AuthLayout>
      <LoginForm onSubmit={handleSubmit} loading={isLoading} />
    </AuthLayout>
  );
};

// src/pages/auth/RegisterPage.tsx
export const RegisterPage: React.FC = () => {
  const { register, isLoading } = useAuth();
  
  return (
    <AuthLayout>
      <RegisterForm onSubmit={handleRegister} loading={isLoading} />
    </AuthLayout>
  );
};
```

### **4.2 Protected Routes & Navigation**

**Priority: Critical**
**Estimated Time: 2 days**

```typescript
// src/components/auth/ProtectedRoute.tsx
interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string;
  requiredRoles?: string[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requiredRole, 
  requiredRoles 
}) => {
  const { isAuthenticated, user, isLoading } = useAuth();
  
  if (isLoading) return <LoadingSpinner />;
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to="/unauthorized" replace />;
  }
  
  if (requiredRoles && !requiredRoles.includes(user?.role || '')) {
    return <Navigate to="/unauthorized" replace />;
  }
  
  return <>{children}</>;
};

// src/App.tsx
export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={
            <ProtectedRoute>
              <AppLayout>
                <Outlet />
              </AppLayout>
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="orders/*" element={<OrderRoutes />} />
            <Route path="profile/*" element={<ProfileRoutes />} />
          </Route>
        </Routes>
      </QueryClientProvider>
    </BrowserRouter>
  );
};
```

**Deliverables for Phase 4:**
- ✅ Login and registration pages
- ✅ Protected route system
- ✅ Role-based access control
- ✅ Navigation and routing
- ✅ Email/phone verification flows

**Integration Test:**
- User can register new account
- User can login with credentials
- Protected routes redirect to login
- Role-based access works correctly

---

## **Phase 5: Order Management (Week 5-6)**

### **5.1 Order Creation Flow**

**Priority: Critical**
**Estimated Time: 4 days**

```typescript
// src/pages/orders/CreateOrderPage.tsx
export const CreateOrderPage: React.FC = () => {
  const [step, setStep] = useState(1);
  const [orderData, setOrderData] = useState<Partial<CreateOrderRequest>>({});
  
  const steps = [
    { id: 1, name: 'Select Supplier', component: SupplierSelection },
    { id: 2, name: 'Choose Items', component: ItemSelection },
    { id: 3, name: 'Delivery Details', component: DeliveryDetails },
    { id: 4, name: 'Review & Confirm', component: OrderReview },
  ];
  
  return (
    <div className="max-w-4xl mx-auto">
      <OrderSteps currentStep={step} steps={steps} />
      <div className="mt-8">
        {steps.find(s => s.id === step)?.component && (
          <StepComponent
            data={orderData}
            onNext={(data) => {
              setOrderData({ ...orderData, ...data });
              setStep(step + 1);
            }}
            onBack={() => setStep(step - 1)}
          />
        )}
      </div>
    </div>
  );
};

// src/components/orders/SupplierSelection.tsx
export const SupplierSelection: React.FC<StepProps> = ({ onNext }) => {
  const { data: suppliers, isLoading } = useAvailableSuppliers();
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {suppliers?.map(supplier => (
        <SupplierCard
          key={supplier.id}
          supplier={supplier}
          onSelect={() => onNext({ supplierId: supplier.id })}
        />
      ))}
    </div>
  );
};
```

### **5.2 Order Management & History**

**Priority: High**
**Estimated Time: 3 days**

```typescript
// src/pages/orders/OrdersPage.tsx
export const OrdersPage: React.FC = () => {
  const [filters, setFilters] = useState<OrderFilters>({});
  const { data: orders, isLoading } = useOrders(filters);
  
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">My Orders</h1>
        <Button onClick={() => navigate('/orders/create')}>
          Create Order
        </Button>
      </div>
      
      <OrderFilters filters={filters} onChange={setFilters} />
      
      <div className="space-y-4">
        {orders?.data.map(order => (
          <OrderCard key={order.id} order={order} />
        ))}
      </div>
      
      {orders?.meta && (
        <Pagination
          currentPage={orders.meta.page}
          totalPages={Math.ceil(orders.meta.total / orders.meta.limit)}
          onPageChange={(page) => setFilters({ ...filters, page })}
        />
      )}
    </div>
  );
};

// src/hooks/api/useOrders.ts
export const useOrders = (filters: OrderFilters) => {
  return useQuery({
    queryKey: ['orders', filters],
    queryFn: () => ordersApi.getOrders(filters),
    staleTime: 5 * 60 * 1000,
  });
};

export const useCreateOrder = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (orderData: CreateOrderRequest) => 
      ordersApi.createOrder(orderData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
};
```

**Deliverables for Phase 5:**
- ✅ Multi-step order creation flow
- ✅ Supplier selection with inventory
- ✅ Item selection with pricing
- ✅ Order history and management
- ✅ Order status updates

**Integration Test:**
- Complete order creation flow works
- Orders display correctly with pagination
- Order status updates reflect backend changes
- Price calculation matches backend

---

## **Phase 6: Real-time Features & Tracking (Week 7)**

### **6.1 WebSocket Integration**

**Priority: High**
**Estimated Time: 3 days**

```typescript
// src/services/websocket/WebSocketService.ts
export class WebSocketService {
  private socket: Socket | null = null;
  
  connect(): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const token = TokenService.getAccessToken();
      
      this.socket = io(import.meta.env.VITE_WEBSOCKET_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
      });
      
      this.socket.on('connect', () => resolve(this.socket!));
      this.socket.on('connect_error', reject);
    });
  }
  
  subscribeToOrder(orderId: string): void {
    this.socket?.emit('subscribe_order', orderId);
  }
  
  on<T = any>(event: string, callback: (data: T) => void): void {
    this.socket?.on(event, callback);
  }
}

// src/hooks/websocket/useOrderTracking.ts
export const useOrderTracking = (orderId: string) => {
  const { socket } = useWebSocket();
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const [deliveryLocation, setDeliveryLocation] = useState<Location | null>(null);
  
  useEffect(() => {
    if (!socket || !orderId) return;
    
    socket.emit('subscribe_order', orderId);
    
    const handleStatusChange = (data: OrderStatusUpdate) => {
      if (data.orderId === orderId) {
        setOrderStatus(data.status);
      }
    };
    
    const handleLocationUpdate = (data: LocationUpdate) => {
      if (data.orderId === orderId) {
        setDeliveryLocation({
          latitude: data.latitude,
          longitude: data.longitude,
          timestamp: data.timestamp,
        });
      }
    };
    
    socket.on('order_status_changed', handleStatusChange);
    socket.on('driver_location', handleLocationUpdate);
    
    return () => {
      socket.off('order_status_changed', handleStatusChange);
      socket.off('driver_location', handleLocationUpdate);
    };
  }, [socket, orderId]);
  
  return { orderStatus, deliveryLocation };
};
```

### **6.2 Order Tracking Page**

**Priority: High**
**Estimated Time: 2 days**

```typescript
// src/pages/orders/OrderTrackingPage.tsx
export const OrderTrackingPage: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const { data: order } = useOrder(orderId!);
  const { orderStatus, deliveryLocation } = useOrderTracking(orderId!);
  
  return (
    <div className="max-w-4xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <OrderDetails order={order} currentStatus={orderStatus} />
          <OrderTimeline order={order} />
        </div>
        
        <div>
          <DeliveryMap
            order={order}
            driverLocation={deliveryLocation}
          />
          <DriverInfo driver={order?.delivery?.driver} />
        </div>
      </div>
    </div>
  );
};

// src/components/orders/DeliveryMap.tsx
export const DeliveryMap: React.FC<DeliveryMapProps> = ({ 
  order, 
  driverLocation 
}) => {
  return (
    <div className="h-96 bg-gray-200 rounded-lg">
      {/* Google Maps integration */}
      <GoogleMap
        center={driverLocation || order.deliveryAddress}
        zoom={15}
      >
        {driverLocation && (
          <Marker
            position={driverLocation}
            icon="/driver-icon.png"
          />
        )}
        <Marker
          position={order.deliveryAddress}
          icon="/destination-icon.png"
        />
      </GoogleMap>
    </div>
  );
};
```

**Deliverables for Phase 6:**
- ✅ WebSocket service integration
- ✅ Real-time order status updates
- ✅ Live driver location tracking
- ✅ Interactive delivery map
- ✅ Order timeline component

**Integration Test:**
- WebSocket connection establishes successfully
- Real-time updates received and displayed
- Map shows correct locations
- Order status changes reflect immediately

---

## **Phase 7: Payment Integration (Week 8)**

### **7.1 Paystack Integration**

**Priority: Critical**
**Estimated Time: 3 days**

```typescript
// src/services/payment/PaystackService.ts
export class PaystackService {
  static async initializePayment(config: PaymentConfig): Promise<void> {
    await this.loadPaystackScript();
    
    const handler = window.PaystackPop.setup({
      key: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY,
      email: config.email,
      amount: Math.round(config.amount * 100),
      currency: 'NGN',
      callback: config.onSuccess,
      onClose: config.onCancel,
    });
    
    handler.openIframe();
  }
}

// src/hooks/payment/usePaystackPayment.ts
export const usePaystackPayment = () => {
  const [isLoading, setIsLoading] = useState(false);
  const initializePaymentMutation = useInitializePayment();
  const verifyPaymentMutation = useVerifyPayment();
  
  const processPayment = async (config: PaymentConfig) => {
    setIsLoading(true);
    
    try {
      // Initialize payment with backend
      const { data } = await initializePaymentMutation.mutateAsync({
        amount: config.amount,
        email: config.email,
        orderId: config.orderId,
      });
      
      // Open Paystack popup
      await PaystackService.initializePayment({
        ...config,
        onSuccess: async (reference: string) => {
          // Verify payment
          await verifyPaymentMutation.mutateAsync(reference);
          config.onSuccess(reference);
        },
      });
    } catch (error) {
      config.onError?.(error);
    } finally {
      setIsLoading(false);
    }
  };
  
  return { processPayment, isLoading };
};
```

### **7.2 Payment Flow Pages**

**Priority: Critical**
**Estimated Time: 2 days**

```typescript
// src/pages/orders/PaymentPage.tsx
export const PaymentPage: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const { data: order } = useOrder(orderId!);
  const { processPayment, isLoading } = usePaystackPayment();
  const navigate = useNavigate();
  
  const handlePayment = async () => {
    if (!order) return;
    
    await processPayment({
      amount: order.totalAmount,
      email: order.user.email,
      orderId: order.id,
      onSuccess: (reference) => {
        navigate(`/orders/${orderId}/payment-success?ref=${reference}`);
      },
      onError: (error) => {
        toast.error('Payment failed. Please try again.');
      },
    });
  };
  
  return (
    <div className="max-w-2xl mx-auto">
      <PaymentSummary order={order} />
      <PaymentMethods onPayWithPaystack={handlePayment} />
    </div>
  );
};
```

**Deliverables for Phase 7:**
- ✅ Paystack payment integration
- ✅ Payment flow pages
- ✅ Payment verification
- ✅ Payment status handling
- ✅ Error handling and retry logic

**Integration Test:**
- Payment initialization works with backend
- Paystack popup opens correctly
- Payment verification completes
- Order status updates after payment

---

## **Phase 8: Nigerian Market Features & Polish (Week 9-10)**

### **8.1 Nigerian Utilities**

**Priority: Medium**
**Estimated Time: 2 days**

```typescript
// src/utils/formatting/NigerianPhoneUtils.ts
export class NigerianPhoneUtils {
  static formatNigerianPhone(phone: string): string {
    // Implementation for Nigerian phone formatting
  }
  
  static validateNigerianPhone(phone: string): boolean {
    // Implementation for Nigerian phone validation
  }
  
  static getCarrier(phone: string): string {
    // Implementation to detect carrier
  }
}

// src/utils/formatting/NairaCurrencyUtils.ts
export class NairaCurrencyUtils {
  static formatNaira(amount: number, options?: FormatOptions): string {
    // Implementation for Naira formatting
  }
  
  static parseNaira(value: string): number {
    // Implementation for parsing Naira values
  }
}
```

### **8.2 Performance Optimization**

**Priority: Medium**
**Estimated Time: 3 days**

```typescript
// Code splitting
const OrdersPage = lazy(() => import('@/pages/orders/OrdersPage'));
const ProfilePage = lazy(() => import('@/pages/profile/ProfilePage'));

// Image optimization
const OptimizedImage: React.FC<ImageProps> = ({ src, alt, ...props }) => {
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      {...props}
    />
  );
};

// Virtual scrolling for large lists
const VirtualizedOrderList: React.FC = () => {
  return (
    <FixedSizeList
      height={600}
      itemCount={orders.length}
      itemSize={120}
    >
      {({ index, style }) => (
        <div style={style}>
          <OrderCard order={orders[index]} />
        </div>
      )}
    </FixedSizeList>
  );
};
```

**Deliverables for Phase 8:**
- ✅ Nigerian phone/currency utilities
- ✅ Performance optimizations
- ✅ Code splitting implementation
- ✅ Mobile responsiveness polish
- ✅ Accessibility improvements

**Final Integration Test:**
- Complete user journey testing
- Performance benchmarking
- Cross-browser testing
- Mobile device testing
- Accessibility audit

---

## **🎯 Key Milestones & Validation Points**

### **Milestone 1: Foundation Complete (End of Week 2)**
- ✅ Authentication system working
- ✅ API integration functional
- ✅ Basic routing implemented
- **Validation**: User can login and access protected routes

### **Milestone 2: Core UI Ready (End of Week 3)**
- ✅ Design system components complete
- ✅ Layout and navigation working
- ✅ Form components functional
- **Validation**: UI components render correctly across devices

### **Milestone 3: Order Management Live (End of Week 6)**
- ✅ Order creation flow complete
- ✅ Order history and management working
- ✅ Real-time tracking functional
- **Validation**: Complete order lifecycle works end-to-end

### **Milestone 4: Payment Integration (End of Week 8)**
- ✅ Paystack payment working
- ✅ Payment verification complete
- ✅ Order status updates after payment
- **Validation**: Payment flow works with real transactions

### **Milestone 5: Production Ready (End of Week 10)**
- ✅ All features implemented
- ✅ Performance optimized
- ✅ Testing complete
- ✅ Nigerian market features working
- **Validation**: Application ready for production deployment

This implementation plan provides a structured approach to building the GasConnect React frontend, with clear phases, deliverables, and validation points to ensure successful integration with the existing backend services.
