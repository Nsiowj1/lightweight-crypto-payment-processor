const express = require('express');
const Joi = require('joi');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = require('../config/environment');
const walletService = require('../services/walletService');
const blockchainService = require('../services/blockchainService');

const router = express.Router();

// Initialize Supabase client with service role key for admin operations
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Validation schemas
const createPaymentSchema = Joi.object({
  amount: Joi.number().positive().required(),
  currency: Joi.string().valid('BTC', 'LTC', 'ETH', 'BNB', 'SOL', 'USDT', 'USDC').required(),
  order_id: Joi.string().required(),
  description: Joi.string().optional(),
  expires_in: Joi.number().integer().min(60).max(86400).default(3600), // 1 hour default, max 24 hours
  callback_url: Joi.string().uri().optional(),
  metadata: Joi.object().optional()
});

const getPaymentsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid('pending', 'paid', 'expired', 'cancelled').optional(),
  currency: Joi.string().valid('BTC', 'LTC', 'ETH', 'BNB', 'SOL', 'USDT', 'USDC').optional()
});

// Create a new payment request
router.post('/', async (req, res) => {
  try {
    const { error, value } = createPaymentSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    const { amount, currency, order_id, description, expires_in, callback_url, metadata } = value;

    // Generate unique payment ID
    const paymentId = uuidv4();

    // Calculate expiration time
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // Generate crypto address using HD wallet
    const address = await generateAddress(currency);

    // Create payment record in database
    const { data, error: dbError } = await supabase
      .from('payments')
      .insert({
        id: paymentId,
        merchant_id: req.merchant.id,
        amount,
        currency,
        order_id,
        description,
        address,
        status: 'pending',
        expires_at: expiresAt.toISOString(),
        callback_url,
        metadata,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      return res.status(500).json({
        success: false,
        error: 'Failed to create payment'
      });
    }

    res.status(201).json({
      success: true,
      data: {
        id: data.id,
        amount: data.amount,
        currency: data.currency,
        address: data.address,
        expires_at: data.expires_at,
        status: data.status,
        order_id: data.order_id
      }
    });

  } catch (error) {
    console.error('Payment creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get payments for merchant
router.get('/', async (req, res) => {
  try {
    const { error, value } = getPaymentsSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    const { page, limit, status, currency } = value;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('payments')
      .select('*', { count: 'exact' })
      .eq('merchant_id', req.merchant.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    if (currency) {
      query = query.eq('currency', currency);
    }

    const { data, error: dbError, count } = await query;

    if (dbError) {
      console.error('Database error:', dbError);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch payments'
      });
    }

    res.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total: count,
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get specific payment
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('id', id)
      .eq('merchant_id', req.merchant.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Payment not found'
        });
      }
      console.error('Database error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch payment'
      });
    }

    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Get payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Cancel payment
router.patch('/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('payments')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('merchant_id', req.merchant.id)
      .eq('status', 'pending')
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Payment not found or cannot be cancelled'
        });
      }
      console.error('Database error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to cancel payment'
      });
    }

    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Cancel payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Generate address using HD wallet service
async function generateAddress(currency) {
  try {
    // For now, use a simple master key for testing
    // In production, this should be stored securely per merchant
    const testMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const masterKey = walletService.generateMasterKey(testMnemonic);

    const addressData = walletService.deriveAddress(currency, masterKey.masterKey, 0);

    return addressData.address;
  } catch (error) {
    console.error('Address generation error:', error);
    throw new Error(`Failed to generate ${currency} address: ${error.message}`);
  }
}

// Check payment status
router.get('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;

    // Get payment from database
    const { data: payment, error } = await supabase
      .from('payments')
      .select('*')
      .eq('id', id)
      .eq('merchant_id', req.merchant.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Payment not found'
        });
      }
      console.error('Database error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch payment'
      });
    }

    // Check if payment is already completed
    if (['paid', 'expired', 'cancelled', 'failed'].includes(payment.status)) {
      return res.json({
        success: true,
        data: {
          id: payment.id,
          status: payment.status,
          address: payment.address,
          amount: payment.amount,
          currency: payment.currency,
          confirmations: payment.confirmations || 0,
          tx_hash: payment.tx_hash,
          paid_at: payment.paid_at,
          last_checked: new Date().toISOString()
        }
      });
    }

    // Check payment status on blockchain
    const statusResult = await blockchainService.checkPaymentStatus(
      payment.currency,
      payment.address,
      payment.amount
    );

    // Update payment status if changed
    if (statusResult.status !== 'pending' && statusResult.status !== payment.status) {
      const updateData = {
        status: statusResult.status,
        confirmations: statusResult.confirmations || 0,
        tx_hash: statusResult.tx_hash,
        actual_amount: statusResult.balance,
        updated_at: new Date().toISOString()
      };

      if (statusResult.status === 'paid') {
        updateData.paid_at = new Date().toISOString();
      }

      const { error: updateError } = await supabase
        .from('payments')
        .update(updateData)
        .eq('id', id);

      if (updateError) {
        console.error('Failed to update payment status:', updateError);
      }
    }

    res.json({
      success: true,
      data: {
        id: payment.id,
        status: statusResult.status,
        address: payment.address,
        amount: payment.amount,
        currency: payment.currency,
        balance: statusResult.balance,
        confirmations: statusResult.confirmations || 0,
        tx_hash: statusResult.tx_hash,
        expected_amount: payment.amount,
        last_checked: statusResult.lastChecked
      }
    });

  } catch (error) {
    console.error('Payment status check error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;
