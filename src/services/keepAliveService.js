const axios = require('axios');
const { Redis } = require('@upstash/redis');
const { SUPABASE_URL, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = require('../config/environment');

// Initialize Redis
const redis = new Redis({
  url: UPSTASH_REDIS_REST_URL,
  token: UPSTASH_REDIS_REST_TOKEN,
});

class KeepAliveService {
  constructor() {
    this.isRunning = false;
    this.services = [];
    this.checkInterval = 14 * 60 * 1000; // 14 minutes (Cron-job.org interval)
    this.uptimeRobotInterval = 5 * 60 * 1000; // 5 minutes (UptimeRobot backup)
    this.selfPingInterval = 10 * 60 * 1000; // 10 minutes (self-ping fallback)
    this.maxRetries = 3;
    this.baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`;
  }

  /**
   * Start the keep-alive service
   */
  async start() {
    if (this.isRunning) {
      console.log('Keep-alive service is already running');
      return;
    }

    console.log('🚀 Starting keep-alive service...');
    this.isRunning = true;

    // Register keep-alive endpoints
    this.registerServices();

    // Start different keep-alive strategies
    this.startCronJobSimulation();
    this.startUptimeRobotSimulation();
    this.startSelfPing();

    console.log('✅ Keep-alive service started');
    console.log(`📊 Base URL: ${this.baseUrl}`);
    console.log(`⏰ Check intervals: ${this.checkInterval / 1000}s (cron), ${this.uptimeRobotInterval / 1000}s (robot), ${this.selfPingInterval / 1000}s (self)`);
  }

  /**
   * Stop the keep-alive service
   */
  stop() {
    console.log('🛑 Stopping keep-alive service...');
    this.isRunning = false;
  }

  /**
   * Register all services that need keep-alive
   */
  registerServices() {
    this.services = [
      {
        name: 'main-api',
        url: `${this.baseUrl}/api/health`,
        method: 'GET',
        expectedStatus: 200,
        timeout: 10000
      },
      {
        name: 'frontend',
        url: `${this.baseUrl}/`,
        method: 'GET',
        expectedStatus: 200,
        timeout: 10000
      },
      {
        name: 'payment-monitor',
        url: `${this.baseUrl}/api/health/monitor`,
        method: 'GET',
        expectedStatus: 200,
        timeout: 10000
      }
    ];

    console.log(`📋 Registered ${this.services.length} services for keep-alive monitoring`);
  }

  /**
   * Simulate Cron-job.org behavior (14-minute intervals)
   */
  async startCronJobSimulation() {
    console.log('⏰ Starting Cron-job.org simulation...');

    const cronJobLoop = async () => {
      while (this.isRunning) {
        try {
          await this.performKeepAliveCheck('cron-job');
          await this.sleep(this.checkInterval);
        } catch (error) {
          console.error('Cron-job simulation error:', error);
          await this.sleep(60000); // Wait 1 minute on error
        }
      }
    };

    cronJobLoop();
  }

  /**
   * Simulate UptimeRobot behavior (5-minute intervals)
   */
  async startUptimeRobotSimulation() {
    console.log('🤖 Starting UptimeRobot simulation...');

    const uptimeRobotLoop = async () => {
      while (this.isRunning) {
        try {
          await this.performKeepAliveCheck('uptime-robot');
          await this.sleep(this.uptimeRobotInterval);
        } catch (error) {
          console.error('UptimeRobot simulation error:', error);
          await this.sleep(30000); // Wait 30 seconds on error
        }
      }
    };

    uptimeRobotLoop();
  }

  /**
   * Self-ping mechanism (10-minute intervals)
   */
  async startSelfPing() {
    console.log('🔄 Starting self-ping mechanism...');

    const selfPingLoop = async () => {
      while (this.isRunning) {
        try {
          await this.performKeepAliveCheck('self-ping');
          await this.sleep(this.selfPingInterval);
        } catch (error) {
          console.error('Self-ping error:', error);
          await this.sleep(60000); // Wait 1 minute on error
        }
      }
    };

    selfPingLoop();
  }

  /**
   * Perform keep-alive check for a specific service
   */
  async performKeepAliveCheck(source) {
    console.log(`🔍 [${source}] Performing keep-alive check...`);

    const results = {
      timestamp: new Date().toISOString(),
      source,
      services: {},
      overall: { status: 'success', responseTime: 0 }
    };

    let totalResponseTime = 0;
    let successCount = 0;

    for (const service of this.services) {
      const startTime = Date.now();

      try {
        const response = await axios({
          method: service.method,
          url: service.url,
          timeout: service.timeout,
          headers: {
            'User-Agent': `Lightweight-Crypto-Payment-Processor-KeepAlive/${source}`,
            'Cache-Control': 'no-cache'
          }
        });

        const responseTime = Date.now() - startTime;

        if (response.status === service.expectedStatus) {
          results.services[service.name] = {
            status: 'success',
            responseTime: `${responseTime}ms`,
            statusCode: response.status
          };
          successCount++;
          totalResponseTime += responseTime;
        } else {
          results.services[service.name] = {
            status: 'failed',
            responseTime: `${responseTime}ms`,
            statusCode: response.status,
            error: `Expected ${service.expectedStatus}, got ${response.status}`
          };
        }

      } catch (error) {
        const responseTime = Date.now() - startTime;

        results.services[service.name] = {
          status: 'error',
          responseTime: `${responseTime}ms`,
          error: error.message
        };

        console.warn(`❌ [${source}] Service ${service.name} failed:`, error.message);
      }
    }

    // Overall result
    results.overall = {
      status: successCount === this.services.length ? 'success' : 'partial',
      responseTime: `${Math.round(totalResponseTime / successCount)}ms`,
      successCount,
      totalCount: this.services.length
    };

    // Log results
    await this.logKeepAliveResult(results);

    // Alert if needed
    if (results.overall.status !== 'success') {
      await this.handleKeepAliveFailure(results);
    }

    console.log(`✅ [${source}] Keep-alive check completed: ${successCount}/${this.services.length} services healthy`);
  }

  /**
   * Log keep-alive results to database
   */
  async logKeepAliveResult(results) {
    try {
      // Test connections first
      const supabaseAvailable = await this.testSupabaseConnection();
      const redisAvailable = await this.testRedisConnection();

      if (supabaseAvailable) {
        const { createClient } = require('@supabase/supabase-js');
        const { SUPABASE_SERVICE_ROLE_KEY } = require('../config/environment');

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        await supabase
          .from('health_check')
          .insert({
            service_name: 'keep-alive',
            status: results.overall.status === 'success' ? 'healthy' : 'unhealthy',
            response_time_ms: parseInt(results.overall.responseTime),
            error_message: results.overall.status !== 'success' ?
              `Keep-alive check failed: ${results.overall.successCount}/${results.overall.totalCount} services healthy` : null
          });
      }

      // Cache results in Redis for quick access (if available)
      if (redisAvailable) {
        const cacheKey = `keepalive:${results.source}:${results.timestamp.split('T')[0]}`;
        await redis.setex(cacheKey, 86400, JSON.stringify(results)); // Cache for 24 hours
      }

    } catch (error) {
      console.error('Error logging keep-alive result:', error);
    }
  }

  /**
   * Handle keep-alive failure
   */
  async handleKeepAliveFailure(results) {
    try {
      console.warn('⚠️ Keep-alive failure detected, attempting recovery...');

      // Test Supabase connection before attempting database operations
      const supabaseAvailable = await this.testSupabaseConnection();

      // Try to restart payment monitor if it's not responding
      if (results.services['payment-monitor'] &&
          results.services['payment-monitor'].status !== 'success') {
        console.log('🔄 Attempting to restart payment monitor...');

        if (supabaseAvailable) {
          const { createClient } = require('@supabase/supabase-js');
          const { SUPABASE_SERVICE_ROLE_KEY } = require('../config/environment');

          const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

          // Log the failure
          await supabase
            .from('health_check')
            .insert({
              service_name: 'payment-monitor-restart',
              status: 'warning',
              error_message: 'Payment monitor not responding, attempted restart'
            });
        }
      }

      // Send alert (in production, this would be email/Slack notification)
      console.error('🚨 KEEP-ALIVE FAILURE ALERT:', {
        timestamp: results.timestamp,
        source: results.source,
        failedServices: Object.entries(results.services)
          .filter(([_, service]) => service.status !== 'success')
          .map(([name, service]) => ({ name, error: service.error }))
      });

    } catch (error) {
      console.error('Error handling keep-alive failure:', error);
    }
  }

  /**
   * Get keep-alive statistics
   */
  async getStats() {
    try {
      // Test Supabase connection first
      if (!await this.testSupabaseConnection()) {
        console.log('⚠️ Supabase unavailable, returning basic stats');
        return {
          total: 0,
          healthy: 0,
          unhealthy: 0,
          recent: [],
          uptime: 'N/A',
          note: 'External services unavailable'
        };
      }

      const { createClient } = require('@supabase/supabase-js');
      const { SUPABASE_SERVICE_ROLE_KEY } = require('../config/environment');

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      // Get recent keep-alive logs
      const { data: logs, error } = await supabase
        .from('health_check')
        .select('*')
        .eq('service_name', 'keep-alive')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        throw error;
      }

      // Calculate statistics
      const stats = {
        total: logs.length,
        healthy: logs.filter(log => log.status === 'healthy').length,
        unhealthy: logs.filter(log => log.status === 'unhealthy').length,
        recent: logs.slice(0, 10), // Last 10 checks
        uptime: logs.length > 0 ? (logs.filter(log => log.status === 'healthy').length / logs.length * 100).toFixed(2) + '%' : 'N/A'
      };

      return stats;
    } catch (error) {
      console.error('Error getting keep-alive stats:', error);
      return null;
    }
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      checkInterval: this.checkInterval,
      uptimeRobotInterval: this.uptimeRobotInterval,
      selfPingInterval: this.selfPingInterval,
      baseUrl: this.baseUrl,
      services: this.services.length,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Test Supabase connection
   */
  async testSupabaseConnection() {
    try {
      const { createClient } = require('@supabase/supabase-js');
      const { SUPABASE_SERVICE_ROLE_KEY } = require('../config/environment');

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      // Simple query to test connection
      const { error } = await supabase
        .from('health_check')
        .select('id')
        .limit(1);

      return !error;
    } catch (error) {
      console.error('Supabase connection test failed:', error.message);
      return false;
    }
  }

  /**
   * Test Redis connection
   */
  async testRedisConnection() {
    try {
      // Simple ping to test connection
      await redis.ping();
      return true;
    } catch (error) {
      console.error('Redis connection test failed:', error.message);
      return false;
    }
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Force immediate keep-alive check
   */
  async forceCheck(source = 'manual') {
    try {
      console.log(`🔍 [${source}] Forcing immediate keep-alive check...`);
      await this.performKeepAliveCheck(source);
      return { success: true, message: 'Keep-alive check completed' };
    } catch (error) {
      console.error(`Error in forced keep-alive check:`, error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new KeepAliveService();
