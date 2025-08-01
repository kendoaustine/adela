# **GasConnect Frontend Integration Specifications - Part 2**

## **5. Security Integration**

### **CORS Configuration**

```typescript
// Environment Configuration
const CORS_CONFIG = {
  development: {
    origin: ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
  },
  production: {
    origin: ['https://gasconnect.com', 'https://app.gasconnect.com'],
    credentials: true,
  },
};
```

### **Content Security Policy (CSP)**

```html
<!-- Add to public/index.html -->
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.paystack.co;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  img-src 'self' data: https: blob:;
  font-src 'self' https://fonts.gstatic.com;
  connect-src 'self' wss: ws: https://api.paystack.co;
  media-src 'self';
  object-src 'none';
  child-src 'none';
  frame-ancestors 'none';
  form-action 'self';
  base-uri 'self';
">
```

### **Secure Token Storage**

```typescript
// Secure Storage Service
class SecureStorage {
  private static readonly ENCRYPTION_KEY = 'gasconnect_secure_key';

  static async encrypt(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.ENCRYPTION_KEY),
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      dataBuffer
    );

    const result = new Uint8Array(iv.length + encrypted.byteLength);
    result.set(iv);
    result.set(new Uint8Array(encrypted), iv.length);

    return btoa(String.fromCharCode(...result));
  }

  static async decrypt(encryptedData: string): Promise<string> {
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    
    const data = new Uint8Array(
      atob(encryptedData).split('').map(char => char.charCodeAt(0))
    );

    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.ENCRYPTION_KEY),
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const iv = data.slice(0, 12);
    const encrypted = data.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );

    return decoder.decode(decrypted);
  }

  static async setSecureItem(key: string, value: string): Promise<void> {
    const encrypted = await this.encrypt(value);
    localStorage.setItem(key, encrypted);
  }

  static async getSecureItem(key: string): Promise<string | null> {
    const encrypted = localStorage.getItem(key);
    if (!encrypted) return null;

    try {
      return await this.decrypt(encrypted);
    } catch (error) {
      console.error('Failed to decrypt stored data:', error);
      localStorage.removeItem(key);
      return null;
    }
  }
}
```

---

## **6. React Best Practices (2025 Standards)**

### **Project Structure**

```
src/
├── components/           # Reusable UI components
│   ├── ui/              # Basic UI components (Button, Input, etc.)
│   ├── forms/           # Form components
│   ├── layout/          # Layout components
│   └── common/          # Common business components
├── pages/               # Page components
├── hooks/               # Custom React hooks
├── services/            # API and external services
├── stores/              # State management (Zustand/Redux)
├── utils/               # Utility functions
├── types/               # TypeScript type definitions
├── constants/           # Application constants
├── assets/              # Static assets
└── styles/              # Global styles and themes
```

### **State Management with Zustand**

```typescript
// stores/authStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
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
          const apiClient = new ApiClient(process.env.REACT_APP_AUTH_SERVICE_URL!);
          const response = await apiClient.post<{
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
            const apiClient = new ApiClient(process.env.REACT_APP_AUTH_SERVICE_URL!);
            await apiClient.post('/api/v1/auth/logout', { refreshToken });
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
          const apiClient = new ApiClient(process.env.REACT_APP_AUTH_SERVICE_URL!);
          const userData = await apiClient.get<User>('/api/v1/auth/me');
          set({ 
            user: userData, 
            isAuthenticated: true, 
            isLoading: false 
          });
        } catch (error) {
          console.error('Failed to refresh user:', error);
          TokenService.clearTokens();
          set({ user: null, isAuthenticated: false, isLoading: false });
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);
```

### **React Query for Server State**

```typescript
// hooks/useOrders.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const useOrders = (filters?: {
  status?: string;
  limit?: number;
  offset?: number;
}) => {
  const apiClient = new ApiClient(process.env.REACT_APP_ORDERS_SERVICE_URL!);

  return useQuery({
    queryKey: ['orders', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.status) params.append('status', filters.status);
      if (filters?.limit) params.append('limit', filters.limit.toString());
      if (filters?.offset) params.append('offset', filters.offset.toString());

      return apiClient.get<{
        data: Order[];
        meta: {
          total: number;
          page: number;
          limit: number;
          hasNext: boolean;
          hasPrev: boolean;
        };
      }>(`/api/v1/orders?${params.toString()}`);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

export const useCreateOrder = () => {
  const queryClient = useQueryClient();
  const apiClient = new ApiClient(process.env.REACT_APP_ORDERS_SERVICE_URL!);

  return useMutation({
    mutationFn: async (orderData: CreateOrderRequest) => {
      return apiClient.post<Order>('/api/v1/orders', orderData);
    },
    onSuccess: () => {
      // Invalidate and refetch orders
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
};
```

### **Component Architecture with Compound Components**

```typescript
// components/OrderCard/OrderCard.tsx
interface OrderCardProps {
  order: Order;
  children: React.ReactNode;
}

const OrderCard: React.FC<OrderCardProps> & {
  Header: typeof OrderCardHeader;
  Body: typeof OrderCardBody;
  Footer: typeof OrderCardFooter;
  Actions: typeof OrderCardActions;
} = ({ order, children }) => {
  return (
    <div className="order-card" data-testid="order-card">
      <OrderContext.Provider value={{ order }}>
        {children}
      </OrderContext.Provider>
    </div>
  );
};

const OrderCardHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { order } = useOrderContext();
  
  return (
    <div className="order-card-header">
      <h3>Order #{order.orderNumber}</h3>
      <StatusBadge status={order.status} />
      {children}
    </div>
  );
};

const OrderCardBody: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <div className="order-card-body">{children}</div>;
};

const OrderCardFooter: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <div className="order-card-footer">{children}</div>;
};

const OrderCardActions: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <div className="order-card-actions">{children}</div>;
};

// Attach sub-components
OrderCard.Header = OrderCardHeader;
OrderCard.Body = OrderCardBody;
OrderCard.Footer = OrderCardFooter;
OrderCard.Actions = OrderCardActions;

// Usage
<OrderCard order={order}>
  <OrderCard.Header>
    <span className="order-date">{formatDate(order.createdAt)}</span>
  </OrderCard.Header>
  <OrderCard.Body>
    <OrderItemsList items={order.items} />
  </OrderCard.Body>
  <OrderCard.Footer>
    <PriceDisplay amount={order.totalAmount} />
  </OrderCard.Footer>
  <OrderCard.Actions>
    <Button onClick={() => trackOrder(order.id)}>Track Order</Button>
    {order.status === 'pending' && (
      <Button variant="danger" onClick={() => cancelOrder(order.id)}>
        Cancel
      </Button>
    )}
  </OrderCard.Actions>
</OrderCard>
```

### **Accessibility (a11y) Implementation**

```typescript
// components/ui/Button.tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  ...props
}) => {
  return (
    <button
      className={`btn btn-${variant} btn-${size}`}
      disabled={disabled || loading}
      aria-disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading && (
        <span className="btn-spinner" aria-hidden="true">
          <LoadingSpinner />
        </span>
      )}
      <span className={loading ? 'sr-only' : undefined}>
        {children}
      </span>
    </button>
  );
};

// components/forms/FormField.tsx
interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactElement;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  error,
  required,
  children,
}) => {
  const fieldId = useId();
  const errorId = useId();

  const childWithProps = React.cloneElement(children, {
    id: fieldId,
    'aria-describedby': error ? errorId : undefined,
    'aria-invalid': !!error,
    required,
  });

  return (
    <div className="form-field">
      <label htmlFor={fieldId} className="form-label">
        {label}
        {required && <span aria-label="required">*</span>}
      </label>
      {childWithProps}
      {error && (
        <div id={errorId} className="form-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
};
```
