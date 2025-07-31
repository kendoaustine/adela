#!/bin/bash

# GasConnect Test Runner
# Comprehensive test suite for all services

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TEST_ENV=${TEST_ENV:-test}
PARALLEL=${PARALLEL:-false}
COVERAGE=${COVERAGE:-true}
INTEGRATION=${INTEGRATION:-true}
E2E=${E2E:-true}

echo -e "${BLUE}🧪 GasConnect Test Runner${NC}"
echo -e "${BLUE}=========================${NC}"
echo ""

# Function to print status
print_status() {
    local status=$1
    local message=$2
    case $status in
        "info")
            echo -e "${BLUE}ℹ️  $message${NC}"
            ;;
        "success")
            echo -e "${GREEN}✅ $message${NC}"
            ;;
        "warning")
            echo -e "${YELLOW}⚠️  $message${NC}"
            ;;
        "error")
            echo -e "${RED}❌ $message${NC}"
            ;;
    esac
}

# Function to run command with status
run_with_status() {
    local description=$1
    local command=$2
    
    print_status "info" "Running: $description"
    
    if eval "$command"; then
        print_status "success" "$description completed"
        return 0
    else
        print_status "error" "$description failed"
        return 1
    fi
}

# Check prerequisites
check_prerequisites() {
    print_status "info" "Checking prerequisites..."
    
    # Check if Docker is running
    if ! docker info > /dev/null 2>&1; then
        print_status "error" "Docker is not running. Please start Docker."
        exit 1
    fi
    
    # Check if Docker Compose is available
    if ! command -v docker-compose > /dev/null 2>&1; then
        print_status "error" "Docker Compose is not installed."
        exit 1
    fi
    
    # Check if Node.js is available
    if ! command -v node > /dev/null 2>&1; then
        print_status "error" "Node.js is not installed."
        exit 1
    fi
    
    print_status "success" "Prerequisites check passed"
}

# Setup test environment
setup_test_environment() {
    print_status "info" "Setting up test environment..."
    
    # Stop any running containers
    docker-compose -f docker-compose.test.yml down > /dev/null 2>&1 || true
    
    # Start test infrastructure
    run_with_status "Starting test infrastructure" \
        "docker-compose -f docker-compose.test.yml up -d postgres redis rabbitmq"
    
    # Wait for services to be ready
    print_status "info" "Waiting for services to be ready..."
    sleep 10
    
    # Setup test database
    run_with_status "Setting up test database" \
        "docker-compose -f docker-compose.test.yml exec -T postgres psql -U gasconnect -d gasconnect_test -f /docker-entrypoint-initdb.d/01-schema.sql"
    
    run_with_status "Loading test data" \
        "docker-compose -f docker-compose.test.yml exec -T postgres psql -U gasconnect -d gasconnect_test -f /docker-entrypoint-initdb.d/02-sample-data.sql"
    
    # Setup RabbitMQ
    run_with_status "Setting up RabbitMQ" \
        "RABBITMQ_HOST=localhost RABBITMQ_PORT=15672 ./infrastructure/rabbitmq/setup.sh"
    
    print_status "success" "Test environment setup completed"
}

# Install dependencies
install_dependencies() {
    print_status "info" "Installing dependencies..."
    
    services=("auth-service" "orders-service" "supplier-service")
    
    for service in "${services[@]}"; do
        if [ -d "services/$service" ]; then
            run_with_status "Installing dependencies for $service" \
                "cd services/$service && npm ci"
        fi
    done
    
    # Install root dependencies for integration tests
    if [ -f "package.json" ]; then
        run_with_status "Installing root dependencies" "npm ci"
    fi
    
    print_status "success" "Dependencies installation completed"
}

# Run unit tests
run_unit_tests() {
    print_status "info" "Running unit tests..."
    
    local failed_services=()
    services=("auth-service" "orders-service" "supplier-service")
    
    for service in "${services[@]}"; do
        if [ -d "services/$service" ]; then
            print_status "info" "Running unit tests for $service"
            
            if [ "$COVERAGE" = "true" ]; then
                test_command="cd services/$service && npm run test:coverage"
            else
                test_command="cd services/$service && npm test"
            fi
            
            if ! eval "$test_command"; then
                failed_services+=("$service")
                print_status "error" "Unit tests failed for $service"
            else
                print_status "success" "Unit tests passed for $service"
            fi
        fi
    done
    
    if [ ${#failed_services[@]} -eq 0 ]; then
        print_status "success" "All unit tests passed"
        return 0
    else
        print_status "error" "Unit tests failed for: ${failed_services[*]}"
        return 1
    fi
}

# Run integration tests
run_integration_tests() {
    if [ "$INTEGRATION" != "true" ]; then
        print_status "info" "Skipping integration tests"
        return 0
    fi
    
    print_status "info" "Running integration tests..."
    
    # Start services for integration testing
    run_with_status "Starting services for integration tests" \
        "docker-compose -f docker-compose.test.yml up -d"
    
    # Wait for services to be ready
    print_status "info" "Waiting for services to be ready..."
    sleep 15
    
    # Run integration tests
    local test_files=(
        "tests/integration/auth-service.test.js"
        "tests/integration/orders-service.test.js"
        "tests/integration/supplier-service.test.js"
    )
    
    local failed_tests=()
    
    for test_file in "${test_files[@]}"; do
        if [ -f "$test_file" ]; then
            service_name=$(basename "$test_file" .test.js)
            print_status "info" "Running integration tests for $service_name"
            
            if npx jest "$test_file" --testTimeout=30000; then
                print_status "success" "Integration tests passed for $service_name"
            else
                failed_tests+=("$service_name")
                print_status "error" "Integration tests failed for $service_name"
            fi
        fi
    done
    
    if [ ${#failed_tests[@]} -eq 0 ]; then
        print_status "success" "All integration tests passed"
        return 0
    else
        print_status "error" "Integration tests failed for: ${failed_tests[*]}"
        return 1
    fi
}

# Run end-to-end tests
run_e2e_tests() {
    if [ "$E2E" != "true" ]; then
        print_status "info" "Skipping end-to-end tests"
        return 0
    fi
    
    print_status "info" "Running end-to-end tests..."
    
    # Ensure all services are running
    run_with_status "Starting all services for E2E tests" \
        "docker-compose -f docker-compose.test.yml up -d"
    
    # Wait for services to be fully ready
    print_status "info" "Waiting for all services to be ready..."
    sleep 20
    
    # Run E2E tests
    local e2e_files=(
        "tests/e2e/order-flow.test.js"
        "tests/e2e/user-journey.test.js"
        "tests/e2e/supplier-workflow.test.js"
    )
    
    local failed_e2e=()
    
    for test_file in "${e2e_files[@]}"; do
        if [ -f "$test_file" ]; then
            test_name=$(basename "$test_file" .test.js)
            print_status "info" "Running E2E test: $test_name"
            
            if npx jest "$test_file" --testTimeout=60000; then
                print_status "success" "E2E test passed: $test_name"
            else
                failed_e2e+=("$test_name")
                print_status "error" "E2E test failed: $test_name"
            fi
        fi
    done
    
    if [ ${#failed_e2e[@]} -eq 0 ]; then
        print_status "success" "All E2E tests passed"
        return 0
    else
        print_status "error" "E2E tests failed for: ${failed_e2e[*]}"
        return 1
    fi
}

# Generate test report
generate_test_report() {
    print_status "info" "Generating test report..."
    
    local report_dir="test-reports"
    mkdir -p "$report_dir"
    
    # Combine coverage reports if available
    if [ "$COVERAGE" = "true" ]; then
        print_status "info" "Combining coverage reports..."
        
        # Create combined coverage report
        cat > "$report_dir/coverage-summary.md" << EOF
# Test Coverage Summary

Generated on: $(date)

## Service Coverage

EOF
        
        for service in "auth-service" "orders-service" "supplier-service"; do
            if [ -f "services/$service/coverage/coverage-summary.json" ]; then
                echo "### $service" >> "$report_dir/coverage-summary.md"
                echo "" >> "$report_dir/coverage-summary.md"
                # Parse and format coverage data (simplified)
                echo "Coverage data available in services/$service/coverage/" >> "$report_dir/coverage-summary.md"
                echo "" >> "$report_dir/coverage-summary.md"
            fi
        done
    fi
    
    # Create test summary
    cat > "$report_dir/test-summary.md" << EOF
# Test Execution Summary

Generated on: $(date)
Environment: $TEST_ENV

## Test Configuration
- Coverage: $COVERAGE
- Integration Tests: $INTEGRATION
- End-to-End Tests: $E2E
- Parallel Execution: $PARALLEL

## Test Results
- Unit Tests: $([ $unit_test_result -eq 0 ] && echo "✅ PASSED" || echo "❌ FAILED")
- Integration Tests: $([ $integration_test_result -eq 0 ] && echo "✅ PASSED" || echo "❌ FAILED")
- End-to-End Tests: $([ $e2e_test_result -eq 0 ] && echo "✅ PASSED" || echo "❌ FAILED")

## Artifacts
- Coverage Reports: Available in each service's coverage/ directory
- Test Logs: Available in test-reports/ directory
- Screenshots (E2E): Available in test-reports/screenshots/ directory

EOF
    
    print_status "success" "Test report generated in $report_dir/"
}

# Cleanup test environment
cleanup_test_environment() {
    print_status "info" "Cleaning up test environment..."
    
    # Stop test containers
    docker-compose -f docker-compose.test.yml down > /dev/null 2>&1 || true
    
    # Remove test volumes if specified
    if [ "$CLEANUP_VOLUMES" = "true" ]; then
        docker-compose -f docker-compose.test.yml down -v > /dev/null 2>&1 || true
    fi
    
    print_status "success" "Test environment cleanup completed"
}

# Main execution
main() {
    local start_time=$(date +%s)
    
    # Initialize result variables
    unit_test_result=0
    integration_test_result=0
    e2e_test_result=0
    
    # Trap cleanup on exit
    trap cleanup_test_environment EXIT
    
    print_status "info" "Starting test execution with configuration:"
    echo "  - Environment: $TEST_ENV"
    echo "  - Coverage: $COVERAGE"
    echo "  - Integration: $INTEGRATION"
    echo "  - End-to-End: $E2E"
    echo "  - Parallel: $PARALLEL"
    echo ""
    
    # Run test phases
    check_prerequisites
    setup_test_environment
    install_dependencies
    
    # Run tests
    run_unit_tests
    unit_test_result=$?
    
    run_integration_tests
    integration_test_result=$?
    
    run_e2e_tests
    e2e_test_result=$?
    
    # Generate report
    generate_test_report
    
    # Calculate execution time
    local end_time=$(date +%s)
    local execution_time=$((end_time - start_time))
    
    # Print final results
    echo ""
    print_status "info" "Test execution completed in ${execution_time}s"
    echo ""
    
    if [ $unit_test_result -eq 0 ] && [ $integration_test_result -eq 0 ] && [ $e2e_test_result -eq 0 ]; then
        print_status "success" "All tests passed! 🎉"
        exit 0
    else
        print_status "error" "Some tests failed. Check the reports for details."
        exit 1
    fi
}

# Handle command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --no-coverage)
            COVERAGE=false
            shift
            ;;
        --no-integration)
            INTEGRATION=false
            shift
            ;;
        --no-e2e)
            E2E=false
            shift
            ;;
        --parallel)
            PARALLEL=true
            shift
            ;;
        --cleanup-volumes)
            CLEANUP_VOLUMES=true
            shift
            ;;
        --help)
            echo "GasConnect Test Runner"
            echo ""
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --no-coverage      Skip coverage collection"
            echo "  --no-integration   Skip integration tests"
            echo "  --no-e2e          Skip end-to-end tests"
            echo "  --parallel        Run tests in parallel (experimental)"
            echo "  --cleanup-volumes Remove test volumes after execution"
            echo "  --help            Show this help message"
            echo ""
            exit 0
            ;;
        *)
            print_status "error" "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Run main function
main
