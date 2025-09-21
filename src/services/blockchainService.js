const axios = require('axios');
const { Redis } = require('@upstash/redis');
const { BLOCKCHAIN_ENDPOINTS, ANKR_API_KEY, BLOCKCYPHER_API_KEY } = require('../config/environment');

// Initialize Redis
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

class BlockchainService {
  constructor() {
    this.endpoints = {
      BTC: {
        blockstream: 'https://blockstream.info/api',
        blockcypher: 'https://api.blockcypher.com/v1/btc/main',
        ankr: 'https://rpc.ankr.com/btc'
      },
      LTC: {
        blockcypher: 'https://api.blockcypher.com/v1/ltc/main',
        ankr: 'https://rpc.ankr.com/ltc'
      },
      ETH: {
        ankr: 'https://rpc.ankr.com/eth',
        infura: 'https://mainnet.infura.io/v3',
        alchemy: 'https://eth-mainnet.g.alchemy.com/v2'
      },
      BNB: {
        ankr: 'https://rpc.ankr.com/bsc',
        binance: 'https://bsc-dataseed.binance.org'
      },
      SOL: {
        ankr: 'https://rpc.ankr.com/solana',
        helius: 'https://mainnet.helius-rpc.com',
        solana: 'https://api.mainnet-beta.solana.com'
      }
    };

    this.requiredConfirmations = {
      BTC: 3,
      LTC: 6,
      ETH: 12,
      BNB: 15,
      SOL: 1,
      USDT: 12, // Depends on network
      USDC: 12  // Depends on network
    };
  }

  /**
   * Check payment status for a specific address and currency
   */
  async checkPaymentStatus(currency, address, expectedAmount) {
    try {
      const cacheKey = `payment:${currency}:${address}`;
      const cached = await redis.get(cacheKey);

      if (cached) {
        return cached;
      }

      let result;

      switch (currency) {
        case 'BTC':
          result = await this.checkBitcoinPayment(address, expectedAmount);
          break;
        case 'LTC':
          result = await this.checkLitecoinPayment(address, expectedAmount);
          break;
        case 'ETH':
          result = await this.checkEthereumPayment(address, expectedAmount);
          break;
        case 'BNB':
          result = await this.checkBNBPayment(address, expectedAmount);
          break;
        case 'SOL':
          result = await this.checkSolanaPayment(address, expectedAmount);
          break;
        case 'USDT':
          result = await this.checkUSDTPayment(address, expectedAmount);
          break;
        case 'USDC':
          result = await this.checkUSDCPayment(address, expectedAmount);
          break;
        default:
          throw new Error(`Unsupported currency: ${currency}`);
      }

      // Cache result for 30 seconds
      await redis.setex(cacheKey, 30, JSON.stringify(result));

      return result;
    } catch (error) {
      console.error(`Error checking ${currency} payment:`, error);
      return {
        status: 'error',
        error: error.message,
        address,
        currency
      };
    }
  }

  /**
   * Check Bitcoin payment using multiple APIs
   */
  async checkBitcoinPayment(address, expectedAmount) {
    const endpoints = [
      `${this.endpoints.BTC.blockstream}/address/${address}`,
      `${this.endpoints.BTC.blockcypher}/addrs/${address}/balance`
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(endpoint, {
          timeout: 10000,
          headers: {
            'User-Agent': 'Lightweight-Crypto-Payment-Processor/1.0'
          }
        });

        let balance = 0;
        let txs = [];

        if (endpoint.includes('blockstream')) {
          const data = response.data;
          balance = data.chain_stats.funded_txo_sum / 100000000; // Convert satoshis to BTC
          txs = data.txids || [];
        } else if (endpoint.includes('blockcypher')) {
          const data = response.data;
          balance = data.balance / 100000000; // Convert satoshis to BTC
          txs = data.txrefs ? data.txrefs.map(tx => tx.tx_hash) : [];
        }

        const confirmedBalance = balance;
        const isPaid = confirmedBalance >= expectedAmount;
        const confirmations = isPaid ? this.requiredConfirmations.BTC : 0;

        return {
          status: isPaid ? 'paid' : 'pending',
          address,
          currency: 'BTC',
          balance: confirmedBalance,
          expectedAmount,
          confirmations,
          transactions: txs.slice(0, 10), // Last 10 transactions
          lastChecked: new Date().toISOString()
        };
      } catch (error) {
        console.warn(`Bitcoin API ${endpoint} failed:`, error.message);
        continue;
      }
    }

    throw new Error('All Bitcoin APIs failed');
  }

  /**
   * Check Litecoin payment
   */
  async checkLitecoinPayment(address, expectedAmount) {
    try {
      const response = await axios.get(
        `${this.endpoints.LTC.blockcypher}/addrs/${address}/balance`,
        { timeout: 10000 }
      );

      const data = response.data;
      const balance = data.balance / 100000000; // Convert litoshis to LTC

      return {
        status: balance >= expectedAmount ? 'paid' : 'pending',
        address,
        currency: 'LTC',
        balance,
        expectedAmount,
        confirmations: balance >= expectedAmount ? this.requiredConfirmations.LTC : 0,
        lastChecked: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Litecoin API failed: ${error.message}`);
    }
  }

  /**
   * Check Ethereum payment
   */
  async checkEthereumPayment(address, expectedAmount) {
    const web3 = new (require('web3'))(this.endpoints.ETH.ankr);

    try {
      const balance = await web3.eth.getBalance(address);
      const balanceInEther = web3.utils.fromWei(balance, 'ether');

      return {
        status: parseFloat(balanceInEther) >= expectedAmount ? 'paid' : 'pending',
        address,
        currency: 'ETH',
        balance: parseFloat(balanceInEther),
        expectedAmount,
        confirmations: parseFloat(balanceInEther) >= expectedAmount ? this.requiredConfirmations.ETH : 0,
        lastChecked: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Ethereum API failed: ${error.message}`);
    }
  }

  /**
   * Check BNB Smart Chain payment
   */
  async checkBNBPayment(address, expectedAmount) {
    const web3 = new (require('web3'))(this.endpoints.BNB.ankr);

    try {
      const balance = await web3.eth.getBalance(address);
      const balanceInEther = web3.utils.fromWei(balance, 'ether');

      return {
        status: parseFloat(balanceInEther) >= expectedAmount ? 'paid' : 'pending',
        address,
        currency: 'BNB',
        balance: parseFloat(balanceInEther),
        expectedAmount,
        confirmations: parseFloat(balanceInEther) >= expectedAmount ? this.requiredConfirmations.BNB : 0,
        lastChecked: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`BNB API failed: ${error.message}`);
    }
  }

  /**
   * Check Solana payment
   */
  async checkSolanaPayment(address, expectedAmount) {
    try {
      const response = await axios.post(this.endpoints.SOL.ankr, {
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [address]
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });

      const balance = response.data.result.value / 1000000000; // Convert lamports to SOL

      return {
        status: balance >= expectedAmount ? 'paid' : 'pending',
        address,
        currency: 'SOL',
        balance,
        expectedAmount,
        confirmations: balance >= expectedAmount ? this.requiredConfirmations.SOL : 0,
        lastChecked: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Solana API failed: ${error.message}`);
    }
  }

  /**
   * Check USDT payment (ERC-20 on Ethereum)
   */
  async checkUSDTPayment(address, expectedAmount) {
    const web3 = new (require('web3'))(this.endpoints.ETH.ankr);

    try {
      // USDT contract address
      const usdtContract = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

      const contract = new web3.eth.Contract([
        {
          constant: true,
          inputs: [{ name: '_owner', type: 'address' }],
          name: 'balanceOf',
          outputs: [{ name: 'balance', type: 'uint256' }],
          type: 'function'
        }
      ], usdtContract);

      const balance = await contract.methods.balanceOf(address).call();
      const balanceInUSDT = balance / 1000000; // USDT has 6 decimals

      return {
        status: balanceInUSDT >= expectedAmount ? 'paid' : 'pending',
        address,
        currency: 'USDT',
        balance: balanceInUSDT,
        expectedAmount,
        confirmations: balanceInUSDT >= expectedAmount ? this.requiredConfirmations.USDT : 0,
        lastChecked: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`USDT API failed: ${error.message}`);
    }
  }

  /**
   * Check USDC payment (ERC-20 on Ethereum)
   */
  async checkUSDCPayment(address, expectedAmount) {
    const web3 = new (require('web3'))(this.endpoints.ETH.ankr);

    try {
      // USDC contract address
      const usdcContract = '0xA0b86a33E6441e94E2A7a1E8A1c8B8F5F5E5E5E5';

      const contract = new web3.eth.Contract([
        {
          constant: true,
          inputs: [{ name: '_owner', type: 'address' }],
          name: 'balanceOf',
          outputs: [{ name: 'balance', type: 'uint256' }],
          type: 'function'
        }
      ], usdcContract);

      const balance = await contract.methods.balanceOf(address).call();
      const balanceInUSDC = balance / 1000000; // USDC has 6 decimals

      return {
        status: balanceInUSDC >= expectedAmount ? 'paid' : 'pending',
        address,
        currency: 'USDC',
        balance: balanceInUSDC,
        expectedAmount,
        confirmations: balanceInUSDC >= expectedAmount ? this.requiredConfirmations.USDC : 0,
        lastChecked: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`USDC API failed: ${error.message}`);
    }
  }

  /**
   * Get transaction details
   */
  async getTransactionDetails(currency, txHash) {
    try {
      let endpoint;

      switch (currency) {
        case 'BTC':
          endpoint = `${this.endpoints.BTC.blockstream}/tx/${txHash}`;
          break;
        case 'LTC':
          endpoint = `${this.endpoints.LTC.blockcypher}/txs/${txHash}`;
          break;
        case 'ETH':
        case 'BNB':
          const web3 = new (require('web3'))(this.endpoints[currency].ankr);
          return await web3.eth.getTransaction(txHash);
        case 'SOL':
          const response = await axios.post(this.endpoints.SOL.ankr, {
            jsonrpc: '2.0',
            id: 1,
            method: 'getTransaction',
            params: [txHash]
          });
          return response.data.result;
        default:
          throw new Error(`Unsupported currency: ${currency}`);
      }

      const response = await axios.get(endpoint, { timeout: 10000 });
      return response.data;
    } catch (error) {
      console.error(`Error getting ${currency} transaction:`, error);
      return null;
    }
  }

  /**
   * Get current price for currency (placeholder)
   */
  async getCurrentPrice(currency) {
    try {
      // This would integrate with a price oracle like CoinGecko
      const cacheKey = `price:${currency}`;
      const cached = await redis.get(cacheKey);

      if (cached) {
        return parseFloat(cached);
      }

      // Placeholder prices - in production, use real price feed
      const prices = {
        BTC: 45000,
        LTC: 70,
        ETH: 2500,
        BNB: 300,
        SOL: 100,
        USDT: 1,
        USDC: 1
      };

      const price = prices[currency] || 0;

      // Cache for 5 minutes
      await redis.setex(cacheKey, 300, price.toString());

      return price;
    } catch (error) {
      console.error(`Error getting ${currency} price:`, error);
      return 0;
    }
  }

  /**
   * Get required confirmations for currency
   */
  getRequiredConfirmations(currency) {
    return this.requiredConfirmations[currency] || 1;
  }
}

module.exports = new BlockchainService();
