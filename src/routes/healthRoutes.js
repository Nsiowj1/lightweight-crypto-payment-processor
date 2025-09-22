const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { Redis } = require('@upstash/redis');
const { SUPABASE_URL, SUPABASE_ANON_KEY, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = require('../config/environment');
const paymentMonitorService = require('../services/paymentMonitorService');
const keepAliveService = require('../services/keepAliveService');
const websocketService = require('../services/websocketService');

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
  const externalApiResults = await checkExternalApis();
  healthCheck.services.external_apis = externalApiResults;

  // Determine overall health - check all services including external APIs
  const supabaseStatus = healthCheck.services.supabase.status === 'healthy';
  const redisStatus = healthCheck.services.redis.status === 'healthy';
  const externalApisStatus = Object.values(externalApiResults).every(
    api => api.status === 'healthy'
  );

  const allServicesHealthy = supabaseStatus && redisStatus && externalApisStatus;
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

// WebSocket service status
router.get('/websocket', (req, res) => {
  try {
    const status = websocketService.getStatus();

    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting WebSocket status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get WebSocket status'
    });
  }
});

// Broadcast message to all WebSocket clients
router.post('/websocket/broadcast', (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    websocketService.broadcast({
      type: 'broadcast',
      message,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Broadcast sent to all WebSocket clients',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error broadcasting message:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to broadcast message'
    });
  }
});

// Get WebSocket client information
router.get('/websocket/clients', (req, res) => {
  try {
    const clients = Array.from(websocketService.clients.values()).map(client => ({
      id: client.id,
      connectedAt: client.connectedAt,
      subscriptions: Array.from(client.subscriptions),
      isAlive: client.isAlive
    }));

    res.json({
      success: true,
      data: {
        count: clients.length,
        clients,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error getting WebSocket clients:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get WebSocket clients'
    });
  }
});

// WebSocket connection test page
router.get('/websocket/test', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>WebSocket Test</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .container { max-width: 800px; margin: 0 auto; }
        #messages { border: 1px solid #ccc; height: 400px; overflow-y: scroll; padding: 10px; margin: 10px 0; }
        input, button { padding: 10px; margin: 5px; }
        button { background: #4f46e5; color: white; border: none; cursor: pointer; }
        button:hover { background: #3730a3; }
        .status { padding: 10px; margin: 10px 0; border-radius: 4px; }
        .connected { background: #d1fae5; color: #065f46; }
        .disconnected { background: #fee2e2; color: #991b1b; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🔗 WebSocket Test Page</h1>
        <div id="status" class="status disconnected">Disconnected</div>

        <div>
          <button onclick="connect()">Connect</button>
          <button onclick="disconnect()">Disconnect</button>
          <button onclick="subscribe()">Subscribe to Payments</button>
          <button onclick="unsubscribe()">Unsubscribe</button>
        </div>

        <div>
          <input type="text" id="messageInput" placeholder="Enter message to send" style="width: 300px;">
          <button onclick="sendMessage()">Send Message</button>
        </div>

        <div id="messages"></div>
      </div>

      <script>
        let ws = null;
        const messages = document.getElementById('messages');
        const status = document.getElementById('status');

        function connect() {
          if (ws && ws.readyState === WebSocket.OPEN) {
            alert('Already connected!');
            return;
          }

          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const wsUrl = protocol + '//' + window.location.host;

          ws = new WebSocket(wsUrl);

          ws.onopen = function(event) {
            status.textContent = 'Connected';
            status.className = 'status connected';
            addMessage('Connected to WebSocket server', 'system');
          };

          ws.onmessage = function(event) {
            const data = JSON.parse(event.data);
            addMessage(JSON.stringify(data, null, 2), 'received');
          };

          ws.onclose = function(event) {
            status.textContent = 'Disconnected';
            status.className = 'status disconnected';
            addMessage('Disconnected from WebSocket server', 'system');
          };

          ws.onerror = function(error) {
            addMessage('WebSocket error: ' + error, 'error');
          };
        }

        function disconnect() {
          if (ws) {
            ws.close();
          }
        }

        function subscribe() {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'subscribe',
              channel: 'payment:test',
              paymentId: 'test-payment-id'
            }));
          }
        }

        function unsubscribe() {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'unsubscribe',
              channel: 'payment:test'
            }));
          }
        }

        function sendMessage() {
          const input = document.getElementById('messageInput');
          if (ws && ws.readyState === WebSocket.OPEN && input.value) {
            ws.send(JSON.stringify({
              type: 'ping',
              message: input.value
            }));
            addMessage('Sent: ' + input.value, 'sent');
            input.value = '';
          }
        }

        function addMessage(message, type) {
          const div = document.createElement('div');
          div.style.margin = '5px 0';
          div.style.padding = '5px';
          div.style.borderRadius = '3px';

          switch (type) {
            case 'sent':
              div.style.background = '#e0e7ff';
              div.style.textAlign = 'right';
              break;
            case 'received':
              div.style.background = '#f3f4f6';
              break;
            case 'system':
              div.style.background = '#fef3c7';
              div.style.fontStyle = 'italic';
              break;
            case 'error':
              div.style.background = '#fee2e2';
              div.style.color = '#dc2626';
              break;
          }

          div.innerHTML = '<small>[' + new Date().toLocaleTimeString() + ']</small> ' + message;
          messages.appendChild(div);
          messages.scrollTop = messages.scrollHeight;
        }

        // Auto-connect on page load
        window.onload = function() {
          connect();
        };
      </script>
    </body>
    </html>
  `);
});

module.exports = router;
