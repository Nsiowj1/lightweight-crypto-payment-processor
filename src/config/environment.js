require('dotenv').config();

const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'JWT_SECRET',
  'WEBHOOK_SECRET'
];

const optionalEnvVars = [
  'PORT',
  'NODE_ENV',
  'FRONTEND_URL',
  'ANKR_API_KEY',
  'BLOCKCYPHER_API_KEY',
  'BLOCKSTREAM_API_KEY'
];

// Validate required environment variables
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingEnvVars.forEach(envVar => console.error(`   - ${envVar}`));
  console.error('Please set these in your .env file');
  process.exit(1);
}

module.exports = {
  // Server configuration
  PORT: parseInt(process.env.PORT) || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Supabase configuration
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,

  // Redis configuration
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,

  // Security
  JWT_SECRET: process.env.JWT_SECRET,
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,

  // External APIs
  ANKR_API_KEY: process.env.ANKR_API_KEY,
  BLOCKCYPHER_API_KEY: process.env.BLOCKCYPHER_API_KEY,
  BLOCKSTREAM_API_KEY: process.env.BLOCKSTREAM_API_KEY,

  // Frontend
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',

  // Blockchain RPC endpoints
  BLOCKCHAIN_ENDPOINTS: {
    BTC: process.env.BTC_RPC_URL || 'https://blockstream.info/api',
    ETH: process.env.ETH_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2',
    SOL: process.env.SOL_RPC_URL || 'https://api.mainnet-beta.solana.com',
    BNB: process.env.BNB_RPC_URL || 'https://bsc-dataseed.binance.org',
    LTC: process.env.LTC_RPC_URL || 'https://litecoin-blockbook.blockcypher.com/api'
  }
};
