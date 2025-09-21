const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = require('../config/environment');
const { verifyWebhookSignature } = require('../middleware/authMiddleware');

const router = express.Router();

// Initialize Supabase client with service role key for admin operations
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Webhook endpoint for payment status updates
router.post('/payment', verifyWebhookSignature, async (req, res) => {
  try {
    const { payment_id, status, tx_hash, amount, confirmations } = req.body;

    if (!payment_id || !status) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: payment_id, status'
      });
    }

    // Validate status
    const validStatuses = ['paid', 'expired', 'cancelled', 'failed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
      });
    }

    // Get payment record
    const { data: payment, error: fetchError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', payment_id)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Payment not found'
        });
      }
      console.error('Database error:', fetchError);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch payment'
      });
    }

    // Check if status is already final
    if (['paid', 'expired', 'cancelled', 'failed'].includes(payment.status)) {
      return res.status(400).json({
        success: false,
        error: `Payment already has final status: ${payment.status}`
      });
    }

    // Update payment status
    const updateData = {
      status,
      tx_hash: tx_hash || payment.tx_hash,
      confirmations: confirmations || payment.confirmations,
      updated_at: new Date().toISOString()
    };

    // If payment is marked as paid, add paid_at timestamp
    if (status === 'paid') {
      updateData.paid_at = new Date().toISOString();
      updateData.actual_amount = amount || payment.amount;
    }

    const { data: updatedPayment, error: updateError } = await supabase
      .from('payments')
      .update(updateData)
      .eq('id', payment_id)
      .select()
      .single();

    if (updateError) {
      console.error('Database error:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Failed to update payment'
      });
    }

    // Trigger callback if provided
    if (payment.callback_url && status === 'paid') {
      try {
        await triggerCallback(payment.callback_url, {
          payment_id,
          status,
          amount: updatedPayment.amount,
          currency: updatedPayment.currency,
          tx_hash: updatedPayment.tx_hash,
          order_id: updatedPayment.order_id
        });
      } catch (callbackError) {
        console.error('Callback failed:', callbackError);
        // Don't fail the webhook if callback fails
      }
    }

    res.json({
      success: true,
      data: {
        payment_id,
        status,
        previous_status: payment.status
      }
    });

  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Webhook endpoint for blockchain confirmations
router.post('/confirmation', verifyWebhookSignature, async (req, res) => {
  try {
    const { payment_id, confirmations, tx_hash } = req.body;

    if (!payment_id || !confirmations) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: payment_id, confirmations'
      });
    }

    // Get payment record
    const { data: payment, error: fetchError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', payment_id)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Payment not found'
        });
      }
      console.error('Database error:', fetchError);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch payment'
      });
    }

    // Only update if we have more confirmations
    if (confirmations > (payment.confirmations || 0)) {
      const { data: updatedPayment, error: updateError } = await supabase
        .from('payments')
        .update({
          confirmations,
          tx_hash: tx_hash || payment.tx_hash,
          updated_at: new Date().toISOString()
        })
        .eq('id', payment_id)
        .select()
        .single();

      if (updateError) {
        console.error('Database error:', updateError);
        return res.status(500).json({
          success: false,
          error: 'Failed to update confirmations'
        });
      }

      res.json({
        success: true,
        data: {
          payment_id,
          confirmations,
          previous_confirmations: payment.confirmations || 0
        }
      });
    } else {
      res.json({
        success: true,
        message: 'No update needed',
        data: {
          payment_id,
          confirmations,
          current_confirmations: payment.confirmations || 0
        }
      });
    }

  } catch (error) {
    console.error('Confirmation webhook error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Health check for webhook endpoints
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'webhook-handler',
    timestamp: new Date().toISOString()
  });
});

async function triggerCallback(callbackUrl, data) {
  try {
    const response = await fetch(callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Lightweight-Crypto-Payment-Processor/1.0'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`Callback failed with status ${response.status}`);
    }

    console.log(`Callback successful to ${callbackUrl}`);
  } catch (error) {
    console.error(`Callback failed to ${callbackUrl}:`, error);
    throw error;
  }
}

module.exports = router;
