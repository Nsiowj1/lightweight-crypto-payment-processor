# Multi-stage build for production optimization
FROM node:18-alpine AS base

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Set working directory
WORKDIR /app

# Copy package files for better caching
COPY package*.json ./

# Production dependencies stage
FROM base AS production-deps
RUN npm ci --only=production && npm cache clean --force

# Build stage (if you had a build process)
FROM base AS build
COPY src/ ./src/
COPY public/ ./public/

# Production image
FROM node:18-alpine AS production

# Install dumb-init for proper signal handling in production
RUN apk add --no-cache dumb-init curl

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy production dependencies
COPY --from=production-deps /app/node_modules ./node_modules

# Copy application code
COPY --from=build /app/src ./src
COPY --from=build /app/public ./public

# Change ownership and switch to non-root user
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 3000

# Add labels for better container management
LABEL maintainer="Lightweight Crypto Team" \
      version="1.0.0" \
      description="Lightweight, self-hosted cryptocurrency payment processor"

# Enhanced health check with timeout and retries
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start the application with proper signal handling
CMD ["node", "src/server.js"]
