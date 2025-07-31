# GasConnect Comprehensive E2E Test Suite

This directory contains comprehensive end-to-end tests that simulate real user journeys across the GasConnect platform, testing all microservices through the API Gateway with SSL/HTTPS security.

## 🎯 Test Coverage

### User Perspectives Tested
- **🏠 Household Users**: Complete customer journey from registration to order tracking
- **🏭 Suppliers**: Business operations from inventory management to payment processing  
- **👨‍💼 Admins**: Platform management, user administration, and system monitoring

### Technical Coverage
- ✅ **SSL/HTTPS Security**: All tests verify HTTPS endpoints and certificate functionality
- ✅ **API Gateway Routing**: Tests routing through nginx reverse proxy
- ✅ **JWT Authentication**: Token-based security across all services
- ✅ **Microservices Integration**: Auth, Orders, and Supplier services
- ✅ **Database Operations**: User data, orders, inventory, and analytics
- ✅ **Monitoring Integration**: Metrics collection and observability
- ✅ **Error Handling**: Validation, edge cases, and failure scenarios

## 📁 Test Structure

```
tests/
├── e2e/                           # End-to-end test suites
│   ├── infrastructure.test.js     # SSL, routing, service health
│   ├── household-user-journey.test.js  # Complete customer flow
│   ├── supplier-user-journey.test.js   # Business operations flow
│   ├── admin-user-journey.test.js      # Administrative functions
│   └── monitoring-integration.test.js  # Metrics and observability
├── setup.js                      # Global test configuration
├── testSequencer.js              # Test execution order
└── README.md                     # This documentation
```

## 🚀 Running Tests

### Prerequisites
1. **Services Running**: Ensure all services are up with `docker-compose up -d`
2. **HTTPS Enabled**: SSL certificates configured and nginx serving HTTPS
3. **Dependencies**: Install test dependencies with `npm install`

### Quick Start
```bash
# Run all E2E tests
npm run test:comprehensive

# Run specific user journey
npm run test:e2e:household
npm run test:e2e:supplier
npm run test:e2e:admin

# Test infrastructure and SSL
npm run test:infrastructure
npm run test:ssl

# Run with monitoring tests enabled
MONITORING_ENABLED=true npm run test:comprehensive
```

### Advanced Usage
```bash
# Run tests with custom configuration
BASE_URL=https://api.gasconnect.com npm run test:e2e

# Continue on test failures
CONTINUE_ON_FAILURE=true npm run test:comprehensive

# Run specific test file
npx jest tests/e2e/household-user-journey.test.js --verbose
```

## 🏠 Household User Journey Tests

**Flow**: Registration → Login → Browse Suppliers → Place Order → Track Delivery

### Test Scenarios
- ✅ User registration with email/phone validation
- ✅ Authentication with JWT tokens
- ✅ Profile management and address setup
- ✅ Supplier browsing and inventory viewing
- ✅ Order placement with validation
- ✅ Order tracking and status updates
- ✅ Payment processing integration
- ✅ Session management and logout

### Key Validations
- Email/phone uniqueness enforcement
- Password security requirements
- JWT token expiration and refresh
- Order data validation and business rules
- Address management and delivery zones

## 🏭 Supplier User Journey Tests

**Flow**: Registration → Inventory Management → Order Fulfillment → Payment Processing

### Test Scenarios
- ✅ Supplier registration with business details
- ✅ Business profile setup and verification
- ✅ Inventory management (add, update, pricing)
- ✅ Order acceptance and fulfillment workflow
- ✅ Delivery status updates and tracking
- ✅ Payment processing and payout requests
- ✅ Analytics and reporting features
- ✅ Business settings and delivery zones

### Key Validations
- Business license and tax ID validation
- Inventory stock management and reorder levels
- Order workflow state transitions
- Payment calculations and commission handling
- Geographic delivery zone management

## 👨‍💼 Admin User Journey Tests

**Flow**: Authentication → User Management → System Monitoring → Platform Analytics

### Test Scenarios
- ✅ Admin authentication and role verification
- ✅ User management (view, update, suspend, verify)
- ✅ Order management and dispute resolution
- ✅ Supplier approval and audit processes
- ✅ Platform analytics and reporting
- ✅ System health monitoring
- ✅ Configuration management
- ✅ Audit trail and compliance reporting

### Key Validations
- Role-based access control enforcement
- User status management and verification workflows
- System metrics and health indicators
- Audit logging and compliance requirements
- Configuration changes and feature flags

## 📊 Monitoring Integration Tests

**Purpose**: Verify monitoring stack captures metrics from user interactions

### Test Scenarios
- ✅ Prometheus metrics collection
- ✅ Grafana dashboard accessibility
- ✅ Application performance monitoring
- ✅ Business metrics tracking
- ✅ System health monitoring
- ✅ Alert system integration

### Metrics Validated
- HTTP request rates and response times
- Authentication success/failure rates
- Database connection and query performance
- Order placement and completion rates
- Error rates and system availability
- Resource usage (CPU, memory, disk)

## 🔧 Test Configuration

### Environment Variables
```bash
TEST_ENV=development              # Test environment
BASE_URL=https://localhost        # HTTPS API Gateway URL
HTTP_URL=http://localhost         # HTTP URL (for redirect tests)
TIMEOUT=60000                     # Test timeout in milliseconds
MONITORING_ENABLED=false          # Enable monitoring tests
CONTINUE_ON_FAILURE=false         # Continue on test failures
```

### Test Data Management
- **Dynamic Generation**: Test data generated with unique identifiers
- **Cleanup**: Automatic cleanup of test data after completion
- **Isolation**: Each test suite uses isolated data to prevent conflicts
- **Realistic Scenarios**: Test data mimics real-world usage patterns

## 🛠️ Troubleshooting

### Common Issues

**Services Not Accessible**
```bash
# Check service status
docker-compose ps
curl -k https://localhost/health
```

**SSL Certificate Issues**
```bash
# Regenerate certificates
cd infrastructure/nginx/ssl
sudo ./generate-certs.sh
```

**Test Timeouts**
```bash
# Increase timeout
TIMEOUT=120000 npm run test:e2e
```

**Monitoring Tests Failing**
```bash
# Start monitoring stack
cd infrastructure/monitoring
docker-compose -f docker-compose.monitoring.yml up -d
```

### Debug Mode
```bash
# Run with verbose output
npx jest tests/e2e --verbose --detectOpenHandles

# Run single test with debugging
node --inspect-brk node_modules/.bin/jest tests/e2e/household-user-journey.test.js
```

## 📈 Test Results and Reporting

### Output Format
- **Console**: Real-time test progress and results
- **JUnit XML**: Compatible with CI/CD systems
- **Coverage Reports**: Code coverage analysis
- **Performance Metrics**: Response time measurements

### Success Criteria
- ✅ All user journeys complete successfully
- ✅ SSL/HTTPS security verified
- ✅ API Gateway routing functional
- ✅ JWT authentication working
- ✅ Database operations successful
- ✅ Monitoring metrics captured
- ✅ Error handling validated

## 🎯 Production Readiness Validation

These tests validate that GasConnect is ready for production deployment by ensuring:

1. **Security**: HTTPS encryption and JWT authentication
2. **Scalability**: Microservices architecture and load balancing
3. **Reliability**: Error handling and graceful degradation
4. **Observability**: Comprehensive monitoring and alerting
5. **User Experience**: Complete user journeys work end-to-end
6. **Business Logic**: All core platform features functional

The comprehensive test suite provides confidence that the platform can handle real-world usage scenarios across all user types and system components.
