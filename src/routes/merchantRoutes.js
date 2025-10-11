const express = require('express');
const Joi = require('joi');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = require('../config/environment');

const router = express.Router();

// Initialize Supabase client with service role key for admin operations
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Registration schema
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  name: Joi.string().max(100).optional(),
  description: Joi.string().max(500).optional()
});

// Register a new merchant
router.post('/', async (req, res) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    const { email, name, description } = value;

    // Check if merchant already exists
    const { data: existingMerchant, error: checkError } = await supabase
      .from('merchants')
      .select('id')
      .eq('email', email)
      .single();

    if (existingMerchant) {
      return res.status(409).json({
        success: false,
        error: 'Merchant with this email already exists'
      });
    }

    // Generate unique API key (JWT-based)
    const jwt = require('jsonwebtoken');
    const apiKey = jwt.sign(
      {
        merchantId: uuidv4(),
        email,
        type: 'merchant'
      },
      process.env.JWT_SECRET,
      { expiresIn: '100y' } // Essentially unlimited for API key
    );

    // Create merchant record (without wallet fields for now)
    const { data, error: insertError } = await supabase
      .from('merchants')
      .insert({
        id: uuidv4(),
        email,
        name,
        description,
        api_key: apiKey,
        created_at: new Date().toISOString()
      })
      .select('id, email, name, description, api_key, created_at')
      .single();

    if (insertError) {
      console.error('Merchant registration error:', insertError);
      return res.status(500).json({
        success: false,
        error: 'Failed to register merchant'
      });
    }

    res.status(201).json({
      success: true,
      data,
      message: 'Merchant registered successfully. Store the API key securely!'
    });

  } catch (error) {
    console.error('Merchant registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get merchant info (with API key)
const { verifyApiKey } = require('../middleware/authMiddleware');

router.get('/me', verifyApiKey, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('merchants')
      .select('id, email, name, description, created_at')
      .eq('id', req.merchant.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Merchant not found'
        });
      }
      console.error('Merchant fetch error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch merchant info'
      });
    }

    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Merchant fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Update merchant info (with API key)
router.patch('/me', verifyApiKey, async (req, res) => {
  try {
    const updateSchema = Joi.object({
      name: Joi.string().max(100).optional(),
      description: Joi.string().max(500).optional()
    });

    const { error, value } = updateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    const { name, description } = value;

    const { data, error: updateError } = await supabase
      .from('merchants')
      .update({
        name: name || undefined,
        description: description || undefined
      })
      .eq('id', req.merchant.id)
      .select('id, email, name, description, updated_at')
      .single();

    if (updateError) {
      console.error('Merchant update error:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Failed to update merchant info'
      });
    }

    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Merchant update error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Regenerate API key (with current API key)
router.post('/me/regenerate-key', verifyApiKey, async (req, res) => {
  try {
    // Get current merchant
    const { data: merchant, error: fetchError } = await supabase
      .from('merchants')
      .select('email')
      .eq('id', req.merchant.id)
      .single();

    if (fetchError) {
      return res.status(404).json({
        success: false,
        error: 'Merchant not found'
      });
    }

    // Generate new API key
    const jwt = require('jsonwebtoken');
    const newApiKey = jwt.sign(
      {
        merchantId: req.merchant.id,
        email: merchant.email,
        type: 'merchant'
      },
      process.env.JWT_SECRET,
      { expiresIn: '100y' }
    );

    // Update API key
    const { data, error: updateError } = await supabase
      .from('merchants')
      .update({
        api_key: newApiKey,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.merchant.id)
      .select('id, email, name, api_key, updated_at')
      .single();

    if (updateError) {
      console.error('API key regeneration error:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Failed to regenerate API key'
      });
    }

    res.json({
      success: true,
      data,
      message: 'API key regenerated successfully. Update your systems with the new key!'
    });

  } catch (error) {
    console.error('API key regeneration error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;
