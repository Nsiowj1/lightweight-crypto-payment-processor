#!/usr/bin/env node

/**
 * Setup script for external monitoring services
 * This script helps configure Cron-job.org and UptimeRobot for 24/7 monitoring
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise(resolve => rl.question(query, resolve));

async function setupMonitoring() {
  console.log('🚀 Lightweight Crypto Payment Processor - Monitoring Setup');
  console.log('=' .repeat(60));

  const baseUrl = await question('Enter your application URL (e.g., https://your-app.onrender.com): ');
  const email = await question('Enter your email for monitoring alerts: ');

  console.log('\n📋 Generated Monitoring Configuration:');
  console.log('=' .repeat(40));

  // Cron-job.org configuration
  console.log('\n1️⃣ CRON-JOB.ORG SETUP');
  console.log('=' .repeat(25));
  console.log('Go to: https://cron-job.org');
  console.log('Create a new cron job with these settings:');
  console.log(`  • Title: Crypto Payment Processor Health Check`);
  console.log(`  • URL: ${baseUrl}/api/health`);
  console.log(`  • Method: GET`);
  console.log(`  • Schedule: Every 14 minutes`);
  console.log(`  • Timeout: 30 seconds`);
  console.log(`  • Email notifications: ${email}`);
  console.log(`  • Failure threshold: 3 attempts`);

  // UptimeRobot configuration
  console.log('\n2️⃣ UPTIMEROBOT SETUP');
  console.log('=' .repeat(20));
  console.log('Go to: https://uptimerobot.com');
  console.log('Create a new monitor with these settings:');
  console.log(`  • Monitor Type: HTTP(s)`);
  console.log(`  • Friendly Name: Crypto Payment Processor`);
  console.log(`  • URL: ${baseUrl}/api/health`);
  console.log(`  • Monitoring Interval: 5 minutes`);
  console.log(`  • Alert Contacts: ${email}`);

  // Additional monitors
  console.log('\n📊 ADDITIONAL MONITORS TO CREATE');
  console.log('=' .repeat(30));
  console.log('Create these additional UptimeRobot monitors:');
  console.log(`  1. Frontend: ${baseUrl}/`);
  console.log(`  2. Payment Monitor: ${baseUrl}/api/health/monitor`);
  console.log(`  3. Keep-Alive: ${baseUrl}/api/health/keepalive`);

  // Environment variables
  console.log('\n🔧 ENVIRONMENT VARIABLES');
  console.log('=' .repeat(25));
  console.log('Add these to your .env file:');
  console.log(`  RENDER_EXTERNAL_URL=${baseUrl}`);
  console.log(`  MONITORING_EMAIL=${email}`);

  // Manual testing
  console.log('\n🧪 MANUAL TESTING');
  console.log('=' .repeat(18));
  console.log('Test your setup with these commands:');
  console.log(`  curl ${baseUrl}/api/health`);
  console.log(`  curl ${baseUrl}/api/health/monitor`);
  console.log(`  curl ${baseUrl}/api/health/keepalive`);

  // Monitoring endpoints
  console.log('\n📈 MONITORING ENDPOINTS');
  console.log('=' .repeat(25));
  console.log('Available monitoring endpoints:');
  console.log(`  GET ${baseUrl}/api/health - Basic health check`);
  console.log(`  GET ${baseUrl}/api/health/detailed - Detailed status`);
  console.log(`  GET ${baseUrl}/api/health/monitor - Payment monitor status`);
  console.log(`  GET ${baseUrl}/api/health/keepalive - Keep-alive status`);
  console.log(`  GET ${baseUrl}/api/health/usage - Resource usage`);
  console.log(`  GET ${baseUrl}/api/health/services - All services status`);

  console.log('\n✅ Setup complete! Your application will now have 24/7 monitoring.');
  console.log('📧 You will receive alerts if the service goes down.');
  console.log('🔄 The system includes multiple keep-alive strategies for reliability.');

  rl.close();
}

// Run setup if this file is executed directly
if (require.main === module) {
  setupMonitoring().catch(console.error);
}

module.exports = { setupMonitoring };
