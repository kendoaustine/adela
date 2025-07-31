#!/bin/bash

# GasConnect Backend Setup Script
set -e

echo "🚀 Setting up GasConnect Backend..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "✅ .env file created. Please update it with your configuration."
else
    echo "✅ .env file already exists."
fi

# Create necessary directories
echo "📁 Creating necessary directories..."
mkdir -p logs uploads infrastructure/nginx/ssl

# Generate self-signed SSL certificates for development
if [ ! -f infrastructure/nginx/ssl/cert.pem ]; then
    echo "🔐 Generating self-signed SSL certificates for development..."
    openssl req -x509 -newkey rsa:4096 -keyout infrastructure/nginx/ssl/key.pem -out infrastructure/nginx/ssl/cert.pem -days 365 -nodes -subj "/C=US/ST=State/L=City/O=GasConnect/CN=localhost"
    echo "✅ SSL certificates generated."
fi

# Build Docker images
echo "🏗️  Building Docker images..."
docker-compose build

# Start services
echo "🚀 Starting services..."
docker-compose up -d postgres redis rabbitmq

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 30

# Run database migrations
echo "🗄️  Running database migrations..."
docker-compose run --rm auth-service npm run migrate || echo "⚠️  Auth service migrations failed or not yet implemented"
docker-compose run --rm orders-service npm run migrate || echo "⚠️  Orders service migrations failed or not yet implemented"
docker-compose run --rm supplier-service npm run migrate || echo "⚠️  Supplier service migrations failed or not yet implemented"

# Seed database with sample data
echo "🌱 Seeding database with sample data..."
docker-compose run --rm auth-service npm run seed || echo "⚠️  Auth service seeding failed or not yet implemented"
docker-compose run --rm orders-service npm run seed || echo "⚠️  Orders service seeding failed or not yet implemented"
docker-compose run --rm supplier-service npm run seed || echo "⚠️  Supplier service seeding failed or not yet implemented"

# Start all services
echo "🚀 Starting all services..."
docker-compose up -d

# Wait for services to be fully ready
echo "⏳ Waiting for all services to be ready..."
sleep 30

# Health check
echo "🏥 Performing health checks..."
if curl -f http://localhost/health > /dev/null 2>&1; then
    echo "✅ API Gateway is healthy"
else
    echo "❌ API Gateway health check failed"
fi

if curl -f http://localhost:3001/health > /dev/null 2>&1; then
    echo "✅ Auth Service is healthy"
else
    echo "❌ Auth Service health check failed"
fi

if curl -f http://localhost:3002/health > /dev/null 2>&1; then
    echo "✅ Orders Service is healthy"
else
    echo "❌ Orders Service health check failed"
fi

if curl -f http://localhost:3003/health > /dev/null 2>&1; then
    echo "✅ Supplier Service is healthy"
else
    echo "❌ Supplier Service health check failed"
fi

echo ""
echo "🎉 GasConnect Backend setup complete!"
echo ""
echo "📋 Service URLs:"
echo "   API Gateway: http://localhost"
echo "   Auth Service: http://localhost:3001"
echo "   Orders Service: http://localhost:3002"
echo "   Supplier Service: http://localhost:3003"
echo "   RabbitMQ Management: http://localhost:15672 (gasconnect/gasconnect_password)"
echo ""
echo "📖 API Documentation:"
echo "   Auth API: http://localhost:3001/api/docs"
echo "   Orders API: http://localhost:3002/api/docs"
echo "   Supplier API: http://localhost:3003/api/docs"
echo ""
echo "🔧 Useful commands:"
echo "   View logs: docker-compose logs -f"
echo "   Stop services: docker-compose down"
echo "   Restart services: docker-compose restart"
echo "   Clean up: docker-compose down -v --remove-orphans"
