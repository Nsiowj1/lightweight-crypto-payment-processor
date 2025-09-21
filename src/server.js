const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import configuration
const { PORT, NODE_ENV } = require('./config/environment');

// Import middleware
const { errorHandler, notFound } = require('./middleware/errorMiddleware');
const authMiddleware = require('./middleware/authMiddleware');

// Import routes
const healthRoutes = require('./routes/healthRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const webhookRoutes = require('./routes/webhookRoutes');

// Import services
const paymentMonitorService = require('./services/paymentMonitorService');
const keepAliveService = require('./services/keepAliveService');

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static('public'));

// Health check endpoint (no auth required)
app.use('/api/health', healthRoutes);

// API routes with authentication
app.use('/api/payments', authMiddleware, paymentRoutes);
app.use('/api/webhooks', webhookRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Lightweight Crypto Payment Processor API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware (must be last)
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${NODE_ENV}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
  console.log(`💰 Frontend: http://localhost:${PORT}`);

  // Start payment monitoring service
  try {
    await paymentMonitorService.start();
    console.log(`✅ Payment monitoring service started`);
  } catch (error) {
    console.error(`❌ Failed to start payment monitoring service:`, error);
  }

  // Start keep-alive service
  try {
    await keepAliveService.start();
    console.log(`✅ Keep-alive service started`);
  } catch (error) {
    console.error(`❌ Failed to start keep-alive service:`, error);
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  paymentMonitorService.stop();
  keepAliveService.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  paymentMonitorService.stop();
  keepAliveService.stop();
  process.exit(0);
});

module.exports = app;
