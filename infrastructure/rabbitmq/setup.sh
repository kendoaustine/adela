#!/bin/bash

# RabbitMQ Setup Script for GasConnect
# This script sets up exchanges, queues, and bindings for inter-service communication

set -e

echo "🐰 Setting up RabbitMQ for GasConnect..."

# RabbitMQ connection details
RABBITMQ_HOST=${RABBITMQ_HOST:-localhost}
RABBITMQ_PORT=${RABBITMQ_PORT:-15672}
RABBITMQ_USER=${RABBITMQ_USER:-gasconnect}
RABBITMQ_PASS=${RABBITMQ_PASS:-gasconnect_password}
RABBITMQ_VHOST=${RABBITMQ_VHOST:-/}

# Base URL for RabbitMQ Management API
BASE_URL="http://${RABBITMQ_HOST}:${RABBITMQ_PORT}/api"

# Function to make API calls
api_call() {
    local method=$1
    local endpoint=$2
    local data=$3
    
    if [ -n "$data" ]; then
        curl -s -u "${RABBITMQ_USER}:${RABBITMQ_PASS}" \
             -X "$method" \
             -H "Content-Type: application/json" \
             -d "$data" \
             "${BASE_URL}${endpoint}"
    else
        curl -s -u "${RABBITMQ_USER}:${RABBITMQ_PASS}" \
             -X "$method" \
             "${BASE_URL}${endpoint}"
    fi
}

# Wait for RabbitMQ to be ready
echo "⏳ Waiting for RabbitMQ to be ready..."
until api_call GET "/overview" > /dev/null 2>&1; do
    echo "Waiting for RabbitMQ Management API..."
    sleep 5
done
echo "✅ RabbitMQ is ready!"

# Create exchanges
echo "📡 Creating exchanges..."

# Auth events exchange
api_call PUT "/exchanges/${RABBITMQ_VHOST}/auth.events" '{
    "type": "topic",
    "durable": true,
    "auto_delete": false,
    "arguments": {}
}'

# Orders events exchange
api_call PUT "/exchanges/${RABBITMQ_VHOST}/orders.events" '{
    "type": "topic",
    "durable": true,
    "auto_delete": false,
    "arguments": {}
}'

# Supplier events exchange
api_call PUT "/exchanges/${RABBITMQ_VHOST}/supplier.events" '{
    "type": "topic",
    "durable": true,
    "auto_delete": false,
    "arguments": {}
}'

# Dead letter exchange
api_call PUT "/exchanges/${RABBITMQ_VHOST}/gasconnect.dlx" '{
    "type": "direct",
    "durable": true,
    "auto_delete": false,
    "arguments": {}
}'

echo "✅ Exchanges created successfully!"

# Create queues with dead letter exchange configuration
echo "📬 Creating queues..."

# Dead letter queue
api_call PUT "/queues/${RABBITMQ_VHOST}/gasconnect.dlq" '{
    "durable": true,
    "auto_delete": false,
    "arguments": {}
}'

# Auth service queues
declare -a auth_queues=(
    "auth.order.created"
    "auth.order.status.changed"
    "auth.delivery.status.changed"
    "auth.payment.processed"
)

# Orders service queues
declare -a orders_queues=(
    "orders.user.created"
    "orders.user.verified"
    "orders.supplier.verified"
    "orders.inventory.updated"
    "orders.pricing.updated"
    "orders.payment.processed"
)

# Supplier service queues
declare -a supplier_queues=(
    "supplier.user.created"
    "supplier.user.verified"
    "supplier.supplier.verified"
    "supplier.order.created"
    "supplier.order.status.changed"
    "supplier.delivery.status.changed"
    "supplier.emergency.sos"
)

# Function to create queue with DLX
create_queue() {
    local queue_name=$1
    api_call PUT "/queues/${RABBITMQ_VHOST}/${queue_name}" '{
        "durable": true,
        "auto_delete": false,
        "arguments": {
            "x-dead-letter-exchange": "gasconnect.dlx",
            "x-dead-letter-routing-key": "failed",
            "x-message-ttl": 86400000,
            "x-max-retries": 3
        }
    }'
}

# Create all queues
for queue in "${auth_queues[@]}"; do
    create_queue "$queue"
done

for queue in "${orders_queues[@]}"; do
    create_queue "$queue"
done

for queue in "${supplier_queues[@]}"; do
    create_queue "$queue"
done

echo "✅ Queues created successfully!"

# Create bindings
echo "🔗 Creating queue bindings..."

# Function to create binding
create_binding() {
    local exchange=$1
    local queue=$2
    local routing_key=$3
    
    api_call POST "/bindings/${RABBITMQ_VHOST}/e/${exchange}/q/${queue}" "{
        \"routing_key\": \"${routing_key}\",
        \"arguments\": {}
    }"
}

# Auth events bindings
create_binding "auth.events" "orders.user.created" "user.created"
create_binding "auth.events" "orders.user.verified" "user.verified"
create_binding "auth.events" "orders.supplier.verified" "supplier.verified"
create_binding "auth.events" "supplier.user.created" "user.created"
create_binding "auth.events" "supplier.user.verified" "user.verified"
create_binding "auth.events" "supplier.supplier.verified" "supplier.verified"

# Orders events bindings
create_binding "orders.events" "supplier.order.created" "order.created"
create_binding "orders.events" "supplier.order.status.changed" "order.status.changed"
create_binding "orders.events" "supplier.delivery.status.changed" "delivery.status.changed"
create_binding "orders.events" "supplier.emergency.sos" "emergency.sos"
create_binding "orders.events" "auth.order.created" "order.created"
create_binding "orders.events" "auth.order.status.changed" "order.status.changed"
create_binding "orders.events" "auth.delivery.status.changed" "delivery.status.changed"

# Supplier events bindings
create_binding "supplier.events" "orders.inventory.updated" "inventory.updated"
create_binding "supplier.events" "orders.pricing.updated" "pricing.updated"
create_binding "supplier.events" "orders.payment.processed" "payment.processed"
create_binding "supplier.events" "auth.payment.processed" "payment.processed"

# Dead letter bindings
create_binding "gasconnect.dlx" "gasconnect.dlq" "failed"

echo "✅ Queue bindings created successfully!"

# Set up policies
echo "📋 Setting up policies..."

# High availability policy
api_call PUT "/policies/${RABBITMQ_VHOST}/ha-all" '{
    "pattern": ".*",
    "definition": {
        "ha-mode": "all",
        "ha-sync-mode": "automatic"
    },
    "priority": 0,
    "apply-to": "all"
}'

# TTL policy for temporary queues
api_call PUT "/policies/${RABBITMQ_VHOST}/temp-ttl" '{
    "pattern": "temp\\.*",
    "definition": {
        "expires": 3600000
    },
    "priority": 1,
    "apply-to": "queues"
}'

echo "✅ Policies set up successfully!"

# Create monitoring user (optional)
if [ "${CREATE_MONITORING_USER:-false}" = "true" ]; then
    echo "👤 Creating monitoring user..."
    
    api_call PUT "/users/monitoring" '{
        "password": "monitoring_password",
        "tags": "monitoring"
    }'
    
    api_call PUT "/permissions/${RABBITMQ_VHOST}/monitoring" '{
        "configure": "",
        "write": "",
        "read": ".*"
    }'
    
    echo "✅ Monitoring user created!"
fi

echo ""
echo "🎉 RabbitMQ setup completed successfully!"
echo ""
echo "📊 Summary:"
echo "   - 4 exchanges created (auth.events, orders.events, supplier.events, gasconnect.dlx)"
echo "   - $(( ${#auth_queues[@]} + ${#orders_queues[@]} + ${#supplier_queues[@]} + 1 )) queues created"
echo "   - Queue bindings configured for event routing"
echo "   - High availability and TTL policies applied"
echo ""
echo "🔍 You can monitor the setup at: http://${RABBITMQ_HOST}:${RABBITMQ_PORT}"
echo "   Username: ${RABBITMQ_USER}"
echo "   Password: ${RABBITMQ_PASS}"
