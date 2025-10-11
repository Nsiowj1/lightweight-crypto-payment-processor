const express = require('express');
const Joi = require('joi');
const { createClient } = require('@supabase/supabase-js');
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = require('../config/environment');
const walletConnectionService = require('../services/walletConnectionService');
const { verifyApiKey } = require('../middleware/authMiddleware');

const router = express.Router();

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Validation schemas
const walletAddressSchema = Joi.object({
  currency: Joi.string().valid('BTC', 'LTC', 'ETH', 'BNB', 'SOL', 'USDT', 'USDC').required(),
  address: Joi.string().required(),
  signature: Joi.string().optional(),
  message: Joi.string().optional()
});

const walletConnectionSchema = Joi.object({
  walletType: Joi.string().valid('trust_wallet', 'metamask', 'phantom', 'other').required(),
  addresses: Joi.object().pattern(
    Joi.string().valid('BTC', 'LTC', 'ETH', 'BNB', 'SOL', 'USDT', 'USDC'),
    Joi.string()
  ).optional()
});

// Generate wallet connection challenge
router.post('/:merchantId/challenge', async (req, res) => {
  try {
    const { merchantId } = req.params;
    const { currency } = req.body;

    if (!currency || !walletConnectionService.getSupportedCurrencies().includes(currency)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or unsupported currency'
      });
    }

    const challenge = walletConnectionService.generateChallengeMessage(merchantId);

    res.json({
      success: true,
      data: {
        challenge: challenge.message,
        currency,
        merchantId,
        timestamp: challenge.timestamp,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes
      }
    });

  } catch (error) {
    console.error('Challenge generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate wallet connection challenge'
    });
  }
});

// Verify wallet connection and store addresses
router.post('/:merchantId/connect', verifyApiKey, async (req, res) => {
  try {
    const { merchantId } = req.params;

    // Verify merchant owns the API key
    if (req.merchant.id !== merchantId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized: API key does not match merchant'
      });
    }

    const { error, value } = walletConnectionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    const { walletType, addresses } = value;

    // Validate all provided addresses
    const validatedAddresses = {};
    const invalidAddresses = [];

    if (addresses) {
      for (const [currency, address] of Object.entries(addresses)) {
        if (walletConnectionService.validateWalletAddress(currency, address)) {
          validatedAddresses[currency] = address;
        } else {
          invalidAddresses.push({ currency, address });
        }
      }
    }

    if (Object.keys(validatedAddresses).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid wallet addresses provided',
        invalidAddresses
      });
    }

    // Update merchant record with wallet information
    const { data, error: updateError } = await supabase
      .from('merchants')
      .update({
        wallet_connected: true,
        wallet_addresses: validatedAddresses,
        wallet_connection_date: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', merchantId)
      .select('id, email, wallet_connected, wallet_addresses, wallet_connection_date')
      .single();

    if (updateError) {
      console.error('Wallet connection update error:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Failed to save wallet connection'
      });
    }

    res.json({
      success: true,
      data: {
        merchant: data,
        connectedCurrencies: Object.keys(validatedAddresses),
        invalidAddresses: invalidAddresses.length > 0 ? invalidAddresses : undefined
      },
      message: 'Wallet connected successfully'
    });

  } catch (error) {
    console.error('Wallet connection error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get merchant wallet information
router.get('/:merchantId/wallet', verifyApiKey, async (req, res) => {
  try {
    const { merchantId } = req.params;

    // Verify merchant owns the API key
    if (req.merchant.id !== merchantId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized: API key does not match merchant'
      });
    }

    const { data, error } = await supabase
      .from('merchants')
      .select('id, email, wallet_connected, wallet_addresses, wallet_connection_date')
      .eq('id', merchantId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Merchant not found'
        });
      }
      console.error('Wallet info fetch error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch wallet information'
      });
    }

    // Format addresses for display
    const formattedAddresses = walletConnectionService.formatWalletAddresses(data.wallet_addresses || {});

    res.json({
      success: true,
      data: {
        merchantId: data.id,
        email: data.email,
        walletConnected: data.wallet_connected,
        walletAddresses: formattedAddresses,
        connectionDate: data.wallet_connection_date,
        supportedCurrencies: walletConnectionService.getSupportedCurrencies()
      }
    });

  } catch (error) {
    console.error('Wallet info fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Update wallet addresses
router.patch('/:merchantId/wallet', verifyApiKey, async (req, res) => {
  try {
    const { merchantId } = req.params;

    // Verify merchant owns the API key
    if (req.merchant.id !== merchantId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized: API key does not match merchant'
      });
    }

    const { error, value } = Joi.object({
      addresses: Joi.object().pattern(
        Joi.string().valid('BTC', 'LTC', 'ETH', 'BNB', 'SOL', 'USDT', 'USDC'),
        Joi.string()
      ).required()
    }).validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    const { addresses } = value;

    // Validate addresses
    const validatedAddresses = {};
    const invalidAddresses = [];

    for (const [currency, address] of Object.entries(addresses)) {
      if (walletConnectionService.validateWalletAddress(currency, address)) {
        validatedAddresses[currency] = address;
      } else {
        invalidAddresses.push({ currency, address });
      }
    }

    if (Object.keys(validatedAddresses).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid wallet addresses provided',
        invalidAddresses
      });
    }

    // Update merchant wallet addresses
    const { data, error: updateError } = await supabase
      .from('merchants')
      .update({
        wallet_addresses: validatedAddresses,
        updated_at: new Date().toISOString()
      })
      .eq('id', merchantId)
      .select('id, wallet_addresses, updated_at')
      .single();

    if (updateError) {
      console.error('Wallet address update error:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Failed to update wallet addresses'
      });
    }

    res.json({
      success: true,
      data: {
        walletAddresses: walletConnectionService.formatWalletAddresses(data.wallet_addresses),
        updatedCurrencies: Object.keys(validatedAddresses),
        invalidAddresses: invalidAddresses.length > 0 ? invalidAddresses : undefined
      },
      message: 'Wallet addresses updated successfully'
    });

  } catch (error) {
    console.error('Wallet address update error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Disconnect wallet
router.delete('/:merchantId/wallet', verifyApiKey, async (req, res) => {
  try {
    const { merchantId } = req.params;

    // Verify merchant owns the API key
    if (req.merchant.id !== merchantId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized: API key does not match merchant'
      });
    }

    // Disconnect wallet
    const { data, error } = await supabase
      .from('merchants')
      .update({
        wallet_connected: false,
        wallet_addresses: {},
        wallet_connection_date: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', merchantId)
      .select('id, wallet_connected, updated_at')
      .single();

    if (error) {
      console.error('Wallet disconnect error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to disconnect wallet'
      });
    }

    res.json({
      success: true,
      data,
      message: 'Wallet disconnected successfully'
    });

  } catch (error) {
    console.error('Wallet disconnect error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get wallet connection instructions
router.get('/connection-instructions/:currency', (req, res) => {
  try {
    const { currency } = req.params;

    if (!walletConnectionService.getSupportedCurrencies().includes(currency)) {
      return res.status(400).json({
        success: false,
        error: 'Unsupported currency'
      });
    }

    const instructions = walletConnectionService.generateConnectionInstructions(currency);
    const currencyInfo = walletConnectionService.getCurrencyInfo(currency);

    res.json({
      success: true,
      data: {
        currency,
        currencyInfo,
        instructions,
        supportedCurrencies: walletConnectionService.getSupportedCurrencies()
      }
    });

  } catch (error) {
    console.error('Connection instructions error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;
