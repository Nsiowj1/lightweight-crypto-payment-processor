const jwt = require('jsonwebtoken');
const { SUPABASE_SERVICE_ROLE_KEY } = require('../config/environment');

// Middleware to verify API key authentication
const verifyApiKey = async (req, res, next) => {
  try {
    // Check for API key in Authorization header (Bearer token)
    let apiKey = req.headers.authorization;

    if (apiKey && apiKey.startsWith('Bearer ')) {
      apiKey = apiKey.substring(7); // Remove 'Bearer ' prefix
    } else {
      // Fallback to x-api-key header
      apiKey = req.headers['x-api-key'];
    }

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'API key is required'
      });
    }

    // In a real implementation, you would verify the API key against your database
    // For now, we'll use a simple JWT-based approach
    const decoded = jwt.verify(apiKey, process.env.JWT_SECRET);

    req.merchant = {
      id: decoded.merchantId,
      email: decoded.email
    };

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Invalid API key'
    });
  }
};

// Middleware to verify webhook signature
const verifyWebhookSignature = (req, res, next) => {
  try {
    const signature = req.headers['x-webhook-signature'];
    const payload = JSON.stringify(req.body);

    if (!signature) {
      return res.status(401).json({
        success: false,
        error: 'Webhook signature is required'
      });
    }

    // Verify HMAC signature
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', process.env.WEBHOOK_SECRET)
      .update(payload)
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return res.status(401).json({
        success: false,
        error: 'Invalid webhook signature'
      });
    }

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Webhook signature verification failed'
    });
  }
};

// Middleware to check rate limits (using Redis)
const rateLimitMiddleware = async (req, res, next) => {
  try {
    const { Redis } = require('@upstash/redis');
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    const key = `rate_limit:${req.ip}:${Date.now() / 60000}`; // 1 minute windows
    const current = await redis.incr(key);

    if (current === 1) {
      await redis.expire(key, 60); // Expire in 60 seconds
    }

    if (current > 100) { // 100 requests per minute
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded'
      });
    }

    next();
  } catch (error) {
    // If Redis fails, continue without rate limiting
    console.warn('Rate limiting failed:', error.message);
    next();
  }
};

module.exports = {
  verifyApiKey,
  verifyWebhookSignature,
  rateLimitMiddleware
};
