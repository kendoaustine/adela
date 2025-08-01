# GasConnect Deployment Guide

This guide covers deployment strategies for the GasConnect platform across different environments.

## 🏗️ Architecture Overview

GasConnect follows a microservices architecture with the following components:

- **API Gateway** (Nginx) - Load balancing, SSL termination, rate limiting
- **Authentication Service** - User management and authentication
- **Orders Service** - Order processing and delivery management
- **Supplier Service** - Inventory and supplier management
- **PostgreSQL** - Primary database
- **Redis** - Caching and session storage
- **RabbitMQ** - Message broker for inter-service communication

## 🐳 Docker Deployment

### Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- 4GB+ RAM
- 20GB+ disk space

### Quick Start

1. **Clone and configure:**
```bash
git clone <repository-url>
cd gasconnect
cp .env.example .env
# Edit .env with your configuration
```

2. **Start all services:**
```bash
docker-compose up -d
```

3. **Initialize database:**
```bash
docker-compose exec postgres psql -U gasconnect -d gasconnect -f /docker-entrypoint-initdb.d/01-schema.sql
docker-compose exec postgres psql -U gasconnect -d gasconnect -f /docker-entrypoint-initdb.d/02-sample-data.sql
```

4. **Setup message broker:**
```bash
./infrastructure/rabbitmq/setup.sh
```

### Production Docker Deployment

1. **Use production compose file:**
```bash
docker-compose -f docker-compose.prod.yml up -d
```

2. **Configure SSL certificates:**
```bash
# Place SSL certificates in infrastructure/nginx/ssl/
cp your-cert.pem infrastructure/nginx/ssl/cert.pem
cp your-key.pem infrastructure/nginx/ssl/key.pem
```

3. **Configure environment variables:**
```bash
# Set production environment variables
export NODE_ENV=production
export JWT_SECRET=your-super-secure-jwt-secret
export DATABASE_URL=postgresql://user:pass@host:5432/gasconnect
export REDIS_URL=redis://host:6379
export RABBITMQ_URL=amqp://user:pass@host:5672
```

## ☸️ Kubernetes Deployment

### Prerequisites

- Kubernetes 1.20+
- kubectl configured
- Helm 3.0+ (optional)

### Namespace Setup

```bash
kubectl create namespace gasconnect
kubectl config set-context --current --namespace=gasconnect
```

### ConfigMaps and Secrets

1. **Create configuration:**
```bash
kubectl create configmap gasconnect-config \
  --from-literal=NODE_ENV=production \
  --from-literal=LOG_LEVEL=info \
  --from-literal=CORS_ORIGIN=https://gasconnect.com
```

2. **Create secrets:**
```bash
kubectl create secret generic gasconnect-secrets \
  --from-literal=JWT_SECRET=your-jwt-secret \
  --from-literal=DATABASE_URL=postgresql://... \
  --from-literal=REDIS_URL=redis://... \
  --from-literal=RABBITMQ_URL=amqp://...
```

### Database Deployment

```yaml
# k8s/postgres.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:14-alpine
        env:
        - name: POSTGRES_DB
          value: gasconnect
        - name: POSTGRES_USER
          value: gasconnect
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: gasconnect-secrets
              key: POSTGRES_PASSWORD
        ports:
        - containerPort: 5432
        volumeMounts:
        - name: postgres-storage
          mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
  - metadata:
      name: postgres-storage
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 20Gi
```

### Service Deployments

```yaml
# k8s/auth-service.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: auth-service
  template:
    metadata:
      labels:
        app: auth-service
    spec:
      containers:
      - name: auth-service
        image: gasconnect/auth-service:latest
        ports:
        - containerPort: 3001
        env:
        - name: NODE_ENV
          valueFrom:
            configMapKeyRef:
              name: gasconnect-config
              key: NODE_ENV
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: gasconnect-secrets
              key: JWT_SECRET
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: gasconnect-secrets
              key: DATABASE_URL
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3001
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3001
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

### Ingress Configuration

```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: gasconnect-ingress
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/rate-limit-window: "1m"
spec:
  tls:
  - hosts:
    - api.gasconnect.com
    secretName: gasconnect-tls
  rules:
  - host: api.gasconnect.com
    http:
      paths:
      - path: /api/v1/auth
        pathType: Prefix
        backend:
          service:
            name: auth-service
            port:
              number: 3001
      - path: /api/v1/orders
        pathType: Prefix
        backend:
          service:
            name: orders-service
            port:
              number: 3002
      - path: /api/v1/suppliers
        pathType: Prefix
        backend:
          service:
            name: supplier-service
            port:
              number: 3003
```

### Deploy to Kubernetes

```bash
# Apply all configurations
kubectl apply -f k8s/

# Check deployment status
kubectl get pods
kubectl get services
kubectl get ingress

# View logs
kubectl logs -f deployment/auth-service
```

## 🌩️ Cloud Deployment

### AWS ECS Deployment

1. **Create ECS cluster:**
```bash
aws ecs create-cluster --cluster-name gasconnect-cluster
```

2. **Create task definitions:**
```json
{
  "family": "gasconnect-auth-service",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::account:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "auth-service",
      "image": "gasconnect/auth-service:latest",
      "portMappings": [
        {
          "containerPort": 3001,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        }
      ],
      "secrets": [
        {
          "name": "JWT_SECRET",
          "valueFrom": "arn:aws:secretsmanager:region:account:secret:gasconnect/jwt-secret"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/gasconnect-auth-service",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

3. **Create services:**
```bash
aws ecs create-service \
  --cluster gasconnect-cluster \
  --service-name auth-service \
  --task-definition gasconnect-auth-service \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-12345],securityGroups=[sg-12345],assignPublicIp=ENABLED}"
```

### Google Cloud Run Deployment

1. **Build and push images:**
```bash
# Build images
docker build -t gcr.io/project-id/auth-service services/auth-service
docker build -t gcr.io/project-id/orders-service services/orders-service
docker build -t gcr.io/project-id/supplier-service services/supplier-service

# Push to Container Registry
docker push gcr.io/project-id/auth-service
docker push gcr.io/project-id/orders-service
docker push gcr.io/project-id/supplier-service
```

2. **Deploy services:**
```bash
# Deploy auth service
gcloud run deploy auth-service \
  --image gcr.io/project-id/auth-service \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production \
  --set-secrets JWT_SECRET=jwt-secret:latest

# Deploy orders service
gcloud run deploy orders-service \
  --image gcr.io/project-id/orders-service \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated

# Deploy supplier service
gcloud run deploy supplier-service \
  --image gcr.io/project-id/supplier-service \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

## 🔧 Configuration Management

### Environment Variables

**Required for all services:**
- `NODE_ENV` - Environment (development/staging/production)
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `RABBITMQ_URL` - RabbitMQ connection string

**Auth Service specific:**
- `JWT_SECRET` - JWT signing secret
- `JWT_REFRESH_SECRET` - JWT refresh token secret
- `PASSWORD_SALT_ROUNDS` - Bcrypt salt rounds (default: 12)

**Orders Service specific:**
- `AUTH_SERVICE_URL` - Auth service URL
- `SUPPLIER_SERVICE_URL` - Supplier service URL

**Supplier Service specific:**
- `PAYSTACK_SECRET_KEY` - Paystack payment secret key
- `PAYSTACK_PUBLIC_KEY` - Paystack public key
- `PAYSTACK_WEBHOOK_SECRET` - Paystack webhook secret

### Secrets Management

**Using Docker Secrets:**
```bash
echo "your-jwt-secret" | docker secret create jwt_secret -
echo "your-db-password" | docker secret create db_password -
```

**Using Kubernetes Secrets:**
```bash
kubectl create secret generic gasconnect-secrets \
  --from-literal=jwt-secret=your-jwt-secret \
  --from-literal=db-password=your-db-password
```

**Using AWS Secrets Manager:**
```bash
aws secretsmanager create-secret \
  --name gasconnect/jwt-secret \
  --secret-string your-jwt-secret
```

## 📊 Monitoring & Observability

### Health Checks

All services expose health check endpoints:
- `/health` - Basic health check
- `/health/detailed` - Detailed health with dependencies
- `/health/ready` - Readiness probe
- `/health/live` - Liveness probe

### Logging

**Centralized logging with ELK Stack:**
```yaml
# docker-compose.logging.yml
version: '3.8'
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:7.15.0
    environment:
      - discovery.type=single-node
    ports:
      - "9200:9200"

  logstash:
    image: docker.elastic.co/logstash/logstash:7.15.0
    volumes:
      - ./logstash.conf:/usr/share/logstash/pipeline/logstash.conf

  kibana:
    image: docker.elastic.co/kibana/kibana:7.15.0
    ports:
      - "5601:5601"
    environment:
      - ELASTICSEARCH_HOSTS=http://elasticsearch:9200
```

### Metrics

**Prometheus configuration:**
```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'gasconnect-services'
    static_configs:
      - targets: ['auth-service:3001', 'orders-service:3002', 'supplier-service:3003']
    metrics_path: '/metrics'
```

## 🔒 Security Considerations

### SSL/TLS Configuration

1. **Obtain SSL certificates:**
```bash
# Using Let's Encrypt
certbot certonly --webroot -w /var/www/html -d api.gasconnect.com
```

2. **Configure Nginx SSL:**
```nginx
server {
    listen 443 ssl http2;
    server_name api.gasconnect.com;
    
    ssl_certificate /etc/letsencrypt/live/api.gasconnect.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.gasconnect.com/privkey.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    ssl_prefer_server_ciphers off;
}
```

### Network Security

1. **Firewall rules:**
```bash
# Allow only necessary ports
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
ufw deny 3001/tcp  # Block direct service access
ufw deny 3002/tcp
ufw deny 3003/tcp
```

2. **Docker network isolation:**
```yaml
networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true
```

## 🚀 CI/CD Pipeline

### GitHub Actions

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
      - run: npm ci
      - run: npm test

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build Docker images
        run: |
          docker build -t gasconnect/auth-service:${{ github.sha }} services/auth-service
          docker build -t gasconnect/orders-service:${{ github.sha }} services/orders-service
          docker build -t gasconnect/supplier-service:${{ github.sha }} services/supplier-service
      
      - name: Push to registry
        run: |
          echo ${{ secrets.DOCKER_PASSWORD }} | docker login -u ${{ secrets.DOCKER_USERNAME }} --password-stdin
          docker push gasconnect/auth-service:${{ github.sha }}
          docker push gasconnect/orders-service:${{ github.sha }}
          docker push gasconnect/supplier-service:${{ github.sha }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to production
        run: |
          # Deploy using your preferred method
          kubectl set image deployment/auth-service auth-service=gasconnect/auth-service:${{ github.sha }}
```

## 🔄 Backup & Recovery

### Database Backup

```bash
# Automated backup script
#!/bin/bash
BACKUP_DIR="/backups/gasconnect"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup
pg_dump -h localhost -U gasconnect gasconnect > "$BACKUP_DIR/gasconnect_$DATE.sql"

# Compress backup
gzip "$BACKUP_DIR/gasconnect_$DATE.sql"

# Remove backups older than 30 days
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete
```

### Disaster Recovery

1. **Database restoration:**
```bash
# Restore from backup
gunzip -c gasconnect_backup.sql.gz | psql -h localhost -U gasconnect gasconnect
```

2. **Service recovery:**
```bash
# Restart all services
docker-compose down
docker-compose up -d

# Or in Kubernetes
kubectl rollout restart deployment/auth-service
kubectl rollout restart deployment/orders-service
kubectl rollout restart deployment/supplier-service
```

## 📈 Scaling

### Horizontal Scaling

```bash
# Docker Compose scaling
docker-compose up -d --scale auth-service=3 --scale orders-service=3

# Kubernetes scaling
kubectl scale deployment auth-service --replicas=5
kubectl scale deployment orders-service --replicas=5
```

### Database Scaling

1. **Read replicas:**
```yaml
# docker-compose.yml
postgres-replica:
  image: postgres:14-alpine
  environment:
    POSTGRES_USER: gasconnect
    POSTGRES_PASSWORD: password
    POSTGRES_DB: gasconnect
  command: |
    postgres -c wal_level=replica -c max_wal_senders=3 -c max_replication_slots=3
```

2. **Connection pooling:**
```yaml
pgbouncer:
  image: pgbouncer/pgbouncer:latest
  environment:
    DATABASES_HOST: postgres
    DATABASES_PORT: 5432
    DATABASES_USER: gasconnect
    DATABASES_PASSWORD: password
    DATABASES_DBNAME: gasconnect
    POOL_MODE: transaction
    MAX_CLIENT_CONN: 1000
    DEFAULT_POOL_SIZE: 25
```

This deployment guide provides comprehensive instructions for deploying GasConnect across different environments and platforms. Choose the deployment method that best fits your infrastructure and requirements.
