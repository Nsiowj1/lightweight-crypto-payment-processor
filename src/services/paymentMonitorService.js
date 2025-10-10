const { createClient } = require('@supabase/supabase-js');
const { Redis } = require('@upstash/redis');
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = require('../config/environment');
const blockchainService = require('./blockchainService');

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Initialize Redis
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

class PaymentMonitorService {
  constructor() {
    this.isRunning = false;
    this.checkInterval = 30 * 1000; // 30 seconds
    this.maxRetries = 3;
  }

  /**
   * Start the payment monitoring service
   */
  async start() {
    if (this.isRunning) {
      console.log('Payment monitor is already running');
      return;
    }

    console.log('🚀 Starting payment monitor service...');
    this.isRunning = true;

    // Start the monitoring loop
    this.monitorLoop();

    console.log('✅ Payment monitor service started');
  }

  /**
   * Stop the payment monitoring service
   */
  stop() {
    console.log('🛑 Stopping payment monitor service...');
    this.isRunning = false;
  }

  /**
   * Main monitoring loop
   */
  async monitorLoop() {
    while (this.isRunning) {
      try {
        await this.checkPendingPayments();
        await this.cleanupExpiredPayments();
      } catch (error) {
        console.error('Payment monitor error:', error);
      }

      // Wait before next check
      await this.sleep(this.checkInterval);
    }
  }

  /**
   * Check all pending payments
   */
  async checkPendingPayments() {
    try {
      console.log('🔍 Checking pending payments...');

      // Test Supabase connection first
      if (!await this.testSupabaseConnection()) {
        console.log('⚠️ Supabase unavailable, skipping payment checks');
        return;
      }

      // Get all pending payments that haven't expired
      const { data: payments, error } = await supabase
        .from('payments')
        .select('*')
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true })
        .limit(50); // Process in batches

      if (error) {
        console.error('Error fetching pending payments:', error);
        return;
      }

      if (!payments || payments.length === 0) {
        console.log('📭 No pending payments to check');
        return;
      }

      console.log(`📋 Found ${payments.length} pending payments to check`);

      // Process payments concurrently (max 10 at a time)
      const batchSize = 10;
      for (let i = 0; i < payments.length; i += batchSize) {
        const batch = payments.slice(i, i + batchSize);
        await Promise.all(batch.map(payment => this.checkSinglePayment(payment)));
      }

    } catch (error) {
      console.error('Error in checkPendingPayments:', error);
    }
  }

  /**
   * Check a single payment
   */
  async checkSinglePayment(payment) {
    try {
      const cacheKey = `payment_check:${payment.id}`;
      const lastCheck = await redis.get(cacheKey);

      // Skip if checked recently (within last 30 seconds)
      if (lastCheck && (Date.now() - parseInt(lastCheck)) < 30000) {
        return;
      }

      console.log(`🔎 Checking payment ${payment.id} (${payment.currency} ${payment.amount})`);

      // Check payment status on blockchain
      const statusResult = await blockchainService.checkPaymentStatus(
        payment.currency,
        payment.address,
        payment.amount
      );

      // Update cache
      await redis.setex(cacheKey, 60, Date.now().toString());

      // If status changed, update database
      if (statusResult.status !== 'pending' && statusResult.status !== payment.status) {
        await this.updatePaymentStatus(payment, statusResult);
      }

    } catch (error) {
      console.error(`Error checking payment ${payment.id}:`, error);
    }
  }

  /**
   * Update payment status in database
   */
  async updatePaymentStatus(payment, statusResult) {
    try {
      console.log(`📝 Updating payment ${payment.id} status: ${payment.status} -> ${statusResult.status}`);

      const updateData = {
        status: statusResult.status,
        confirmations: statusResult.confirmations || 0,
        tx_hash: statusResult.tx_hash,
        actual_amount: statusResult.balance,
        updated_at: new Date().toISOString()
      };

      // If payment is marked as paid, add paid_at timestamp
      if (statusResult.status === 'paid') {
        updateData.paid_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('payments')
        .update(updateData)
        .eq('id', payment.id);

      if (error) {
        console.error(`Failed to update payment ${payment.id}:`, error);
        return;
      }

      // Log the status change
      await this.logPaymentEvent(payment.id, 'status_change', {
        old_status: payment.status,
        new_status: statusResult.status,
        confirmations: statusResult.confirmations,
        tx_hash: statusResult.tx_hash
      });

      // Trigger callback if payment is now paid
      if (statusResult.status === 'paid' && payment.callback_url) {
        await this.triggerPaymentCallback(payment, statusResult);
      }

      console.log(`✅ Payment ${payment.id} status updated to ${statusResult.status}`);

    } catch (error) {
      console.error(`Error updating payment ${payment.id}:`, error);
    }
  }

  /**
   * Trigger payment callback
   */
  async triggerPaymentCallback(payment, statusResult) {
    try {
      console.log(`📞 Triggering callback for payment ${payment.id}`);

      const callbackData = {
        payment_id: payment.id,
        order_id: payment.order_id,
        amount: statusResult.balance || payment.amount,
        currency: payment.currency,
        status: statusResult.status,
        tx_hash: statusResult.tx_hash,
        address: payment.address,
        confirmations: statusResult.confirmations || 0,
        paid_at: new Date().toISOString()
      };

      const response = await fetch(payment.callback_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Lightweight-Crypto-Payment-Processor/1.0'
        },
        body: JSON.stringify(callbackData)
      });

      if (response.ok) {
        console.log(`✅ Callback successful for payment ${payment.id}`);
      } else {
        console.error(`❌ Callback failed for payment ${payment.id}: ${response.status}`);
      }

    } catch (error) {
      console.error(`❌ Callback error for payment ${payment.id}:`, error);
    }
  }

  /**
   * Clean up expired payments
   */
  async cleanupExpiredPayments() {
    try {
      const expiredCount = await supabase.rpc('cleanup_expired_payments');

      if (expiredCount > 0) {
        console.log(`🧹 Cleaned up ${expiredCount} expired payments`);
      }
    } catch (error) {
      console.error('Error cleaning up expired payments:', error);
    }
  }

  /**
   * Log payment event for debugging
   */
  async logPaymentEvent(paymentId, eventType, data) {
    try {
      await supabase
        .from('webhook_logs')
        .insert({
          payment_id: paymentId,
          event_type: eventType,
          payload: data,
          success: true,
          processing_time_ms: 0
        });
    } catch (error) {
      console.error('Error logging payment event:', error);
    }
  }

  /**
   * Get monitoring statistics
   */
  async getStats() {
    try {
      const { data: stats, error } = await supabase
        .from('payments')
        .select('status, currency')
        .in('status', ['pending', 'paid', 'expired', 'cancelled']);

      if (error) {
        throw error;
      }

      const summary = {
        total: stats.length,
        pending: stats.filter(p => p.status === 'pending').length,
        paid: stats.filter(p => p.status === 'paid').length,
        expired: stats.filter(p => p.status === 'expired').length,
        cancelled: stats.filter(p => p.status === 'cancelled').length,
        by_currency: {}
      };

      // Group by currency
      stats.forEach(payment => {
        if (!summary.by_currency[payment.currency]) {
          summary.by_currency[payment.currency] = {
            total: 0,
            pending: 0,
            paid: 0,
            expired: 0,
            cancelled: 0
          };
        }

        summary.by_currency[payment.currency].total++;
        summary.by_currency[payment.currency][payment.status]++;
      });

      return summary;
    } catch (error) {
      console.error('Error getting monitoring stats:', error);
      return null;
    }
  }

  /**
   * Test Supabase connection
   */
  async testSupabaseConnection() {
    try {
      // Simple query to test connection
      const { error } = await supabase
        .from('payments')
        .select('id')
        .limit(1);

      return !error;
    } catch (error) {
      console.error('Supabase connection test failed:', error.message);
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
   * Force check a specific payment
   */
  async forceCheckPayment(paymentId) {
    try {
      const { data: payment, error } = await supabase
        .from('payments')
        .select('*')
        .eq('id', paymentId)
        .single();

      if (error) {
        throw error;
      }

      if (payment.status !== 'pending') {
        return { message: `Payment ${paymentId} is not pending (status: ${payment.status})` };
      }

      const statusResult = await blockchainService.checkPaymentStatus(
        payment.currency,
        payment.address,
        payment.amount
      );

      if (statusResult.status !== 'pending') {
        await this.updatePaymentStatus(payment, statusResult);
      }

      return {
        message: `Payment ${paymentId} checked`,
        status: statusResult.status,
        balance: statusResult.balance
      };

    } catch (error) {
      console.error(`Error force checking payment ${paymentId}:`, error);
      throw error;
    }
  }
}

module.exports = new PaymentMonitorService();
