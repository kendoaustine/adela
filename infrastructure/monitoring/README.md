# GasConnect Monitoring Infrastructure

This directory contains the complete monitoring stack for the GasConnect platform, providing comprehensive observability, metrics collection, logging, and alerting capabilities.

## Components

### Core Monitoring
- **Prometheus** (Port 9090) - Metrics collection and storage
- **Grafana** (Port 3000) - Visualization and dashboards
- **AlertManager** (Port 9093) - Alert routing and management

### Exporters
- **Node Exporter** (Port 9100) - System metrics
- **PostgreSQL Exporter** (Port 9187) - Database metrics
- **Redis Exporter** (Port 9121) - Cache metrics
- **cAdvisor** (Port 8080) - Container metrics
- **Nginx Exporter** (Port 9113) - API Gateway metrics
- **Blackbox Exporter** (Port 9115) - Endpoint monitoring

### Logging Stack
- **Loki** (Port 3100) - Log aggregation
- **Promtail** - Log shipping to Loki
- **Elasticsearch** (Port 9200) - Log storage and search
- **Kibana** (Port 5601) - Log visualization

### Additional Tools
- **Jaeger** (Port 16686) - Distributed tracing
- **Uptime Kuma** (Port 3001) - Uptime monitoring

## Quick Start

1. Start the monitoring stack:
```bash
cd infrastructure/monitoring
docker-compose -f docker-compose.monitoring.yml up -d
```

2. Access the services:
- Grafana: http://localhost:3000 (admin/admin123)
- Prometheus: http://localhost:9090
- Jaeger: http://localhost:16686
- Kibana: http://localhost:5601
- Uptime Kuma: http://localhost:3001

## Configuration

- Prometheus config: `prometheus/prometheus.yml`
- Grafana dashboards: `grafana/dashboards/`
- Alert rules: `prometheus/rules/`

## Integration

The monitoring stack integrates with the main GasConnect services through the `gasconnect-network` Docker network, allowing seamless metrics collection from all microservices.
