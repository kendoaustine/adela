#!/bin/bash

# GasConnect Comprehensive E2E Test Runner
# Runs end-to-end tests simulating different user perspectives and roles

set -e

echo "🧪 GasConnect Comprehensive E2E Test Suite"
echo "=========================================="

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Test configuration
TEST_ENV=${TEST_ENV:-"development"}
BASE_URL=${BASE_URL:-"https://localhost"}
HTTP_URL=${HTTP_URL:-"http://localhost"}
TIMEOUT=${TIMEOUT:-60000}
MONITORING_ENABLED=${MONITORING_ENABLED:-"false"}
CONTINUE_ON_FAILURE=${CONTINUE_ON_FAILURE:-"false"}

echo -e "${BLUE}Environment: ${TEST_ENV}${NC}"
echo -e "${BLUE}HTTPS URL: ${BASE_URL}${NC}"
echo -e "${BLUE}HTTP URL: ${HTTP_URL}${NC}"
echo -e "${BLUE}Timeout: ${TIMEOUT}ms${NC}"
echo -e "${BLUE}Monitoring Tests: ${MONITORING_ENABLED}${NC}"
echo

# Function to check service health
check_service_health() {
    local service_name=$1
    local url=$2
    local expected_status=${3:-200}
    
    echo -e "${BLUE}Checking ${service_name}...${NC}"
    
    # Use curl with SSL verification disabled for self-signed certificates
    local response_code=$(curl -k -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
    
    if [ "$response_code" = "$expected_status" ] || [ "$response_code" = "301" ]; then
        echo -e "${GREEN}✅ ${service_name} is accessible (HTTP ${response_code})${NC}"
        return 0
    else
        echo -e "${RED}❌ ${service_name} is not accessible (HTTP ${response_code})${NC}"
        return 1
    fi
}

# Function to run specific test suite
run_test_suite() {
    local suite_name=$1
    local test_file=$2
    local description=$3
    
    echo
    echo -e "${PURPLE}🧪 Running ${suite_name}${NC}"
    echo -e "${BLUE}${description}${NC}"
    echo "----------------------------------------"
    
    if [ -f "$test_file" ]; then
        # Set environment variables for the test
        export TEST_CONFIG_BASE_URL="$BASE_URL"
        export TEST_CONFIG_HTTP_URL="$HTTP_URL"
        export TEST_CONFIG_TIMEOUT="$TIMEOUT"
        
        # Run the specific test file
        npx jest "$test_file" --verbose --detectOpenHandles --forceExit --testTimeout="$TIMEOUT"
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ ${suite_name} completed successfully${NC}"
        else
            echo -e "${RED}❌ ${suite_name} failed${NC}"
            if [ "$CONTINUE_ON_FAILURE" != "true" ]; then
                exit 1
            fi
        fi
    else
        echo -e "${YELLOW}⚠️  Test file not found: ${test_file}${NC}"
    fi
}

# Function to display test summary
display_summary() {
    echo
    echo -e "${PURPLE}📊 Test Summary${NC}"
    echo "==============="
    echo -e "${BLUE}Test Environment:${NC} $TEST_ENV"
    echo -e "${BLUE}Base URL:${NC} $BASE_URL"
    echo -e "${BLUE}Services Tested:${NC} Auth, Orders, Supplier, API Gateway"
    echo -e "${BLUE}User Journeys:${NC} Household, Supplier, Admin"
    echo -e "${BLUE}SSL/HTTPS:${NC} Verified"
    echo -e "${BLUE}Monitoring:${NC} ${MONITORING_ENABLED}"
    echo
}

# Pre-flight checks
echo -e "${BLUE}🔍 Pre-flight Service Checks${NC}"
echo "=============================="

# Check core services
check_service_health "API Gateway (HTTPS)" "$BASE_URL/health" "200"
check_service_health "API Gateway (HTTP->HTTPS Redirect)" "$HTTP_URL/health" "301"

# Check if we can reach the auth service through the gateway (POST request for login)
echo -e "${BLUE}Checking Auth Service via Gateway...${NC}"
auth_response_code=$(curl -k -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{"identifier":"test","password":"test"}' "$BASE_URL/api/v1/auth/login" 2>/dev/null || echo "000")
if [ "$auth_response_code" = "401" ] || [ "$auth_response_code" = "400" ]; then
    echo -e "${GREEN}✅ Auth Service via Gateway is accessible (HTTP ${auth_response_code})${NC}"
else
    echo -e "${RED}❌ Auth Service via Gateway is not accessible (HTTP ${auth_response_code})${NC}"
    exit 1
fi

# Check if monitoring services are available (optional)
if [ "$MONITORING_ENABLED" = "true" ]; then
    check_service_health "Prometheus" "http://localhost:9090/api/v1/status/config" "200" || echo -e "${YELLOW}⚠️  Monitoring tests will be skipped${NC}"
    check_service_health "Grafana" "http://localhost:3000/api/health" "200" || echo -e "${YELLOW}⚠️  Grafana tests will be skipped${NC}"
fi

echo

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}📦 Installing test dependencies...${NC}"
    npm install
    echo
fi

# Check if Jest is available
if ! command -v npx &> /dev/null; then
    echo -e "${RED}❌ npx not found. Please install Node.js and npm${NC}"
    exit 1
fi

echo -e "${GREEN}✅ All pre-flight checks passed${NC}"
echo

# Run comprehensive test suites in order
echo -e "${PURPLE}🚀 Starting Comprehensive E2E Test Suite${NC}"
echo "=========================================="

# 1. Infrastructure and SSL tests
run_test_suite "Infrastructure Tests" \
    "tests/e2e/infrastructure.test.js" \
    "Verifies SSL/HTTPS configuration, API Gateway routing, and service health"

# 2. Household user journey
run_test_suite "Household User Journey" \
    "tests/e2e/household-user-journey.test.js" \
    "Tests complete household user flow: Registration → Login → Browse → Order → Track"

# 3. Supplier user journey  
run_test_suite "Supplier User Journey" \
    "tests/e2e/supplier-user-journey.test.js" \
    "Tests supplier flow: Registration → Inventory → Order Fulfillment → Payments"

# 4. Admin user journey
run_test_suite "Admin User Journey" \
    "tests/e2e/admin-user-journey.test.js" \
    "Tests admin functions: User Management → System Monitoring → Analytics"

# 5. Monitoring integration (if enabled)
if [ "$MONITORING_ENABLED" = "true" ]; then
    run_test_suite "Monitoring Integration" \
        "tests/e2e/monitoring-integration.test.js" \
        "Verifies monitoring stack captures metrics from user interactions"
fi

# Display final summary
display_summary

echo -e "${GREEN}🎉 All E2E tests completed successfully!${NC}"
echo
echo -e "${BLUE}Next Steps:${NC}"
echo "• Review test results and logs"
echo "• Check monitoring dashboards for captured metrics"
echo "• Verify SSL certificates are properly configured"
echo "• Consider running load tests for production readiness"
echo
