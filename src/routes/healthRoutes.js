const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { Redis } = require('@upstash/redis');
const { SUPABASE_URL, SUPABASE_ANON_KEY, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = require('../config/environment');
const paymentMonitorService = require('../services/paymentMonitorService');
const keepAliveService = require('../services/keepAliveService');

const router = express.Router();

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Initialize Redis client
const redis = new Redis({
  url: UPSTASH_REDIS_REST_URL,
  token: UPSTASH_REDIS_REST_TOKEN,
});

// Health check endpoint
router.get('/', async (req, res) => {
  const healthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {}
  };

  try {
    // Check Supabase connection
    const { data, error } = await supabase.from('health_check').select('id').limit(1);
    healthCheck.services.supabase = {
      status: error ? 'unhealthy' : 'healthy',
      error: error?.message
    };
  } catch (error) {
    healthCheck.services.supabase = {
      status: 'unhealthy',
      error: error.message
    };
  }

  try {
    // Check Redis connection
    await redis.ping();
    healthCheck.services.redis = { status: 'healthy' };
  } catch (error) {
    healthCheck.services.redis = {
      status: 'unhealthy',
      error: error.message
    };
  }

  // Check external API endpoints
  healthCheck.services.external_apis = await checkExternalApis();

  // Determine overall health
  const allServicesHealthy = Object.values(healthCheck.services).every(
    service => service.status === 'healthy'
  );

  healthCheck.status = allServicesHealthy ? 'healthy' : 'degraded';

  const statusCode = allServicesHealthy ? 200 : 503;
  res.status(statusCode).json(healthCheck);
});

// Detailed health check with resource usage
router.get('/detailed', async (req, res) => {
  const detailedHealth = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    services: {}
  };

  try {
    // Check Supabase with more detailed info
    const start = Date.now();
    const { data, error } = await supabase.from('health_check').select('*').limit(1);
    const latency = Date.now() - start;

    detailedHealth.services.supabase = {
      status: error ? 'unhealthy' : 'healthy',
      latency: `${latency}ms`,
      error: error?.message
    };
  } catch (error) {
    detailedHealth.services.supabase = {
      status: 'unhealthy',
      error: error.message
    };
  }

  try {
    // Check Redis with latency
    const start = Date.now();
    await redis.ping();
    const latency = Date.now() - start;

    detailedHealth.services.redis = {
      status: 'healthy',
      latency: `${latency}ms`
    };
  } catch (error) {
    detailedHealth.services.redis = {
      status: 'unhealthy',
      error: error.message
    };
  }

  detailedHealth.services.external_apis = await checkExternalApis();

  res.json(detailedHealth);
});

// Resource usage endpoint
router.get('/resources', (req, res) => {
  const resourceUsage = {
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    platform: process.platform,
    node_version: process.version,
    uptime: process.uptime()
  };

  res.json(resourceUsage);
});

async function checkExternalApis() {
  const apis = {
    blockstream: 'https://blockstream.info/api/blocks/tip/hash',
    ankr: 'https://rpc.ankr.com/eth',
    blockcypher: 'https://api.blockcypher.com/v1/btc/main'
  };

  const results = {};

  for (const [name, url] of Object.entries(apis)) {
    try {
      const start = Date.now();
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      const latency = Date.now() - start;

      results[name] = {
        status: response.ok ? 'healthy' : 'unhealthy',
        latency: `${latency}ms`,
        status_code: response.status
      };
    } catch (error) {
      results[name] = {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  return results;
}

// Payment monitor status
router.get('/monitor', async (req, res) => {
  try {
    const stats = await paymentMonitorService.getStats();
    const isRunning = paymentMonitorService.isRunning;

    res.json({
      status: isRunning ? 'running' : 'stopped',
      check_interval: paymentMonitorService.checkInterval,
      last_check: new Date().toISOString(),
      statistics: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting monitor status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get monitor status'
    });
  }
});

// Force check specific payment
router.post('/monitor/check/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;

    const result = await paymentMonitorService.forceCheckPayment(paymentId);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error force checking payment:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get payment statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await paymentMonitorService.getStats();

    if (!stats) {
      return res.status(500).json({
        success: false,
        error: 'Failed to get statistics'
      });
    }

    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get statistics'
    });
  }
});

// Get recent webhook logs
router.get('/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;

    const { data: logs, error } = await supabase
      .from('webhook_logs')
      .select('*')
      .order('processed_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching logs:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch logs'
      });
    }

    res.json({
      success: true,
      data: logs,
      count: logs.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get logs'
    });
  }
});

// Clean up expired payments manually
router.post('/cleanup', async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('cleanup_expired_payments');

    if (error) {
      console.error('Error cleaning up payments:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to cleanup payments'
      });
    }

    res.json({
      success: true,
      message: `Cleaned up ${data} expired payments`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in cleanup endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup payments'
    });
  }
});

// Keep-alive service status
router.get('/keepalive', async (req, res) => {
  try {
    const status = keepAliveService.getStatus();
    const stats = await keepAliveService.getStats();

    res.json({
      success: true,
      data: {
        status,
        statistics: stats,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error getting keep-alive status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get keep-alive status'
    });
  }
});

// Force keep-alive check
router.post('/keepalive/check', async (req, res) => {
  try {
    const source = req.body.source || 'manual';
    const result = await keepAliveService.forceCheck(source);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error force checking keep-alive:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get keep-alive logs
router.get('/keepalive/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;

    const { data: logs, error } = await supabase
      .from('health_check')
      .select('*')
      .eq('service_name', 'keep-alive')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching keep-alive logs:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch keep-alive logs'
      });
    }

    res.json({
      success: true,
      data: logs,
      count: logs.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting keep-alive logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get keep-alive logs'
    });
  }
});

// Resource usage monitoring with thresholds
router.get('/usage', async (req, res) => {
  try {
    const currentUsage = {
      timestamp: new Date().toISOString(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      uptime: process.uptime(),
      platform: process.platform,
      node_version: process.version
    };

    // Calculate usage percentages
    const totalMemory = process.memoryUsage().heapTotal;
    const usedMemory = process.memoryUsage().heapUsed;
    const memoryUsagePercent = (usedMemory / totalMemory * 100).toFixed(2);

    // Free tier thresholds (approximate)
    const thresholds = {
      memory: {
        warning: 400 * 1024 * 1024, // 400MB warning
        critical: 450 * 1024 * 1024, // 450MB critical (Render free tier ~512MB)
        current: usedMemory,
        percentage: parseFloat(memoryUsagePercent)
      },
      uptime: {
        current: process.uptime(),
        max: 750 * 3600, // 750 hours (Render free tier)
        remaining: 750 * 3600 - process.uptime()
      }
    };

    // Determine status
    let status = 'healthy';
    if (thresholds.memory.current > thresholds.memory.critical) {
      status = 'critical';
    } else if (thresholds.memory.current > thresholds.memory.warning) {
      status = 'warning';
    }

    res.json({
      success: true,
      data: {
        current: currentUsage,
        thresholds,
        status,
        alerts: status !== 'healthy' ? [{
          type: status,
          message: status === 'warning' ?
            'Memory usage is high. Consider optimizing or upgrading.' :
            'Memory usage is critical! Risk of service interruption.',
          timestamp: new Date().toISOString()
        }] : []
      }
    });
  } catch (error) {
    console.error('Error getting usage stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get usage statistics'
    });
  }
});

// Service status overview
router.get('/services', async (req, res) => {
  try {
    const services = {
      payment_monitor: {
        status: paymentMonitorService.isRunning ? 'running' : 'stopped',
        last_check: new Date().toISOString()
      },
      keep_alive: {
        status: keepAliveService.isRunning ? 'running' : 'stopped',
        check_interval: keepAliveService.checkInterval,
        last_check: new Date().toISOString()
      },
      database: {
        status: 'unknown',
        last_check: new Date().toISOString()
      },
      redis: {
        status: 'unknown',
        last_check: new Date().toISOString()
      }
    };

    // Check database
    try {
      const { error } = await supabase.from('health_check').select('id').limit(1);
      services.database.status = error ? 'error' : 'healthy';
    } catch (error) {
      services.database.status = 'error';
    }

    // Check Redis
    try {
      await redis.ping();
      services.redis.status = 'healthy';
    } catch (error) {
      services.redis.status = 'error';
    }

    // Overall status
    const allHealthy = Object.values(services).every(service => service.status === 'healthy' || service.status === 'running');
    const hasErrors = Object.values(services).some(service => service.status === 'error');

    res.json({
      success: true,
      data: {
        services,
        overall: {
          status: hasErrors ? 'error' : allHealthy ? 'healthy' : 'degraded',
          timestamp: new Date().toISOString()
        }
      }
    });
  } catch (error) {
    console.error('Error getting service status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get service status'
    });
  }
});

module.exports = router;
