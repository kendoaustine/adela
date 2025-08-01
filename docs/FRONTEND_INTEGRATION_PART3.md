# **GasConnect Frontend Integration Specifications - Part 3**

## **7. Nigerian Market Specific Requirements**

### **Phone Number Formatting and Validation**

```typescript
// utils/phoneUtils.ts
export class NigerianPhoneUtils {
  private static readonly NIGERIAN_PREFIXES = [
    '0701', '0702', '0703', '0704', '0705', '0706', '0707', '0708', '0709',
    '0801', '0802', '0803', '0804', '0805', '0806', '0807', '0808', '0809',
    '0810', '0811', '0812', '0813', '0814', '0815', '0816', '0817', '0818', '0819',
    '0901', '0902', '0903', '0904', '0905', '0906', '0907', '0908', '0909',
    '0910', '0911', '0912', '0913', '0914', '0915', '0916', '0917', '0918', '0919'
  ];

  static formatNigerianPhone(phone: string): string {
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');

    // Handle different input formats
    if (digits.startsWith('234')) {
      // International format: +234XXXXXXXXXX
      const localNumber = digits.substring(3);
      return `+234 ${localNumber.substring(0, 3)} ${localNumber.substring(3, 6)} ${localNumber.substring(6)}`;
    } else if (digits.startsWith('0') && digits.length === 11) {
      // Local format: 0XXXXXXXXXX
      return `${digits.substring(0, 4)} ${digits.substring(4, 7)} ${digits.substring(7)}`;
    } else if (digits.length === 10) {
      // Without leading zero: XXXXXXXXXX
      return `0${digits.substring(0, 3)} ${digits.substring(3, 6)} ${digits.substring(6)}`;
    }

    return phone; // Return original if format not recognized
  }

  static validateNigerianPhone(phone: string): boolean {
    const digits = phone.replace(/\D/g, '');

    // Check international format
    if (digits.startsWith('234') && digits.length === 13) {
      const localPart = '0' + digits.substring(3);
      return this.NIGERIAN_PREFIXES.some(prefix => localPart.startsWith(prefix));
    }

    // Check local format
    if (digits.startsWith('0') && digits.length === 11) {
      return this.NIGERIAN_PREFIXES.some(prefix => digits.startsWith(prefix));
    }

    // Check without leading zero
    if (digits.length === 10) {
      const withZero = '0' + digits;
      return this.NIGERIAN_PREFIXES.some(prefix => withZero.startsWith(prefix));
    }

    return false;
  }

  static toInternationalFormat(phone: string): string {
    const digits = phone.replace(/\D/g, '');

    if (digits.startsWith('234')) {
      return `+${digits}`;
    } else if (digits.startsWith('0') && digits.length === 11) {
      return `+234${digits.substring(1)}`;
    } else if (digits.length === 10) {
      return `+234${digits}`;
    }

    return phone;
  }

  static getCarrier(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    let localNumber = digits;

    if (digits.startsWith('234')) {
      localNumber = '0' + digits.substring(3);
    } else if (!digits.startsWith('0')) {
      localNumber = '0' + digits;
    }

    const prefix = localNumber.substring(0, 4);

    const carriers: Record<string, string> = {
      '0701': 'Airtel', '0708': 'Airtel', '0802': 'Airtel', '0808': 'Airtel', '0812': 'Airtel', '0901': 'Airtel', '0902': 'Airtel', '0907': 'Airtel', '0912': 'Airtel',
      '0703': 'MTN', '0706': 'MTN', '0803': 'MTN', '0806': 'MTN', '0810': 'MTN', '0813': 'MTN', '0814': 'MTN', '0816': 'MTN', '0903': 'MTN', '0906': 'MTN', '0913': 'MTN', '0916': 'MTN',
      '0705': 'Glo', '0805': 'Glo', '0807': 'Glo', '0811': 'Glo', '0815': 'Glo', '0905': 'Glo', '0915': 'Glo',
      '0704': '9mobile', '0709': '9mobile', '0804': '9mobile', '0809': '9mobile', '0817': '9mobile', '0818': '9mobile', '0908': '9mobile', '0909': '9mobile', '0917': '9mobile', '0918': '9mobile'
    };

    return carriers[prefix] || 'Unknown';
  }
}

// React Hook for Phone Input
export const usePhoneInput = (initialValue = '') => {
  const [value, setValue] = useState(initialValue);
  const [isValid, setIsValid] = useState(false);
  const [carrier, setCarrier] = useState('');

  const handleChange = (inputValue: string) => {
    const formatted = NigerianPhoneUtils.formatNigerianPhone(inputValue);
    const valid = NigerianPhoneUtils.validateNigerianPhone(inputValue);
    const phoneCarrier = NigerianPhoneUtils.getCarrier(inputValue);

    setValue(formatted);
    setIsValid(valid);
    setCarrier(phoneCarrier);
  };

  const getInternationalFormat = () => {
    return NigerianPhoneUtils.toInternationalFormat(value);
  };

  return {
    value,
    isValid,
    carrier,
    onChange: handleChange,
    getInternationalFormat,
  };
};
```

### **Naira Currency Formatting**

```typescript
// utils/currencyUtils.ts
export class NairaCurrencyUtils {
  private static readonly NAIRA_SYMBOL = '₦';
  private static readonly LOCALE = 'en-NG';

  static formatNaira(amount: number, options: {
    showSymbol?: boolean;
    showDecimals?: boolean;
    compact?: boolean;
  } = {}): string {
    const {
      showSymbol = true,
      showDecimals = true,
      compact = false
    } = options;

    if (compact && amount >= 1000000) {
      const millions = amount / 1000000;
      const formatted = millions.toFixed(1);
      return `${showSymbol ? this.NAIRA_SYMBOL : ''}${formatted}M`;
    }

    if (compact && amount >= 1000) {
      const thousands = amount / 1000;
      const formatted = thousands.toFixed(1);
      return `${showSymbol ? this.NAIRA_SYMBOL : ''}${formatted}K`;
    }

    const formatter = new Intl.NumberFormat(this.LOCALE, {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: showDecimals ? 2 : 0,
      maximumFractionDigits: showDecimals ? 2 : 0,
    });

    let formatted = formatter.format(amount);

    if (!showSymbol) {
      formatted = formatted.replace(/₦|NGN/g, '').trim();
    }

    return formatted;
  }

  static parseNaira(value: string): number {
    // Remove currency symbols and spaces
    const cleaned = value.replace(/[₦,\s]/g, '');
    
    // Handle compact notation
    if (cleaned.toLowerCase().includes('m')) {
      return parseFloat(cleaned.replace(/m/i, '')) * 1000000;
    }
    
    if (cleaned.toLowerCase().includes('k')) {
      return parseFloat(cleaned.replace(/k/i, '')) * 1000;
    }

    return parseFloat(cleaned) || 0;
  }

  static formatForInput(amount: number): string {
    return this.formatNaira(amount, { showSymbol: false, showDecimals: true });
  }

  static validateAmount(value: string): boolean {
    const amount = this.parseNaira(value);
    return !isNaN(amount) && amount >= 0;
  }
}

// React Hook for Currency Input
export const useCurrencyInput = (initialValue = 0) => {
  const [value, setValue] = useState(NairaCurrencyUtils.formatForInput(initialValue));
  const [numericValue, setNumericValue] = useState(initialValue);

  const handleChange = (inputValue: string) => {
    const numeric = NairaCurrencyUtils.parseNaira(inputValue);
    const formatted = NairaCurrencyUtils.formatForInput(numeric);
    
    setValue(formatted);
    setNumericValue(numeric);
  };

  const getDisplayValue = (options?: Parameters<typeof NairaCurrencyUtils.formatNaira>[1]) => {
    return NairaCurrencyUtils.formatNaira(numericValue, options);
  };

  return {
    value,
    numericValue,
    onChange: handleChange,
    getDisplayValue,
    isValid: NairaCurrencyUtils.validateAmount(value),
  };
};
```

### **Paystack Integration**

```typescript
// services/paystackService.ts
declare global {
  interface Window {
    PaystackPop: any;
  }
}

export class PaystackService {
  private static readonly PUBLIC_KEY = process.env.REACT_APP_PAYSTACK_PUBLIC_KEY!;

  static loadPaystackScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.PaystackPop) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://js.paystack.co/v1/inline.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Paystack script'));
      document.head.appendChild(script);
    });
  }

  static async initializePayment(config: {
    email: string;
    amount: number;
    orderId?: string;
    onSuccess: (reference: string) => void;
    onCancel: () => void;
    onError: (error: any) => void;
  }): Promise<void> {
    await this.loadPaystackScript();

    const handler = window.PaystackPop.setup({
      key: this.PUBLIC_KEY,
      email: config.email,
      amount: Math.round(config.amount * 100), // Convert to kobo
      currency: 'NGN',
      ref: `gasconnect_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      metadata: {
        orderId: config.orderId,
        custom_fields: [
          {
            display_name: 'Order ID',
            variable_name: 'order_id',
            value: config.orderId || 'N/A',
          },
        ],
      },
      callback: (response: any) => {
        config.onSuccess(response.reference);
      },
      onClose: () => {
        config.onCancel();
      },
    });

    handler.openIframe();
  }
}

// React Hook for Paystack Payment
export const usePaystackPayment = () => {
  const [isLoading, setIsLoading] = useState(false);

  const initializePayment = async (config: {
    email: string;
    amount: number;
    orderId?: string;
    onSuccess: (reference: string) => void;
    onCancel?: () => void;
    onError?: (error: any) => void;
  }) => {
    setIsLoading(true);
    
    try {
      await PaystackService.initializePayment({
        ...config,
        onSuccess: (reference) => {
          setIsLoading(false);
          config.onSuccess(reference);
        },
        onCancel: () => {
          setIsLoading(false);
          config.onCancel?.();
        },
        onError: (error) => {
          setIsLoading(false);
          config.onError?.(error);
        },
      });
    } catch (error) {
      setIsLoading(false);
      config.onError?.(error);
    }
  };

  return { initializePayment, isLoading };
};
```

### **Mobile-First Responsive Design**

```css
/* styles/responsive.css */
/* Mobile-first approach for Nigerian users */

/* Base styles for mobile (320px+) */
.container {
  padding: 1rem;
  max-width: 100%;
}

.btn {
  min-height: 44px; /* Touch-friendly size */
  padding: 0.75rem 1rem;
  font-size: 1rem;
}

.form-input {
  min-height: 44px;
  padding: 0.75rem;
  font-size: 1rem;
  border-radius: 0.5rem;
}

/* Tablet styles (768px+) */
@media (min-width: 768px) {
  .container {
    padding: 1.5rem;
    max-width: 768px;
    margin: 0 auto;
  }
  
  .grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  }
}

/* Desktop styles (1024px+) */
@media (min-width: 1024px) {
  .container {
    max-width: 1200px;
    padding: 2rem;
  }
  
  .grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 1.5rem;
  }
}

/* High-DPI displays */
@media (-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi) {
  .icon {
    background-size: contain;
  }
}

/* Reduced motion for accessibility */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## **8. Deployment Configuration**

### **Environment Variables**

```bash
# .env.production
REACT_APP_NODE_ENV=production

# API Endpoints
REACT_APP_AUTH_SERVICE_URL=https://auth.gasconnect.com
REACT_APP_ORDERS_SERVICE_URL=https://orders.gasconnect.com
REACT_APP_SUPPLIER_SERVICE_URL=https://supplier.gasconnect.com
REACT_APP_WEBSOCKET_URL=wss://api.gasconnect.com

# Paystack Configuration
REACT_APP_PAYSTACK_PUBLIC_KEY=pk_live_your_live_public_key

# Google Maps (for delivery tracking)
REACT_APP_GOOGLE_MAPS_API_KEY=your_google_maps_api_key

# Sentry (Error Tracking)
REACT_APP_SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id

# Feature Flags
REACT_APP_ENABLE_PWA=true
REACT_APP_ENABLE_OFFLINE_MODE=true
REACT_APP_ENABLE_PUSH_NOTIFICATIONS=true

# Analytics
REACT_APP_GOOGLE_ANALYTICS_ID=GA-XXXXXXXXX
REACT_APP_FACEBOOK_PIXEL_ID=your_facebook_pixel_id
```

### **Build Configuration**

```json
// package.json
{
  "name": "gasconnect-frontend",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "@tanstack/react-query": "^5.0.0",
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.8.0",
    "socket.io-client": "^4.7.0",
    "zustand": "^4.4.0",
    "typescript": "^5.0.0",
    "tailwindcss": "^3.3.0",
    "framer-motion": "^10.16.0"
  },
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "build:staging": "REACT_APP_NODE_ENV=staging npm run build",
    "build:production": "REACT_APP_NODE_ENV=production npm run build",
    "test": "react-scripts test",
    "test:coverage": "react-scripts test --coverage --watchAll=false",
    "eject": "react-scripts eject",
    "lint": "eslint src --ext .ts,.tsx",
    "lint:fix": "eslint src --ext .ts,.tsx --fix",
    "type-check": "tsc --noEmit",
    "analyze": "npm run build && npx bundle-analyzer build/static/js/*.js"
  },
  "browserslist": {
    "production": [
      ">0.2%",
      "not dead",
      "not op_mini all"
    ],
    "development": [
      "last 1 chrome version",
      "last 1 firefox version",
      "last 1 safari version"
    ]
  }
}
```

### **Docker Configuration**

```dockerfile
# Dockerfile
FROM node:18-alpine as build

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the app
RUN npm run build:production

# Production stage
FROM nginx:alpine

# Copy built app
COPY --from=build /app/build /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Expose port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

```nginx
# nginx.conf
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    server {
        listen 80;
        server_name localhost;
        root /usr/share/nginx/html;
        index index.html;

        # Security headers
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

        # Handle client-side routing
        location / {
            try_files $uri $uri/ /index.html;
        }

        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }

        # Service worker
        location /sw.js {
            add_header Cache-Control "no-cache";
            proxy_cache_bypass $http_pragma;
            proxy_cache_revalidate on;
            expires off;
            access_log off;
        }
    }
}
```

### **CI/CD Pipeline (GitHub Actions)**

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
      - run: npm run test:coverage

  build-and-deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build Docker image
        run: |
          docker build -t gasconnect-frontend:${{ github.sha }} .
          docker tag gasconnect-frontend:${{ github.sha }} gasconnect-frontend:latest
      
      - name: Deploy to production
        run: |
          # Add your deployment commands here
          echo "Deploying to production..."
```

This completes the comprehensive frontend integration specifications for GasConnect, covering all aspects from API documentation to deployment configuration, with special attention to Nigerian market requirements and modern React best practices.
