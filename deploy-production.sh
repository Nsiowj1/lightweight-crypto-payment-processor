#!/bin/bash

# Production Deployment Script for Crypto Payment Processor
# Usage: ./deploy-production.sh [environment]

set -e  # Exit on any error

ENVIRONMENT=${1:-production}
echo "🚀 Starting production deployment for $ENVIRONMENT environment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if required tools are installed
check_dependencies() {
    print_status "Checking dependencies..."

    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 18+ first."
        exit 1
    fi

    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed. Please install npm first."
        exit 1
    fi

    if ! command -v docker &> /dev/null && [[ "$ENVIRONMENT" == "docker" ]]; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi

    print_success "All dependencies are installed"
}

# Validate environment variables
validate_env() {
    print_status "Validating environment configuration..."

    required_vars=(
        "SUPABASE_URL"
        "SUPABASE_ANON_KEY"
        "SUPABASE_SERVICE_ROLE_KEY"
        "JWT_SECRET"
        "WEBHOOK_SECRET"
    )

    missing_vars=()

    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            missing_vars+=("$var")
        fi
    done

    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        print_error "Missing required environment variables: ${missing_vars[*]}"
        print_error "Please check your .env file or environment configuration"
        exit 1
    fi

    print_success "Environment configuration is valid"
}

# Install dependencies
install_dependencies() {
    print_status "Installing dependencies..."

    if [[ "$ENVIRONMENT" == "docker" ]]; then
        print_status "Building Docker image..."
        docker build -t crypto-payment-processor:latest .
        print_success "Docker image built successfully"
    else
        npm ci --production
        print_success "Dependencies installed successfully"
    fi
}

# Run database migrations/setup
setup_database() {
    print_status "Setting up database..."

    # Check if Supabase is accessible
    if curl -s "$SUPABASE_URL/rest/v1/" -H "apikey: $SUPABASE_ANON_KEY" > /dev/null; then
        print_success "Database connection verified"

        # Note: In a real deployment, you would run the schema.sql here
        print_status "Database tables should be created manually in Supabase dashboard"
        print_status "Run the contents of supabase-schema.sql in your Supabase SQL editor"
    else
        print_warning "Database connection failed - please verify your Supabase configuration"
    fi
}

# Run tests
run_tests() {
    print_status "Running tests..."

    # Basic health check
    timeout=30
    print_status "Testing application health..."

    if [[ "$ENVIRONMENT" == "docker" ]]; then
        # Start the container
        container_id=$(docker run -d -p 3000:3000 --env-file .env crypto-payment-processor:latest)
        sleep 10

        # Test health endpoint
        if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
            print_success "Application health check passed"
        else
            print_error "Application health check failed"
            docker logs "$container_id"
            exit 1
        fi

        # Clean up
        docker stop "$container_id"
        docker rm "$container_id"
    else
        # Start the application in background for testing
        npm start &
        app_pid=$!

        # Wait for startup
        sleep 15

        # Test health endpoint
        if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
            print_success "Application health check passed"
        else
            print_error "Application health check failed"
            kill "$app_pid" 2>/dev/null || true
            exit 1
        fi

        # Clean up
        kill "$app_pid" 2>/dev/null || true
        wait "$app_pid" 2>/dev/null || true
    fi
}

# Deploy application
deploy() {
    print_status "Deploying application..."

    if [[ "$ENVIRONMENT" == "docker" ]]; then
        print_status "Deploying with Docker..."
        docker run -d \
            --name crypto-payment-processor \
            -p 3000:3000 \
            --env-file .env \
            --restart unless-stopped \
            --health-cmd="curl -f http://localhost:3000/api/health || exit 1" \
            --health-interval=30s \
            --health-timeout=10s \
            --health-start-period=30s \
            crypto-payment-processor:latest

        print_success "Application deployed successfully with Docker"
        print_status "Container name: crypto-payment-processor"
        print_status "View logs: docker logs crypto-payment-processor"

    elif [[ "$ENVIRONMENT" == "render" ]]; then
        print_status "Deploying to Render.com..."
        print_warning "Make sure to:"
        print_warning "1. Update render.yaml with your actual domain"
        print_warning "2. Set environment variables in Render.com dashboard"
        print_warning "3. Push to your Git repository connected to Render"

        print_status "To deploy manually:"
        print_status "1. Commit and push your changes to Git"
        print_status "2. Render will automatically deploy from render.yaml"

    else
        print_status "Starting application in $ENVIRONMENT mode..."
        NODE_ENV=$ENVIRONMENT npm start
    fi
}

# Main deployment flow
main() {
    print_status "=== Crypto Payment Processor - Production Deployment ==="

    check_dependencies
    validate_env
    install_dependencies
    setup_database
    run_tests
    deploy

    print_success "🎉 Deployment completed successfully!"
    print_status ""
    print_status "Next steps:"
    print_status "1. Verify your application at http://localhost:3000"
    print_status "2. Check the logs for any issues"
    print_status "3. Update your DNS settings if needed"
    print_status "4. Set up SSL certificate for HTTPS"
    print_status ""
    print_status "For Docker: docker logs crypto-payment-processor"
    print_status "For systemd: journalctl -u crypto-payment-processor"
}

# Handle script arguments
case "${1:-}" in
    "docker")
        ENVIRONMENT="docker"
        main
        ;;
    "render")
        ENVIRONMENT="render"
        main
        ;;
    "test")
        check_dependencies
        validate_env
        run_tests
        print_success "All tests passed!"
        ;;
    *)
        main
        ;;
esac
