# Lightweight Crypto Payment Processor

A lightweight, self-hosted cryptocurrency payment processor supporting BTC, LTC, BNB, SOL, ETH, USDT, and USDC. Built for free tier deployment on Render with Supabase and Upstash Redis.

## Features

- **Multi-chain Support**: BTC, LTC, ETH, BNB, SOL, USDT (ERC-20, BEP-20, TRC-20), USDC (ERC-20, BEP-20)
- **HD Wallet Integration**: Secure address generation for all supported currencies
- **Webhook Notifications**: Real-time payment status updates with signature verification
- **Invoice Management**: Create, track, and expire payment requests
- **Merchant Dashboard**: View payments, balances, and transaction history
- **Zero Fees**: No transaction fees for merchants
- **Free Tier Ready**: Optimized for Supabase (500MB), Upstash Redis (256MB), and Render (512MB RAM)

## Quick Start

### Prerequisites

- Node.js 18+
- Supabase account (free tier)
- Upstash Redis account (free tier)
- Render account (free tier)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd lightweight-crypto-payment-processor
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Test the API**
   ```bash
   curl http://localhost:3000/api/health
   ```

## Environment Variables

Copy `.env.example` to `.env` and configure the following:

```env
# Server Configuration
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:3000

# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Upstash Redis Configuration
UPSTASH_REDIS_REST_URL=your_upstash_redis_rest_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_rest_token

# Security Secrets
JWT_SECRET=your_jwt_secret_key_here
WEBHOOK_SECRET=your_webhook_secret_key_here

# External API Keys (Optional)
ANKR_API_KEY=your_ankr_api_key
BLOCKCYPHER_API_KEY=your_blockcypher_api_key
BLOCKSTREAM_API_KEY=your_blockstream_api_key
```

## API Documentation

### Health Check
```http
GET /api/health
GET /api/health/detailed
GET /api/health/resources
```

### Payments
```http
POST /api/payments
GET /api/payments
GET /api/payments/:id
PATCH /api/payments/:id/cancel
```

### Webhooks
```http
POST /api/webhooks/payment
POST /api/webhooks/confirmation
GET /api/webhooks/health
```

## Database Schema

### Payments Table
```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  amount DECIMAL(36,18) NOT NULL,
  currency VARCHAR(10) NOT NULL,
  order_id VARCHAR(255) NOT NULL,
  description TEXT,
  address VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  tx_hash VARCHAR(255),
  confirmations INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ,
  actual_amount DECIMAL(36,18),
  callback_url TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Merchants Table
```sql
CREATE TABLE merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  api_key VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Deployment

### Render Deployment

1. **Connect your repository** to Render
2. **Configure environment variables** in Render dashboard
3. **Deploy** using the provided `render.yaml`

### Manual Deployment

```bash
# Build Docker image
docker build -t crypto-payment-processor .

# Run container
docker run -p 3000:3000 --env-file .env crypto-payment-processor
```

## Keep-Alive Strategy

The application includes multiple keep-alive mechanisms for 24/7 availability:

1. **Cron-job.org**: 14-minute interval pings (primary)
2. **UptimeRobot**: 5-minute backup monitoring
3. **Self-ping**: 10-minute internal checks
4. **Render Health Checks**: Built-in monitoring

### Setting Up External Monitoring

Run the monitoring setup script to get detailed configuration instructions:

```bash
node setup-monitoring.js
```

This will guide you through:
- Cron-job.org configuration
- UptimeRobot setup
- Additional monitoring endpoints
- Testing your configuration

### Monitoring Endpoints

- `GET /api/health` - Basic health check
- `GET /api/health/detailed` - Detailed service status
- `GET /api/health/monitor` - Payment monitor status
- `GET /api/health/keepalive` - Keep-alive service status
- `GET /api/health/usage` - Resource usage with alerts
- `GET /api/health/services` - All services overview
- `GET /api/health/stats` - Payment statistics
- `GET /api/health/logs` - Recent webhook logs
- `GET /api/health/websocket` - WebSocket service status
- `GET /api/health/websocket/clients` - Connected WebSocket clients
- `GET /api/health/websocket/test` - WebSocket test interface

### WebSocket Real-time Updates

The system supports real-time WebSocket connections for live payment updates:

**Connection:**
```javascript
const ws = new WebSocket('ws://localhost:3000');
```

**Subscribe to Payment Updates:**
```javascript
ws.send(JSON.stringify({
  type: 'subscribe',
  channel: 'payment:payment-id',
  paymentId: 'your-payment-id'
}));
```

**Subscribe to Merchant Updates:**
```javascript
ws.send(JSON.stringify({
  type: 'subscribe',
  channel: 'merchant:merchant-id',
  merchantId: 'your-merchant-id'
}));
```

**Available Channels:**
- `payment:{paymentId}` - Specific payment updates
- `merchant:{merchantId}` - All merchant payment updates
- `broadcast` - Global announcements

## Security Features

- API key authentication for merchants
- Row Level Security (RLS) on database
- Webhook signature verification
- Input validation and rate limiting
- CORS policies
- TLS encryption
- HMAC signature validation

## Monitoring

### Health Endpoints
- `/api/health` - Basic health check
- `/api/health/detailed` - Detailed service status
- `/api/health/resources` - Resource usage metrics

### Resource Limits
- **Supabase**: 500MB database, 50MB file storage
- **Upstash Redis**: 256MB data, 500K commands/month
- **Render**: 512MB RAM, 0.1 vCPU, 750 hours/month

## Development

### Project Structure
```
├── src/
│   ├── config/          # Configuration files
│   ├── middleware/      # Express middleware
│   ├── routes/         # API routes
│   ├── services/       # Business logic
│   ├── utils/          # Utility functions
│   └── server.js       # Application entry point
├── Dockerfile          # Docker configuration
├── render.yaml         # Render deployment config
└── package.json        # Dependencies and scripts
```

### Available Scripts
```bash
npm start          # Start production server
npm run dev        # Start development server with nodemon
npm test           # Run tests
npm run build      # Build Docker image
```

## API Examples

### Create Payment
```bash
curl -X POST http://localhost:3000/api/payments \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{
    "amount": 0.001,
    "currency": "BTC",
    "order_id": "order_123",
    "description": "Payment for order #123",
    "expires_in": 3600
  }'
```

### Get Payments
```bash
curl http://localhost:3000/api/payments \
  -H "x-api-key: your-api-key"
```

### Webhook Example
```bash
curl -X POST http://localhost:3000/api/webhooks/payment \
  -H "Content-Type: application/json" \
  -H "x-webhook-signature: hmac_signature" \
  -d '{
    "payment_id": "uuid",
    "status": "paid",
    "tx_hash": "transaction_hash",
    "amount": 0.001,
    "confirmations": 1
  }'
```

## Support

For issues and questions:
- Check the [health endpoint](#health-check) first
- Review [logs in Render dashboard](https://dashboard.render.com)
- Monitor resource usage in Supabase and Upstash dashboards

## License

MIT License - see LICENSE file for details.

## Roadmap

- [x] Phase 1: Foundation (Express.js API, Supabase, Redis, Render deployment)
- [x] Phase 2: Core Payments (HD wallets, blockchain APIs, payment monitoring)
- [x] Phase 3: Keep-Alive & Monitoring (multi-layer monitoring, resource tracking)
- [x] Phase 4: Advanced Features (WebSocket real-time updates, enhanced monitoring)
- [ ] Phase 5: Security hardening
- [ ] Phase 6: Testing and launch

---

Built with ❤️ for the crypto community. Zero fees, maximum freedom.
