# GasConnect Infrastructure

This directory contains all infrastructure components for the GasConnect platform, organized for production deployment and maintainability.

## Directory Structure

```
infrastructure/
├── monitoring/          # Complete monitoring stack
│   ├── docker-compose.monitoring.yml
│   ├── prometheus/      # Metrics collection
│   ├── grafana/         # Dashboards and visualization
│   └── README.md
├── nginx/               # API Gateway and reverse proxy
│   ├── nginx.conf       # Main nginx configuration with HTTPS
│   ├── ssl/             # SSL certificates and configuration
│   │   ├── gasconnect.crt
│   │   ├── gasconnect.key
│   │   └── README.md
│   ├── ssl.conf         # SSL security settings
│   └── Dockerfile
└── rabbitmq/            # Message broker configuration
```

## Components

### 1. API Gateway (Nginx)
- **HTTPS-enabled** reverse proxy and load balancer
- **HTTP/2 support** for improved performance
- **SSL/TLS termination** with strong security settings
- **Rate limiting** and security headers
- **Automatic HTTP to HTTPS redirect**

**Ports:**
- 80 (HTTP - redirects to HTTPS)
- 443 (HTTPS)

### 2. Monitoring Stack
Complete observability solution including:
- **Prometheus** - Metrics collection and storage
- **Grafana** - Dashboards and visualization
- **AlertManager** - Alert routing and management
- **Exporters** - System, database, and application metrics
- **Loki & Promtail** - Log aggregation and shipping
- **Jaeger** - Distributed tracing
- **Elasticsearch & Kibana** - Log storage and search

### 3. Message Broker (RabbitMQ)
- Event-driven architecture support
- Inter-service communication
- Queue management and routing

## Quick Start

### Start Core Infrastructure
```bash
# Start main services
docker-compose up -d

# Start monitoring stack
cd infrastructure/monitoring
docker-compose -f docker-compose.monitoring.yml up -d
```

### Access Services
- **API Gateway**: https://localhost (HTTPS) or http://localhost (redirects to HTTPS)
- **Grafana**: http://localhost:3000 (admin/admin123)
- **Prometheus**: http://localhost:9090
- **RabbitMQ Management**: http://localhost:15672 (gasconnect/gasconnect_password)

## Security Features

### HTTPS/SSL Configuration
- **TLS 1.2 and 1.3** protocols only
- **Strong cipher suites** with perfect forward secrecy
- **HSTS headers** for enhanced security
- **Content Security Policy** headers
- **Self-signed certificates** for development (replace with CA certificates for production)

### Security Headers
- Strict-Transport-Security
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- X-XSS-Protection
- Content-Security-Policy

## Production Deployment

1. **Replace SSL certificates** with CA-signed certificates
2. **Update domain names** in nginx configuration
3. **Configure monitoring alerts** for production thresholds
4. **Set up log rotation** and retention policies
5. **Configure backup strategies** for persistent data

## Monitoring and Observability

The monitoring stack provides comprehensive observability:
- **Application metrics** from all microservices
- **Infrastructure metrics** (CPU, memory, disk, network)
- **Database metrics** (PostgreSQL performance)
- **Cache metrics** (Redis performance)
- **API Gateway metrics** (request rates, response times)
- **Distributed tracing** for request flow analysis
- **Centralized logging** with search and analysis capabilities
