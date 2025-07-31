# GasConnect - Gas Delivery Platform

GasConnect is a comprehensive gas delivery platform that connects customers with gas suppliers and delivery drivers. The platform supports various user types including households, hospitals, artisans, suppliers, and delivery drivers.

## 🏗️ Architecture

GasConnect follows a microservices architecture with the following components:

### Core Services
- **Authentication & User Management Service** (Port 3001)
- **Orders & Delivery Management Service** (Port 3002)
- **Supplier & Inventory Management Service** (Port 3003)

### Infrastructure Components
- **API Gateway** (Nginx) - Port 80/443
- **PostgreSQL Database** - Port 5432
- **Redis Cache** - Port 6379
- **RabbitMQ Message Broker** - Port 5672

## 🚀 Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ (for development)
- PostgreSQL 14+ (for local development)
- Redis 7+ (for local development)

### Using Docker Compose (Recommended)

1. Clone the repository:
```bash
git clone <repository-url>
cd gasconnect
```

2. Copy environment files:
```bash
cp .env.example .env
cp services/auth-service/.env.example services/auth-service/.env
cp services/orders-service/.env.example services/orders-service/.env
cp services/supplier-service/.env.example services/supplier-service/.env
```

3. Start all services:
```bash
docker-compose up -d
```

4. Initialize the database:
```bash
docker-compose exec postgres psql -U gasconnect -d gasconnect -f /docker-entrypoint-initdb.d/01-schema.sql
docker-compose exec postgres psql -U gasconnect -d gasconnect -f /docker-entrypoint-initdb.d/02-sample-data.sql
```

5. Setup RabbitMQ exchanges and queues:
```bash
chmod +x infrastructure/rabbitmq/setup.sh
./infrastructure/rabbitmq/setup.sh
```

### Manual Setup

1. Install dependencies for each service:
```bash
cd services/auth-service && npm install
cd ../orders-service && npm install
cd ../supplier-service && npm install
```

2. Setup PostgreSQL database:
```bash
createdb gasconnect
psql -d gasconnect -f database/schema/01-auth-schema.sql
psql -d gasconnect -f database/schema/02-orders-schema.sql
psql -d gasconnect -f database/schema/03-supplier-schema.sql
psql -d gasconnect -f database/seeds/sample_data.sql
```

3. Start Redis and RabbitMQ services

4. Start each service:
```bash
# Terminal 1 - Auth Service
cd services/auth-service && npm run dev

# Terminal 2 - Orders Service
cd services/orders-service && npm run dev

# Terminal 3 - Supplier Service
cd services/supplier-service && npm run dev
```

## 📚 API Documentation

### Service Endpoints

- **API Gateway**: http://localhost/api/docs
- **Auth Service**: http://localhost:3001/api/docs
- **Orders Service**: http://localhost:3002/api/docs
- **Supplier Service**: http://localhost:3003/api/docs

### Authentication

All protected endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

### User Roles

- **household**: Regular customers ordering gas for home use
- **hospital**: Medical facilities requiring medical gases
- **artisan**: Welders, mechanics, and other professionals
- **supplier**: Gas suppliers managing inventory and orders
- **delivery_driver**: Drivers handling deliveries
- **platform_admin**: System administrators

## 🔧 Development

### Running Tests

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# End-to-end tests
npm run test:e2e

# Test coverage
npm run test:coverage
```

### Code Quality

```bash
# Linting
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format
```

### Database Migrations

```bash
# Run migrations
npm run migrate

# Seed database
npm run seed
```

## 🌟 Key Features

### For Customers
- **Multiple User Types**: Support for households, hospitals, and artisans
- **Emergency SOS Orders**: Priority delivery for critical situations
- **Real-time Tracking**: Live delivery tracking with driver location
- **Recurring Orders**: Automated recurring gas deliveries
- **Multiple Addresses**: Manage multiple delivery addresses
- **Order History**: Complete order history and receipts

### For Suppliers
- **Inventory Management**: Real-time inventory tracking and alerts
- **Dynamic Pricing**: Flexible pricing with promotions and bulk discounts
- **Order Management**: Comprehensive order processing workflow
- **Analytics Dashboard**: Sales, revenue, and performance analytics
- **Payment Management**: Integrated payment processing and wallet
- **Promotional Bundles**: Create and manage promotional offers

### For Delivery Drivers
- **Order Assignment**: Automatic and manual order assignment
- **Route Optimization**: Efficient delivery route planning
- **Real-time Updates**: Live status updates and customer communication
- **Delivery Proof**: Photo and signature capture for deliveries
- **Earnings Tracking**: Track earnings and payment history

### Platform Features
- **Multi-tenant Architecture**: Support for multiple suppliers
- **Real-time Communication**: WebSocket-based real-time updates
- **Secure Authentication**: JWT-based authentication with refresh tokens
- **Rate Limiting**: API rate limiting and abuse prevention
- **Comprehensive Logging**: Detailed logging and monitoring
- **Event-driven Architecture**: RabbitMQ-based inter-service communication

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: Argon2 password hashing
- **Rate Limiting**: Request rate limiting per IP and user
- **Input Validation**: Comprehensive input validation and sanitization
- **CORS Protection**: Cross-origin request protection
- **Security Headers**: Comprehensive security headers
- **SQL Injection Prevention**: Parameterized queries
- **XSS Protection**: Cross-site scripting prevention

## 📊 Monitoring & Observability

### Health Checks
- `/health` - Basic health check
- `/health/detailed` - Detailed health with dependencies
- `/health/ready` - Readiness probe
- `/health/live` - Liveness probe

### Metrics
- Request/response metrics
- Database connection metrics
- Redis connection metrics
- RabbitMQ message metrics
- Custom business metrics

### Logging
- Structured JSON logging
- Request/response logging
- Error logging with stack traces
- Audit logging for sensitive operations
- Log aggregation ready

## 🚀 Deployment

### Docker Deployment

```bash
# Build images
docker-compose build

# Deploy to production
docker-compose -f docker-compose.prod.yml up -d
```

### Kubernetes Deployment

```bash
# Apply Kubernetes manifests
kubectl apply -f k8s/
```

### Environment Variables

Key environment variables for each service:

#### Auth Service
- `JWT_SECRET`: JWT signing secret
- `JWT_REFRESH_SECRET`: JWT refresh token secret
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `RABBITMQ_URL`: RabbitMQ connection string

#### Orders Service
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `RABBITMQ_URL`: RabbitMQ connection string
- `AUTH_SERVICE_URL`: Auth service URL

#### Supplier Service
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `RABBITMQ_URL`: RabbitMQ connection string
- `STRIPE_SECRET_KEY`: Stripe payment secret key

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- Create an issue on GitHub
- Check the documentation in the `/docs` folder
- Review the API documentation at `/api/docs`

## 🗺️ Roadmap

- [ ] Mobile app development
- [ ] Advanced analytics and reporting
- [ ] Multi-language support
- [ ] Advanced route optimization
- [ ] IoT integration for smart cylinders
- [ ] Machine learning for demand prediction
- [ ] Blockchain integration for supply chain transparency
