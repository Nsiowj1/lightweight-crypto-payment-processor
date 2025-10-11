// Import required modules with error handling
let hdkey, bip39, ECPairFactory, ecc, Web3, PublicKey;

try {
  hdkey = require('hdkey');
  bip39 = require('bip39');
  ECPairFactory = require('ecpair').ECPairFactory;
  ecc = require('tiny-secp256k1');
  Web3 = require('web3');
  PublicKey = require('@solana/web3.js').PublicKey;
} catch (error) {
  console.error('Error importing wallet dependencies:', error.message);
}

// Initialize ECPair
const ECPair = ECPairFactory(ecc);

class WalletService {
  constructor() {
    this.networks = {
      BTC: {
        name: 'Bitcoin',
        symbol: 'BTC',
        decimals: 8,
        network: 'mainnet'
      },
      LTC: {
        name: 'Litecoin',
        symbol: 'LTC',
        decimals: 8,
        network: 'mainnet'
      },
      ETH: {
        name: 'Ethereum',
        symbol: 'ETH',
        decimals: 18,
        network: 'mainnet'
      },
      BNB: {
        name: 'BNB Smart Chain',
        symbol: 'BNB',
        decimals: 18,
        network: 'mainnet'
      },
      SOL: {
        name: 'Solana',
        symbol: 'SOL',
        decimals: 9,
        network: 'mainnet'
      },
      USDT: {
        name: 'Tether USD',
        symbol: 'USDT',
        decimals: 6,
        network: 'multi'
      },
      USDC: {
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 6,
        network: 'multi'
      }
    };
  }

  /**
   * Generate a new HD wallet master key from mnemonic
   */
  generateMasterKey(mnemonic = null) {
    if (!mnemonic) {
      mnemonic = bip39.generateMnemonic();
    }

    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic phrase');
    }

    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const masterKey = hdkey.fromMasterSeed(seed);

    return {
      mnemonic,
      masterKey: masterKey.toJSON(),
      fingerprint: masterKey.fingerprint.toString('hex')
    };
  }

  /**
   * Derive address for specific currency and index
   */
  deriveAddress(currency, masterKeyJson, index = 0) {
    const masterKey = hdkey.fromJSON(masterKeyJson);

    switch (currency) {
      case 'BTC':
        return this.deriveBitcoinAddress(masterKey, index);
      case 'LTC':
        return this.deriveLitecoinAddress(masterKey, index);
      case 'ETH':
        return this.deriveEthereumAddress(masterKey, index);
      case 'BNB':
        return this.deriveBNBAddress(masterKey, index);
      case 'SOL':
        return this.deriveSolanaAddress(masterKey, index);
      case 'USDT':
        return this.deriveUSDTAddress(masterKey, index);
      case 'USDC':
        return this.deriveUSDCAddress(masterKey, index);
      default:
        throw new Error(`Unsupported currency: ${currency}`);
    }
  }

  /**
   * Derive Bitcoin address using BIP44
   */
  deriveBitcoinAddress(masterKey, index) {
    // BIP44: m/44'/0'/0'/0/index
    const purpose = masterKey.derive("m/44'/0'/0'/0/" + index);
    const keyPair = ECPair.fromPrivateKey(purpose.privateKey);

    // Generate P2PKH address for mainnet
    const { address } = require('bitcoinjs-lib').payments.p2pkh({
      pubkey: keyPair.publicKey,
      network: require('bitcoinjs-lib').networks.bitcoin
    });

    return {
      address,
      publicKey: keyPair.publicKey.toString('hex'),
      privateKey: keyPair.privateKey.toString('hex'),
      path: `m/44'/0'/0'/0/${index}`
    };
  }

  /**
   * Derive Litecoin address using BIP44
   */
  deriveLitecoinAddress(masterKey, index) {
    // BIP44: m/44'/2'/0'/0/index (Litecoin uses coin type 2)
    const purpose = masterKey.derive("m/44'/2'/0'/0/" + index);
    const keyPair = ECPair.fromPrivateKey(purpose.privateKey);

    // Generate P2PKH address for Litecoin mainnet
    const { address } = require('bitcoinjs-lib').payments.p2pkh({
      pubkey: keyPair.publicKey,
      network: require('bitcoinjs-lib').networks.litecoin
    });

    return {
      address,
      publicKey: keyPair.publicKey.toString('hex'),
      privateKey: keyPair.privateKey.toString('hex'),
      path: `m/44'/2'/0'/0/${index}`
    };
  }

  /**
   * Derive Ethereum address
   */
  deriveEthereumAddress(masterKey, index) {
    // BIP44: m/44'/60'/0'/0/index (Ethereum uses coin type 60)
    const purpose = masterKey.derive("m/44'/60'/0'/0/" + index);
    const privateKey = purpose.privateKey.toString('hex');

    const web3 = new Web3();
    const account = web3.eth.accounts.privateKeyToAccount('0x' + privateKey);

    return {
      address: account.address,
      publicKey: Buffer.from(account.publicKey.slice(2), 'hex'),
      privateKey: privateKey,
      path: `m/44'/60'/0'/0/${index}`
    };
  }

  /**
   * Derive BNB Smart Chain address (same as Ethereum)
   */
  deriveBNBAddress(masterKey, index) {
    return this.deriveEthereumAddress(masterKey, index);
  }

  /**
   * Derive Solana address
   */
  deriveSolanaAddress(masterKey, index) {
    // BIP44: m/44'/501'/0'/0/index (Solana uses coin type 501)
    const purpose = masterKey.derive("m/44'/501'/0'/0/" + index);
    const privateKey = purpose.privateKey;
    const publicKey = purpose.publicKey;

    const keypair = {
      publicKey: new PublicKey(publicKey),
      secretKey: Buffer.concat([privateKey, publicKey])
    };

    return {
      address: keypair.publicKey.toBase58(),
      publicKey: publicKey.toString('hex'),
      privateKey: privateKey.toString('hex'),
      secretKey: keypair.secretKey.toString('hex'),
      path: `m/44'/501'/0'/0/${index}`
    };
  }

  /**
   * Derive USDT address (defaults to Ethereum)
   */
  deriveUSDTAddress(masterKey, index) {
    return this.deriveEthereumAddress(masterKey, index);
  }

  /**
   * Derive USDC address (defaults to Ethereum)
   */
  deriveUSDCAddress(masterKey, index) {
    return this.deriveEthereumAddress(masterKey, index);
  }

  /**
   * Validate address format for specific currency
   */
  validateAddress(currency, address) {
    switch (currency) {
      case 'BTC':
        return this.validateBitcoinAddress(address);
      case 'LTC':
        return this.validateLitecoinAddress(address);
      case 'ETH':
      case 'BNB':
      case 'USDT':
      case 'USDC':
        return this.validateEthereumAddress(address);
      case 'SOL':
        return this.validateSolanaAddress(address);
      default:
        throw new Error(`Unsupported currency: ${currency}`);
    }
  }

  /**
   * Validate Bitcoin address
   */
  validateBitcoinAddress(address) {
    const bitcoin = require('bitcoinjs-lib');
    try {
      bitcoin.address.fromBase58Check(address);
      return true;
    } catch {
      try {
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
    const bitcoin = require('bitcoinjs-lib');
    try {
      bitcoin.address.fromBase58Check(address);
      return true;
    } catch {
      try {
        bitcoin.address.fromBech32(address);
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Validate Ethereum/BSC address
   */
  validateEthereumAddress(address) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  /**
   * Validate Solana address
   */
  validateSolanaAddress(address) {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get network info for currency
   */
  getNetworkInfo(currency) {
    return this.networks[currency] || null;
  }

  /**
   * Generate multiple addresses for different currencies
   */
  generateMultiChainAddresses(masterKeyJson, startIndex = 0, count = 1) {
    const addresses = {};

    for (const currency of Object.keys(this.networks)) {
      addresses[currency] = [];

      for (let i = 0; i < count; i++) {
        const address = this.deriveAddress(currency, masterKeyJson, startIndex + i);
        addresses[currency].push({
          index: startIndex + i,
          address: address.address,
          path: address.path
        });
      }
    }

    return addresses;
  }
}

module.exports = new WalletService();
