# GasConnect Backend

A unified gas supply platform connecting hospitals, artisans, households, and verified gas suppliers using a 3-microservice architecture.

## Architecture Overview

### Microservices
1. **Authentication & User Management Service** - User auth, roles, profiles, supplier verification
2. **Orders & Delivery Management Service** - Order lifecycle, emergency SOS, delivery tracking
3. **Supplier & Inventory Management Service** - Inventory, pricing, payments, analytics

### Infrastructure
- **API Gateway**: Nginx with JWT verification and rate limiting
- **Database**: PostgreSQL with 3 schemas (auth.*, orders.*, supplier.*)
- **Cache**: Redis for sessions, real-time data, and performance
- **Message Broker**: RabbitMQ for event-driven communication
- **Monitoring**: Prometheus + Grafana + centralized logging

## User Types
- **Hospitals**: Medical gases (oxygen), recurring supply, emergency SOS
- **Artisans**: Industrial gases (acetylene, argon, CO₂), starter kits
- **Households**: Cooking gas with real-time tracking
- **Suppliers**: Inventory management, order fulfillment, verification
- **Delivery Drivers**: Route optimization, status updates
- **Platform Admins**: System management and oversight

## Quick Start

```bash
# Start all services
docker-compose up -d

# Run database migrations
docker-compose exec auth-service npm run migrate
docker-compose exec orders-service npm run migrate
docker-compose exec supplier-service npm run migrate

# View logs
docker-compose logs -f
```

## API Documentation
- Auth Service: http://localhost:3001/api/docs
- Orders Service: http://localhost:3002/api/docs
- Supplier Service: http://localhost:3003/api/docs

## Development

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for local development)
- PostgreSQL 14+ (if running locally)

### Environment Setup
Copy `.env.example` to `.env` and configure your environment variables.

### Testing
```bash
# Run all tests
npm run test

# Run specific service tests
npm run test:auth
npm run test:orders
npm run test:supplier
```

## Security Features
- TLS 1.3 for external traffic
- mTLS for internal service communication
- Argon2 password hashing
- AES-256 encryption for sensitive data
- JWT with refresh tokens
- Role-based access control

## Monitoring & Observability
- Health checks: `/health` endpoint on each service
- Metrics: Prometheus metrics at `/metrics`
- Logs: Structured JSON logging
- Dashboards: Grafana at http://localhost:3000

## License
MIT License
