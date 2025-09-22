-- Lightweight Crypto Payment Processor - Supabase Schema
-- Run this in your Supabase SQL editor to set up the database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create merchants table
CREATE TABLE IF NOT EXISTS merchants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  api_key VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  description TEXT,
  webhook_url VARCHAR(500),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create payments table
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  amount DECIMAL(36,18) NOT NULL CHECK (amount > 0),
  currency VARCHAR(10) NOT NULL CHECK (currency IN ('BTC', 'LTC', 'ETH', 'BNB', 'SOL', 'USDT', 'USDC')),
  order_id VARCHAR(255) NOT NULL,
  description TEXT,
  address VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'cancelled', 'failed')),
  tx_hash VARCHAR(255),
  confirmations INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ,
  actual_amount DECIMAL(36,18),
  callback_url TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create webhook_logs table for debugging
CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id UUID REFERENCES payments(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  signature VARCHAR(255),
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  processing_time_ms INTEGER,
  success BOOLEAN DEFAULT false,
  error_message TEXT
);

-- Create health_check table for monitoring
CREATE TABLE IF NOT EXISTS health_check (
  id SERIAL PRIMARY KEY,
  service_name VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'healthy',
  last_check TIMESTAMPTZ DEFAULT NOW(),
  response_time_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert initial health check record
INSERT INTO health_check (service_name, status) VALUES ('database', 'healthy');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_payments_merchant_id ON payments(merchant_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_address ON payments(address);
CREATE INDEX IF NOT EXISTS idx_payments_expires_at ON payments(expires_at);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_payment_id ON webhook_logs(payment_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_processed_at ON webhook_logs(processed_at);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_merchants_updated_at BEFORE UPDATE ON merchants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for merchants table
CREATE POLICY "Merchants can view own record" ON merchants
    FOR SELECT USING (auth.uid()::text = id::text);

CREATE POLICY "Merchants can update own record" ON merchants
    FOR UPDATE USING (auth.uid()::text = id::text);

-- Create policies for payments table
CREATE POLICY "Merchants can view own payments" ON payments
    FOR SELECT USING (merchant_id::text = auth.uid()::text);

CREATE POLICY "Merchants can insert own payments" ON payments
    FOR INSERT WITH CHECK (merchant_id::text = auth.uid()::text);

CREATE POLICY "Merchants can update own payments" ON payments
    FOR UPDATE USING (merchant_id::text = auth.uid()::text);

-- Create policies for webhook_logs table
CREATE POLICY "Merchants can view own webhook logs" ON webhook_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM payments
            WHERE payments.id = webhook_logs.payment_id
            AND payments.merchant_id::text = auth.uid()::text
        )
    );

-- Create function to clean up expired payments
CREATE OR REPLACE FUNCTION cleanup_expired_payments()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    UPDATE payments
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'pending'
    AND expires_at < NOW();

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to get payment statistics
CREATE OR REPLACE FUNCTION get_merchant_stats(merchant_uuid UUID)
RETURNS TABLE (
    total_payments BIGINT,
    paid_payments BIGINT,
    pending_payments BIGINT,
    total_volume DECIMAL(36,18),
    paid_volume DECIMAL(36,18)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) as total_payments,
        COUNT(*) FILTER (WHERE status = 'paid') as paid_payments,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_payments,
        COALESCE(SUM(amount), 0) as total_volume,
        COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) as paid_volume
    FROM payments
    WHERE merchant_id = merchant_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Insert sample data for testing (optional)
-- INSERT INTO merchants (email, api_key, name) VALUES
-- ('test@example.com', 'test-api-key-123', 'Test Merchant');
