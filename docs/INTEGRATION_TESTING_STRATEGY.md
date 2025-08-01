# **GasConnect Frontend Integration Testing Strategy**

## **Overview**

This document outlines the comprehensive testing strategy for integrating the React frontend with the GasConnect backend microservices. The strategy covers unit tests, integration tests, end-to-end tests, and performance testing.

---

## **Testing Pyramid Structure**

```
    /\
   /  \     E2E Tests (10%)
  /____\    - Critical user journeys
 /      \   - Cross-browser testing
/________\  Integration Tests (20%)
           - API integration
           - Component integration
           - WebSocket testing
___________
           Unit Tests (70%)
           - Components
           - Hooks
           - Utils
           - Services
```

---

## **1. Unit Testing**

### **Testing Framework Setup**

```typescript
// jest.config.js
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/index.tsx',
    '!src/reportWebVitals.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

// src/setupTests.ts
import '@testing-library/jest-dom';
import { server } from './mocks/server';

// Establish API mocking before all tests
beforeAll(() => server.listen());

// Reset any request handlers that we may add during the tests
afterEach(() => server.resetHandlers());

// Clean up after the tests are finished
afterAll(() => server.close());

// Mock WebSocket
global.WebSocket = jest.fn();

// Mock Paystack
global.PaystackPop = {
  setup: jest.fn(() => ({
    openIframe: jest.fn(),
  })),
};
```

### **Component Testing Examples**

```typescript
// __tests__/components/OrderCard.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OrderCard } from '@/components/OrderCard';
import { mockOrder } from '@/mocks/orderMocks';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('OrderCard', () => {
  it('renders order information correctly', () => {
    render(
      <OrderCard order={mockOrder}>
        <OrderCard.Header />
        <OrderCard.Body />
        <OrderCard.Footer />
      </OrderCard>,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText(`Order #${mockOrder.orderNumber}`)).toBeInTheDocument();
    expect(screen.getByText(mockOrder.status)).toBeInTheDocument();
    expect(screen.getByText(`₦${mockOrder.totalAmount.toLocaleString()}`)).toBeInTheDocument();
  });

  it('handles cancel order action', async () => {
    const mockCancelOrder = jest.fn();
    
    render(
      <OrderCard order={{ ...mockOrder, status: 'pending' }}>
        <OrderCard.Actions>
          <button onClick={() => mockCancelOrder(mockOrder.id)}>
            Cancel Order
          </button>
        </OrderCard.Actions>
      </OrderCard>,
      { wrapper: createWrapper() }
    );

    fireEvent.click(screen.getByText('Cancel Order'));
    expect(mockCancelOrder).toHaveBeenCalledWith(mockOrder.id);
  });
});
```

### **Hook Testing Examples**

```typescript
// __tests__/hooks/useAuth.test.tsx
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { server } from '@/mocks/server';
import { rest } from 'msw';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('useAuth', () => {
  it('logs in user successfully', async () => {
    server.use(
      rest.post('/api/v1/auth/login', (req, res, ctx) => {
        return res(
          ctx.json({
            data: {
              user: { id: '1', email: 'test@example.com' },
              tokens: { accessToken: 'token', refreshToken: 'refresh' },
            },
          })
        );
      })
    );

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.login({
        identifier: 'test@example.com',
        password: 'password',
      });
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.email).toBe('test@example.com');
  });

  it('handles login error', async () => {
    server.use(
      rest.post('/api/v1/auth/login', (req, res, ctx) => {
        return res(
          ctx.status(401),
          ctx.json({
            error: { message: 'Invalid credentials' },
          })
        );
      })
    );

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await expect(
      act(async () => {
        await result.current.login({
          identifier: 'test@example.com',
          password: 'wrong-password',
        });
      })
    ).rejects.toThrow('Invalid credentials');
  });
});
```

### **Service Testing Examples**

```typescript
// __tests__/services/ApiClient.test.ts
import { ApiClient } from '@/services/ApiClient';
import { TokenService } from '@/services/TokenService';
import { server } from '@/mocks/server';
import { rest } from 'msw';

jest.mock('@/services/TokenService');

describe('ApiClient', () => {
  let apiClient: ApiClient;

  beforeEach(() => {
    apiClient = new ApiClient('http://localhost:3001');
    jest.clearAllMocks();
  });

  it('includes authorization header when token is available', async () => {
    (TokenService.getAccessToken as jest.Mock).mockReturnValue('valid-token');
    (TokenService.isTokenExpired as jest.Mock).mockReturnValue(false);

    server.use(
      rest.get('http://localhost:3001/api/v1/test', (req, res, ctx) => {
        const authHeader = req.headers.get('Authorization');
        expect(authHeader).toBe('Bearer valid-token');
        return res(ctx.json({ data: 'success' }));
      })
    );

    await apiClient.get('/api/v1/test');
  });

  it('refreshes token when expired', async () => {
    (TokenService.getAccessToken as jest.Mock).mockReturnValue('expired-token');
    (TokenService.isTokenExpired as jest.Mock).mockReturnValue(true);
    (TokenService.getRefreshToken as jest.Mock).mockReturnValue('refresh-token');
    (TokenService.setTokens as jest.Mock).mockImplementation(() => {});

    server.use(
      rest.post('http://localhost:3001/api/v1/auth/refresh', (req, res, ctx) => {
        return res(
          ctx.json({
            tokens: {
              accessToken: 'new-token',
              refreshToken: 'new-refresh-token',
              expiresIn: 3600,
            },
          })
        );
      }),
      rest.get('http://localhost:3001/api/v1/test', (req, res, ctx) => {
        return res(ctx.json({ data: 'success' }));
      })
    );

    const result = await apiClient.get('/api/v1/test');
    expect(result.data).toBe('success');
    expect(TokenService.setTokens).toHaveBeenCalled();
  });
});
```

---

## **2. Integration Testing**

### **API Integration Tests**

```typescript
// __tests__/integration/orderFlow.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { CreateOrderPage } from '@/pages/CreateOrderPage';
import { server } from '@/mocks/server';
import { rest } from 'msw';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </BrowserRouter>
  );
};

describe('Order Flow Integration', () => {
  it('completes full order creation flow', async () => {
    const user = userEvent.setup();

    // Mock API responses
    server.use(
      rest.get('/api/v1/addresses', (req, res, ctx) => {
        return res(
          ctx.json({
            data: [
              {
                id: 'addr-1',
                label: 'Home',
                street: '123 Main St',
                city: 'Lagos',
                isDefault: true,
              },
            ],
          })
        );
      }),
      rest.get('/api/v1/inventory/available', (req, res, ctx) => {
        return res(
          ctx.json({
            data: [
              {
                id: 'supplier-1',
                name: 'Gas Supplier Ltd',
                inventory: [
                  {
                    gasTypeId: 'gas-1',
                    gasTypeName: 'Cooking Gas',
                    cylinderSize: '12.5kg',
                    availableQuantity: 50,
                  },
                ],
              },
            ],
          })
        );
      }),
      rest.post('/api/v1/pricing/calculate', (req, res, ctx) => {
        return res(
          ctx.json({
            data: {
              totalAmount: 18275.0,
              breakdown: {
                subtotal: 15000.0,
                deliveryFee: 2000.0,
                taxAmount: 1275.0,
              },
            },
          })
        );
      }),
      rest.post('/api/v1/orders', (req, res, ctx) => {
        return res(
          ctx.status(201),
          ctx.json({
            data: {
              id: 'order-1',
              orderNumber: 'GC-2024-001',
              status: 'pending',
              totalAmount: 18275.0,
            },
          })
        );
      })
    );

    render(<CreateOrderPage />, { wrapper: createWrapper() });

    // Wait for page to load
    await waitFor(() => {
      expect(screen.getByText('Create Order')).toBeInTheDocument();
    });

    // Select supplier
    await user.click(screen.getByText('Gas Supplier Ltd'));

    // Select gas type and quantity
    await user.click(screen.getByText('Cooking Gas - 12.5kg'));
    await user.type(screen.getByLabelText('Quantity'), '2');

    // Select delivery address
    await user.click(screen.getByText('Home - 123 Main St'));

    // Add special instructions
    await user.type(
      screen.getByLabelText('Special Instructions'),
      'Please call before delivery'
    );

    // Submit order
    await user.click(screen.getByText('Place Order'));

    // Verify order creation
    await waitFor(() => {
      expect(screen.getByText('Order placed successfully!')).toBeInTheDocument();
      expect(screen.getByText('Order #GC-2024-001')).toBeInTheDocument();
    });
  });
});
```

### **WebSocket Integration Tests**

```typescript
// __tests__/integration/websocket.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OrderTrackingPage } from '@/pages/OrderTrackingPage';
import { WebSocketService } from '@/services/WebSocketService';

// Mock WebSocket
class MockWebSocket {
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(public url: string) {}

  send(data: string) {
    // Mock send implementation
  }

  close() {
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  }

  // Helper method to simulate receiving messages
  simulateMessage(data: any) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }));
    }
  }
}

global.WebSocket = MockWebSocket as any;

describe('WebSocket Integration', () => {
  let mockSocket: MockWebSocket;

  beforeEach(() => {
    mockSocket = new MockWebSocket('ws://localhost:3001');
  });

  it('receives real-time order updates', async () => {
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <OrderTrackingPage orderId="order-1" />
      </QueryClientProvider>
    );

    // Simulate WebSocket connection
    if (mockSocket.onopen) {
      mockSocket.onopen(new Event('open'));
    }

    // Simulate order status update
    mockSocket.simulateMessage({
      type: 'order_status_changed',
      data: {
        orderId: 'order-1',
        status: 'confirmed',
        message: 'Your order has been confirmed',
        timestamp: new Date().toISOString(),
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Order Confirmed')).toBeInTheDocument();
      expect(screen.getByText('Your order has been confirmed')).toBeInTheDocument();
    });

    // Simulate driver location update
    mockSocket.simulateMessage({
      type: 'driver_location',
      data: {
        orderId: 'order-1',
        latitude: 6.5244,
        longitude: 3.3792,
        timestamp: new Date().toISOString(),
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('driver-location-marker')).toBeInTheDocument();
    });
  });
});
```

---

## **3. End-to-End Testing**

### **Playwright E2E Tests**

```typescript
// e2e/orderFlow.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Order Flow E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');
    await expect(page).toHaveURL('/dashboard');
  });

  test('complete order creation and tracking flow', async ({ page }) => {
    // Navigate to create order
    await page.click('[data-testid="create-order-button"]');
    await expect(page).toHaveURL('/orders/create');

    // Select supplier
    await page.click('[data-testid="supplier-card"]:first-child');

    // Add items to order
    await page.click('[data-testid="gas-type-option"]:first-child');
    await page.fill('[data-testid="quantity-input"]', '2');
    await page.click('[data-testid="add-item-button"]');

    // Select delivery address
    await page.click('[data-testid="address-option"]:first-child');

    // Add special instructions
    await page.fill(
      '[data-testid="special-instructions"]',
      'Please call before delivery'
    );

    // Place order
    await page.click('[data-testid="place-order-button"]');

    // Verify order confirmation
    await expect(page.locator('[data-testid="order-confirmation"]')).toBeVisible();
    
    const orderNumber = await page.locator('[data-testid="order-number"]').textContent();
    expect(orderNumber).toMatch(/GC-\d{4}-\d{3}/);

    // Navigate to order tracking
    await page.click('[data-testid="track-order-button"]');
    await expect(page).toHaveURL(/\/orders\/.*\/tracking/);

    // Verify tracking information
    await expect(page.locator('[data-testid="order-status"]')).toContainText('Pending');
    await expect(page.locator('[data-testid="order-timeline"]')).toBeVisible();
  });

  test('payment flow with Paystack', async ({ page }) => {
    // Create order first
    await page.goto('/orders/create');
    // ... order creation steps ...
    await page.click('[data-testid="place-order-button"]');

    // Proceed to payment
    await page.click('[data-testid="proceed-to-payment-button"]');

    // Wait for Paystack iframe to load
    const paystackFrame = page.frameLocator('[src*="paystack"]');
    await expect(paystackFrame.locator('[data-testid="payment-form"]')).toBeVisible();

    // Fill payment details (in test environment)
    await paystackFrame.fill('[data-testid="card-number"]', '4084084084084081');
    await paystackFrame.fill('[data-testid="expiry-date"]', '12/25');
    await paystackFrame.fill('[data-testid="cvv"]', '123');

    // Submit payment
    await paystackFrame.click('[data-testid="pay-button"]');

    // Verify payment success
    await expect(page.locator('[data-testid="payment-success"]')).toBeVisible();
    await expect(page.locator('[data-testid="order-status"]')).toContainText('Paid');
  });
});
```

### **Cross-Browser Testing**

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  webServer: {
    command: 'npm start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

---

## **4. Performance Testing**

### **Lighthouse CI Configuration**

```javascript
// lighthouserc.js
module.exports = {
  ci: {
    collect: {
      url: [
        'http://localhost:3000/',
        'http://localhost:3000/login',
        'http://localhost:3000/dashboard',
        'http://localhost:3000/orders/create',
      ],
      startServerCommand: 'npm start',
      numberOfRuns: 3,
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.8 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['warn', { minScore: 0.8 }],
        'categories:seo': ['warn', { minScore: 0.8 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
```

### **Bundle Size Analysis**

```json
{
  "scripts": {
    "analyze": "npm run build && npx webpack-bundle-analyzer build/static/js/*.js",
    "size-limit": "size-limit"
  },
  "size-limit": [
    {
      "path": "build/static/js/*.js",
      "limit": "500 KB"
    },
    {
      "path": "build/static/css/*.css",
      "limit": "50 KB"
    }
  ]
}
```

---

## **5. Test Data Management**

### **Mock Service Worker Setup**

```typescript
// src/mocks/handlers.ts
import { rest } from 'msw';

export const handlers = [
  // Auth handlers
  rest.post('/api/v1/auth/login', (req, res, ctx) => {
    return res(
      ctx.json({
        data: {
          user: {
            id: 'user-1',
            email: 'test@example.com',
            firstName: 'Test',
            lastName: 'User',
            role: 'household',
          },
          tokens: {
            accessToken: 'mock-access-token',
            refreshToken: 'mock-refresh-token',
            expiresIn: 3600,
          },
        },
      })
    );
  }),

  // Orders handlers
  rest.get('/api/v1/orders', (req, res, ctx) => {
    return res(
      ctx.json({
        data: [
          {
            id: 'order-1',
            orderNumber: 'GC-2024-001',
            status: 'pending',
            totalAmount: 18275.0,
            createdAt: '2024-01-01T00:00:00.000Z',
          },
        ],
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          hasNext: false,
          hasPrev: false,
        },
      })
    );
  }),

  // Supplier handlers
  rest.get('/api/v1/inventory/available', (req, res, ctx) => {
    return res(
      ctx.json({
        data: [
          {
            id: 'supplier-1',
            name: 'Gas Supplier Ltd',
            inventory: [
              {
                gasTypeId: 'gas-1',
                gasTypeName: 'Cooking Gas',
                cylinderSize: '12.5kg',
                availableQuantity: 50,
              },
            ],
          },
        ],
      })
    );
  }),
];

// src/mocks/server.ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

---

## **6. CI/CD Integration**

### **GitHub Actions Workflow**

```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - run: npm ci
      - run: npm run test:coverage
      - run: npm run lint
      - run: npm run type-check
      
      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - run: npm ci
      - run: npx playwright install
      - run: npm run build
      - run: npm run test:e2e
      
      - uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/

  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - run: npm ci
      - run: npm run build
      - run: npx lhci autorun
```

This comprehensive testing strategy ensures robust integration between the React frontend and GasConnect backend services, covering all aspects from unit tests to performance monitoring.
