const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

class WalletConnectionService {
  constructor() {
    this.supportedCurrencies = {
      BTC: {
        name: 'Bitcoin',
        symbol: 'BTC',
        decimals: 8,
        networks: ['mainnet', 'testnet']
      },
      ETH: {
        name: 'Ethereum',
        symbol: 'ETH',
        decimals: 18,
        networks: ['mainnet', 'goerli', 'sepolia']
      },
      BNB: {
        name: 'BNB Smart Chain',
        symbol: 'BNB',
        decimals: 18,
        networks: ['mainnet', 'testnet']
      },
      LTC: {
        name: 'Litecoin',
        symbol: 'LTC',
        decimals: 8,
        networks: ['mainnet', 'testnet']
      },
      SOL: {
        name: 'Solana',
        symbol: 'SOL',
        decimals: 9,
        networks: ['mainnet', 'devnet']
      },
      USDT: {
        name: 'Tether USD',
        symbol: 'USDT',
        decimals: 6,
        networks: ['ethereum', 'bsc', 'polygon']
      },
      USDC: {
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 6,
        networks: ['ethereum', 'bsc', 'polygon', 'solana']
      }
    };

    this.walletTypes = {
      TRUST_WALLET: 'trust_wallet',
      METAMASK: 'metamask',
      PHANTOM: 'phantom',
      OTHER: 'other'
    };
  }

  /**
   * Generate wallet connection challenge message
   */
  generateChallengeMessage(merchantId) {
    const timestamp = Date.now();
    const nonce = uuidv4();
    const message = `Connect wallet to Crypto Payment Processor\n\nMerchant ID: ${merchantId}\nTimestamp: ${timestamp}\nNonce: ${nonce}`;

    return {
      message,
      timestamp,
      nonce,
      hash: crypto.createHash('sha256').update(message).digest('hex')
    };
  }

  /**
   * Verify wallet signature for ownership proof
   */
  verifyWalletSignature(message, signature, address, currency) {
    try {
      switch (currency) {
        case 'BTC':
        case 'LTC':
          return this.verifyBitcoinSignature(message, signature, address);
        case 'ETH':
        case 'BNB':
        case 'USDT':
        case 'USDC':
          return this.verifyEthereumSignature(message, signature, address);
        case 'SOL':
          return this.verifySolanaSignature(message, signature, address);
        default:
          throw new Error(`Unsupported currency for signature verification: ${currency}`);
      }
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  }

  /**
   * Verify Bitcoin/Litecoin signature
   */
  verifyBitcoinSignature(message, signature, address) {
    // For Bitcoin, we would need to implement proper signature verification
    // This is a simplified version for demonstration
    try {
      const bitcoin = require('bitcoinjs-lib');
      const bitcoinMessage = require('bitcoinjs-message');

      // Verify message signature
      const verifiedAddress = bitcoinMessage.verify(message, address, signature);

      return verifiedAddress === address;
    } catch (error) {
      console.error('Bitcoin signature verification error:', error);
      return false;
    }
  }

  /**
   * Verify Ethereum signature
   */
  verifyEthereumSignature(message, signature, address) {
    try {
      const { ethers } = require('ethers');

      // Hash the message
      const messageHash = ethers.utils.hashMessage(message);

      // Recover address from signature
      const recoveredAddress = ethers.utils.recoverAddress(messageHash, signature);

      // Compare with provided address (case insensitive)
      return recoveredAddress.toLowerCase() === address.toLowerCase();
    } catch (error) {
      console.error('Ethereum signature verification error:', error);
      return false;
    }
  }

  /**
   * Verify Solana signature
   */
  verifySolanaSignature(message, signature, address) {
    try {
      const { PublicKey, Transaction } = require('@solana/web3.js');
      const nacl = require('tweetnacl');

      // Decode signature
      const signatureBytes = Buffer.from(signature, 'hex');
      const messageBytes = Buffer.from(message);

      // For Solana, we need the public key that signed the message
      // This is a simplified verification
      const publicKey = new PublicKey(address);

      // In a real implementation, you would verify the signature properly
      // This is a placeholder for demonstration
      return true;
    } catch (error) {
      console.error('Solana signature verification error:', error);
      return false;
    }
  }

  /**
   * Validate wallet address format
   */
  validateWalletAddress(currency, address) {
    try {
      switch (currency) {
        case 'BTC':
          return this.validateBitcoinAddress(address);
        case 'LTC':
          return this.validateLitecoinAddress(address);
        case 'ETH':
        case 'BNB':
          return this.validateEthereumAddress(address);
        case 'SOL':
          return this.validateSolanaAddress(address);
        case 'USDT':
        case 'USDC':
          // These can be on different networks, check for valid format
          return this.validateEthereumAddress(address) || this.validateSolanaAddress(address);
        default:
          return false;
      }
    } catch (error) {
      console.error('Address validation error:', error);
      return false;
    }
  }

  /**
   * Validate Bitcoin address
   */
  validateBitcoinAddress(address) {
    try {
      const bitcoin = require('bitcoinjs-lib');
      bitcoin.address.fromBase58Check(address);
      return true;
    } catch {
      try {
        const bitcoin = require('bitcoinjs-lib');
        bitcoin.address.fromBech32(address);
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Validate Litecoin address
   */
  validateLitecoinAddress(address) {
    try {
      const bitcoin = require('bitcoinjs-lib');
      bitcoin.address.fromBase58Check(address);
      return true;
    } catch {
      try {
        const bitcoin = require('bitcoinjs-lib');
        bitcoin.address.fromBech32(address);
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Validate Ethereum address
   */
  validateEthereumAddress(address) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  /**
   * Validate Solana address
   */
  validateSolanaAddress(address) {
    try {
      const { PublicKey } = require('@solana/web3.js');
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate wallet connection QR code data
   */
  generateWalletConnectURI(currency, merchantId, callbackUrl) {
    // Generate WalletConnect URI for mobile wallet connection
    const challenge = this.generateChallengeMessage(merchantId);

    // Create WalletConnect URI
    const walletConnectUri = `wc:${challenge.hash}@2?bridge=https%3A%2F%2Fbridge.walletconnect.org&key=${crypto.randomBytes(32).toString('hex')}`;

    return {
      uri: walletConnectUri,
      challenge: challenge.message,
      currency,
      merchantId,
      callbackUrl
    };
  }

  /**
   * Get supported currencies for wallet connection
   */
  getSupportedCurrencies() {
    return Object.keys(this.supportedCurrencies);
  }

  /**
   * Get currency info
   */
  getCurrencyInfo(currency) {
    return this.supportedCurrencies[currency] || null;
  }

  /**
   * Format wallet addresses for display
   */
  formatWalletAddresses(walletAddresses) {
    const formatted = {};

    for (const [currency, address] of Object.entries(walletAddresses)) {
      if (address && typeof address === 'string') {
        formatted[currency] = {
          address,
          shortAddress: `${address.substring(0, 6)}...${address.substring(address.length - 4)}`,
          isValid: this.validateWalletAddress(currency, address)
        };
      }
    }

    return formatted;
  }

  /**
   * Check if merchant has wallet addresses for specific currency
   */
  hasWalletAddress(walletAddresses, currency) {
    return walletAddresses &&
           walletAddresses[currency] &&
           this.validateWalletAddress(currency, walletAddresses[currency]);
  }

  /**
   * Get merchant's wallet address for currency
   */
  getWalletAddress(walletAddresses, currency) {
    if (this.hasWalletAddress(walletAddresses, currency)) {
      return walletAddresses[currency];
    }
    return null;
  }

  /**
   * Generate wallet connection instructions
   */
  generateConnectionInstructions(currency) {
    const instructions = {
      BTC: [
        '1. Open Trust Wallet on your mobile device',
        '2. Tap the QR scanner icon in the top right',
        '3. Scan the QR code displayed on this page',
        '4. Approve the connection request',
        '5. Sign the verification message to prove ownership'
      ],
      ETH: [
        '1. Open Trust Wallet and ensure Ethereum is selected',
        '2. Tap the browser icon and navigate to this page',
        '3. Tap "Connect Wallet" when prompted',
        '4. Select Trust Wallet from the wallet options',
        '5. Sign the verification message to prove ownership'
      ],
      SOL: [
        '1. Open Trust Wallet and ensure Solana is selected',
        '2. Tap the QR scanner or use the browser connection',
        '3. Follow the connection prompts',
        '4. Sign the verification message to prove ownership'
      ]
    };

    return instructions[currency] || [
      '1. Open Trust Wallet on your mobile device',
      '2. Use the QR scanner or browser connection',
      '3. Follow the connection prompts',
      '4. Sign the verification message to prove ownership'
    ];
  }
}

module.exports = new WalletConnectionService();
