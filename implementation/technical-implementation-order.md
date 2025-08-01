# **Technical Implementation Order & Integration Points**

## **🔧 Implementation Sequence**

### **1. Foundation Layer (Week 1-2)**

#### **1.1 Project Setup & Configuration**
```bash
# Priority: Critical | Dependencies: None
# Estimated Time: 1 day

# Initialize project
npm create vite@latest gasconnect-frontend -- --template react-ts
cd gasconnect-frontend

# Install dependencies
npm install @tanstack/react-query zustand react-router-dom
npm install socket.io-client axios date-fns
npm install tailwindcss @headlessui/react framer-motion

# Configure build tools
npm install -D @testing-library/react @playwright/test
npm install -D eslint-config-prettier prettier husky
```

#### **1.2 TypeScript Type System**
```typescript
// Priority: Critical | Dependencies: Project Setup
// Estimated Time: 1 day

// src/types/index.ts - Central type exports
export * from './api';
export * from './auth';
export * from './orders';
export * from './common';

// src/types/api.ts - API response types
export interface ApiResponse<T = any> {
  message?: string;
  data?: T;
  meta?: PaginationMeta;
  timestamp: string;
  requestId: string;
}

// src/types/auth.ts - Authentication types
export interface User {
  id: string;
  email: string;
  phone: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  isActive: boolean;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export type UserRole = 'household' | 'supplier' | 'delivery_driver' | 'platform_admin';
```

#### **1.3 Environment Configuration**
```typescript
// Priority: Critical | Dependencies: Project Setup
// Estimated Time: 0.5 days

// src/config/env.ts
interface EnvironmentConfig {
  authServiceUrl: string;
  ordersServiceUrl: string;
  supplierServiceUrl: string;
  websocketUrl: string;
  paystackPublicKey: string;
  googleMapsApiKey: string;
  isDevelopment: boolean;
  isProduction: boolean;
}

export const env: EnvironmentConfig = {
  authServiceUrl: import.meta.env.VITE_AUTH_SERVICE_URL || 'http://localhost:3001',
  ordersServiceUrl: import.meta.env.VITE_ORDERS_SERVICE_URL || 'http://localhost:3002',
  supplierServiceUrl: import.meta.env.VITE_SUPPLIER_SERVICE_URL || 'http://localhost:3003',
  websocketUrl: import.meta.env.VITE_WEBSOCKET_URL || 'ws://localhost:3001',
  paystackPublicKey: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '',
  googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
  isDevelopment: import.meta.env.DEV,
  isProduction: import.meta.env.PROD,
};
```

### **2. Core Services Layer (Week 2)**

#### **2.1 Token Management Service**
```typescript
// Priority: Critical | Dependencies: Type System
// Estimated Time: 1 day

// src/services/storage/TokenService.ts
export class TokenService {
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
}
```

#### **2.2 API Client Implementation**
```typescript
// Priority: Critical | Dependencies: Token Service
// Estimated Time: 2 days

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
    let accessToken = TokenService.getAccessToken();

    // Auto-refresh logic
    if (TokenService.isTokenExpired() && TokenService.getRefreshToken()) {
      try {
        const tokens = await this.refreshTokens();
        accessToken = tokens.accessToken;
      } catch (error) {
        TokenService.clearTokens();
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

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(errorData.error?.message || 'Request failed', response.status);
    }

    return response.json();
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
}

// src/services/api/clients.ts
export const authApi = new ApiClient(env.authServiceUrl);
export const ordersApi = new ApiClient(env.ordersServiceUrl);
export const supplierApi = new ApiClient(env.supplierServiceUrl);
```

#### **2.3 State Management Setup**
```typescript
// Priority: Critical | Dependencies: API Client
// Estimated Time: 1 day

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
      user: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (credentials) => {
        set({ isLoading: true });
        try {
          const response = await authApi.post<{
            user: User;
            tokens: AuthTokens;
          }>('/api/v1/auth/login', credentials);

          TokenService.setTokens(response.tokens);
          set({ 
            user: response.user, 
            isAuthenticated: true, 
            isLoading: false 
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: async () => {
        try {
          const refreshToken = TokenService.getRefreshToken();
          if (refreshToken) {
            await authApi.post('/api/v1/auth/logout', { refreshToken });
          }
        } catch (error) {
          console.error('Logout error:', error);
        } finally {
          TokenService.clearTokens();
          set({ user: null, isAuthenticated: false });
        }
      },

      refreshUser: async () => {
        if (!TokenService.isAuthenticated()) {
          set({ user: null, isAuthenticated: false, isLoading: false });
          return;
        }

        set({ isLoading: true });
        try {
          const userData = await authApi.get<User>('/api/v1/auth/me');
          set({ 
            user: userData, 
            isAuthenticated: true, 
            isLoading: false 
          });
        } catch (error) {
          TokenService.clearTokens();
          set({ user: null, isAuthenticated: false, isLoading: false });
        }
      },
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

// src/providers/QueryProvider.tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status === 401) {
          return false; // Don't retry auth errors
        }
        return failureCount < 3;
      },
    },
  },
});

export const QueryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
};
```

### **3. UI Foundation Layer (Week 3)**

#### **3.1 Design System Components**
```typescript
// Priority: High | Dependencies: Project Setup
// Estimated Time: 3 days

// src/components/ui/Button.tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  leftIcon,
  rightIcon,
  children,
  className,
  ...props
}) => {
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';
  
  const variantClasses = {
    primary: 'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
    ghost: 'text-gray-700 hover:bg-gray-100 focus:ring-gray-500',
  };

  const sizeClasses = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      className={cn(
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        (disabled || loading) && 'opacity-50 cursor-not-allowed',
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <LoadingSpinner className="mr-2" />}
      {leftIcon && !loading && <span className="mr-2">{leftIcon}</span>}
      {children}
      {rightIcon && <span className="ml-2">{rightIcon}</span>}
    </button>
  );
};

// src/components/ui/Input.tsx
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  className,
  id,
  ...props
}) => {
  const inputId = id || useId();

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-700">
          {label}
          {props.required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="relative">
        {leftIcon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            {leftIcon}
          </div>
        )}
        
        <input
          id={inputId}
          className={cn(
            'block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500',
            leftIcon && 'pl-10',
            rightIcon && 'pr-10',
            error && 'border-red-300 focus:border-red-500 focus:ring-red-500',
            className
          )}
          {...props}
        />
        
        {rightIcon && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
            {rightIcon}
          </div>
        )}
      </div>
      
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
      
      {helperText && !error && (
        <p className="text-sm text-gray-500">{helperText}</p>
      )}
    </div>
  );
};
```

#### **3.2 Layout Components**
```typescript
// Priority: High | Dependencies: UI Components
// Estimated Time: 2 days

// src/components/layout/AppLayout.tsx
export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      
      <div className="flex">
        <Sidebar 
          isOpen={sidebarOpen} 
          onClose={() => setSidebarOpen(false)}
          userRole={user?.role}
        />
        
        <main className="flex-1 p-6 lg:pl-64">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

// src/components/layout/Header.tsx
export const Header: React.FC<{ onMenuClick: () => void }> = ({ onMenuClick }) => {
  const { user, logout } = useAuth();
  const { notifications } = useNotifications();

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <button
              onClick={onMenuClick}
              className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-500"
            >
              <MenuIcon className="h-6 w-6" />
            </button>
            
            <div className="flex-shrink-0 lg:hidden">
              <Logo className="h-8 w-auto" />
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <NotificationDropdown notifications={notifications} />
            <UserDropdown user={user} onLogout={logout} />
          </div>
        </div>
      </div>
    </header>
  );
};
```

### **4. Authentication Layer (Week 4)**

#### **4.1 Authentication Pages**
```typescript
// Priority: Critical | Dependencies: UI Components, Auth Store
// Estimated Time: 2 days

// src/pages/auth/LoginPage.tsx
export const LoginPage: React.FC = () => {
  const { login, isLoading } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const form = useForm<LoginRequest>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      identifier: '',
      password: '',
      rememberMe: false,
    },
  });

  const handleSubmit = async (data: LoginRequest) => {
    try {
      await login(data);
      const from = location.state?.from?.pathname || '/dashboard';
      navigate(from, { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Login failed');
    }
  };

  return (
    <AuthLayout>
      <div className="max-w-md w-full space-y-8">
        <div>
          <Logo className="mx-auto h-12 w-auto" />
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to your account
          </h2>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={form.handleSubmit(handleSubmit)}>
          <div className="space-y-4">
            <Input
              label="Email or Phone"
              type="text"
              autoComplete="username"
              required
              {...form.register('identifier')}
              error={form.formState.errors.identifier?.message}
            />
            
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              required
              {...form.register('password')}
              error={form.formState.errors.password?.message}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                id="remember-me"
                type="checkbox"
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                {...form.register('rememberMe')}
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-900">
                Remember me
              </label>
            </div>

            <div className="text-sm">
              <Link
                to="/forgot-password"
                className="font-medium text-primary-600 hover:text-primary-500"
              >
                Forgot your password?
              </Link>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full"
            loading={isLoading}
          >
            Sign in
          </Button>
        </form>

        <div className="text-center">
          <span className="text-sm text-gray-600">
            Don't have an account?{' '}
            <Link
              to="/register"
              className="font-medium text-primary-600 hover:text-primary-500"
            >
              Sign up
            </Link>
          </span>
        </div>
      </div>
    </AuthLayout>
  );
};
```

#### **4.2 Protected Routes System**
```typescript
// Priority: Critical | Dependencies: Auth Store
// Estimated Time: 1 day

// src/components/auth/ProtectedRoute.tsx
interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
  requiredRoles?: UserRole[];
  fallback?: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRole,
  requiredRoles,
  fallback = <Navigate to="/unauthorized" replace />,
}) => {
  const { isAuthenticated, user, isLoading } = useAuthStore();
  const location = useLocation();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredRole && user?.role !== requiredRole) {
    return fallback;
  }

  if (requiredRoles && !requiredRoles.includes(user?.role as UserRole)) {
    return fallback;
  }

  return <>{children}</>;
};

// src/App.tsx
export const App: React.FC = () => {
  const { refreshUser } = useAuthStore();

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  return (
    <QueryProvider>
      <BrowserRouter>
        <Toaster position="top-right" />
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          
          {/* Protected routes */}
          <Route path="/" element={
            <ProtectedRoute>
              <AppLayout>
                <Outlet />
              </AppLayout>
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            
            {/* Order routes */}
            <Route path="orders/*" element={<OrderRoutes />} />
            
            {/* Profile routes */}
            <Route path="profile/*" element={<ProfileRoutes />} />
            
            {/* Admin routes */}
            <Route path="admin/*" element={
              <ProtectedRoute requiredRole="platform_admin">
                <AdminRoutes />
              </ProtectedRoute>
            } />
          </Route>
          
          {/* Error routes */}
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </QueryProvider>
  );
};
```

## **🔗 Critical Integration Points**

### **Integration Point 1: Authentication Service**
```typescript
// Test: User login and token management
const testAuthIntegration = async () => {
  // 1. Test login endpoint
  const loginResponse = await authApi.post('/api/v1/auth/login', {
    identifier: 'test@example.com',
    password: 'password123',
  });
  
  // 2. Verify token storage
  expect(TokenService.getAccessToken()).toBeTruthy();
  
  // 3. Test protected endpoint access
  const userResponse = await authApi.get('/api/v1/auth/me');
  expect(userResponse.data.email).toBe('test@example.com');
  
  // 4. Test token refresh
  // Simulate expired token and verify auto-refresh
};
```

### **Integration Point 2: Orders Service**
```typescript
// Test: Order creation and management
const testOrdersIntegration = async () => {
  // 1. Test order creation
  const orderData: CreateOrderRequest = {
    supplierId: 'supplier-1',
    deliveryAddressId: 'address-1',
    items: [
      {
        gasTypeId: 'gas-1',
        cylinderSize: '12.5kg',
        quantity: 2,
      },
    ],
  };
  
  const orderResponse = await ordersApi.post('/api/v1/orders', orderData);
  expect(orderResponse.data.status).toBe('pending');
  
  // 2. Test order retrieval
  const ordersResponse = await ordersApi.get('/api/v1/orders');
  expect(ordersResponse.data.length).toBeGreaterThan(0);
  
  // 3. Test order tracking
  const trackingResponse = await ordersApi.get(`/api/v1/tracking/${orderResponse.data.id}`);
  expect(trackingResponse.data.orderId).toBe(orderResponse.data.id);
};
```

### **Integration Point 3: WebSocket Connection**
```typescript
// Test: Real-time features
const testWebSocketIntegration = async () => {
  const wsService = new WebSocketService();
  
  // 1. Test connection
  const socket = await wsService.connect();
  expect(socket.connected).toBe(true);
  
  // 2. Test order subscription
  socket.emit('subscribe_order', 'order-1');
  
  // 3. Test real-time updates
  const statusUpdate = await new Promise((resolve) => {
    socket.on('order_status_changed', resolve);
    // Trigger status change from backend
  });
  
  expect(statusUpdate.orderId).toBe('order-1');
};
```

### **Integration Point 4: Payment Processing**
```typescript
// Test: Paystack integration
const testPaymentIntegration = async () => {
  // 1. Test payment initialization
  const paymentData = {
    amount: 18275.00,
    email: 'test@example.com',
    orderId: 'order-1',
  };
  
  const initResponse = await supplierApi.post('/api/v1/payments/paystack/initialize', paymentData);
  expect(initResponse.data.paystack.authorization_url).toBeTruthy();
  
  // 2. Test payment verification
  const verifyResponse = await supplierApi.get(`/api/v1/payments/paystack/verify/${initResponse.data.paystack.reference}`);
  expect(verifyResponse.data.transaction.status).toBe('completed');
};
```

This technical implementation order provides a clear sequence for building the frontend application with proper dependencies and integration points to ensure seamless connectivity with the backend services.
