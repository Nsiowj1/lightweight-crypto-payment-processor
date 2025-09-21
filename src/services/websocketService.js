const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = require('../config/environment');

class WebSocketService {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // Store connected clients
    this.subscriptions = new Map(); // Store client subscriptions
    this.isRunning = false;
    this.heartbeatInterval = null;
  }

  /**
   * Start WebSocket server
   */
  start(server) {
    if (this.isRunning) {
      console.log('WebSocket service is already running');
      return;
    }

    console.log('🚀 Starting WebSocket service...');

    // Create WebSocket server
    this.wss = new WebSocket.Server({ server });

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });

    // Start heartbeat to keep connections alive
    this.startHeartbeat();

    this.isRunning = true;
    console.log('✅ WebSocket service started');
  }

  /**
   * Handle new WebSocket connection
   */
  handleConnection(ws, req) {
    const clientId = this.generateClientId();
    this.clients.set(clientId, {
      ws,
      id: clientId,
      connectedAt: new Date(),
      subscriptions: new Set(),
      isAlive: true
    });

    console.log(`🔗 WebSocket client connected: ${clientId}`);

    // Send welcome message
    this.sendMessage(ws, {
      type: 'welcome',
      clientId,
      timestamp: new Date().toISOString(),
      message: 'Connected to Lightweight Crypto Payment Processor WebSocket'
    });

    // Handle messages from client
    ws.on('message', (data) => {
      this.handleClientMessage(clientId, data);
    });

    // Handle client disconnect
    ws.on('close', () => {
      this.handleDisconnection(clientId);
    });

    // Handle pong responses
    ws.on('pong', () => {
      const client = this.clients.get(clientId);
      if (client) {
        client.isAlive = true;
      }
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error(`WebSocket client ${clientId} error:`, error);
      this.handleDisconnection(clientId);
    });
  }

  /**
   * Handle message from client
   */
  handleClientMessage(clientId, data) {
    try {
      const message = JSON.parse(data.toString());
      const client = this.clients.get(clientId);

      if (!client) {
        return;
      }

      switch (message.type) {
        case 'subscribe':
          this.handleSubscription(clientId, message);
          break;
        case 'unsubscribe':
          this.handleUnsubscription(clientId, message);
          break;
        case 'ping':
          this.sendMessage(client.ws, {
            type: 'pong',
            timestamp: new Date().toISOString()
          });
          break;
        default:
          this.sendMessage(client.ws, {
            type: 'error',
            message: 'Unknown message type',
            timestamp: new Date().toISOString()
          });
      }
    } catch (error) {
      console.error(`Error handling message from client ${clientId}:`, error);
      this.sendMessage(this.clients.get(clientId)?.ws, {
        type: 'error',
        message: 'Invalid message format',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Handle subscription request
   */
  handleSubscription(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) return;

    const { channel, paymentId, merchantId } = message;

    if (!channel) {
      this.sendMessage(client.ws, {
        type: 'error',
        message: 'Channel is required for subscription',
        timestamp: new Date().toISOString()
      });
      return;
    }

    // Add to client's subscriptions
    client.subscriptions.add(channel);

    // Add to global subscriptions
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    this.subscriptions.get(channel).add(clientId);

    // Subscribe to Supabase real-time updates if needed
    if (channel.startsWith('payment:') || channel.startsWith('merchant:')) {
      this.subscribeToSupabase(clientId, channel, paymentId, merchantId);
    }

    this.sendMessage(client.ws, {
      type: 'subscribed',
      channel,
      timestamp: new Date().toISOString()
    });

    console.log(`📡 Client ${clientId} subscribed to ${channel}`);
  }

  /**
   * Handle unsubscription request
   */
  handleUnsubscription(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) return;

    const { channel } = message;

    if (channel) {
      // Remove specific subscription
      client.subscriptions.delete(channel);
      this.subscriptions.get(channel)?.delete(clientId);

      if (this.subscriptions.get(channel)?.size === 0) {
        this.subscriptions.delete(channel);
      }

      this.sendMessage(client.ws, {
        type: 'unsubscribed',
        channel,
        timestamp: new Date().toISOString()
      });
    } else {
      // Remove all subscriptions
      client.subscriptions.forEach(channel => {
        this.subscriptions.get(channel)?.delete(clientId);
        if (this.subscriptions.get(channel)?.size === 0) {
          this.subscriptions.delete(channel);
        }
      });
      client.subscriptions.clear();

      this.sendMessage(client.ws, {
        type: 'unsubscribed_all',
        timestamp: new Date().toISOString()
      });
    }

    console.log(`📡 Client ${clientId} unsubscribed from ${channel || 'all channels'}`);
  }

  /**
   * Subscribe to Supabase real-time updates
   */
  async subscribeToSupabase(clientId, channel, paymentId, merchantId) {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      if (channel.startsWith('payment:')) {
        const subscription = supabase
          .channel(`payment:${paymentId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'payments',
              filter: paymentId ? `id=eq.${paymentId}` : undefined
            },
            (payload) => {
              this.broadcastToChannel(channel, {
                type: 'payment_update',
                data: payload.new,
                old_data: payload.old,
                event: payload.eventType,
                timestamp: new Date().toISOString()
              });
            }
          )
          .subscribe();

        // Store subscription for cleanup
        const client = this.clients.get(clientId);
        if (client) {
          client.supabaseSubscriptions = client.supabaseSubscriptions || [];
          client.supabaseSubscriptions.push(subscription);
        }
      }

      if (channel.startsWith('merchant:')) {
        const subscription = supabase
          .channel(`merchant:${merchantId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'payments',
              filter: merchantId ? `merchant_id=eq.${merchantId}` : undefined
            },
            (payload) => {
              this.broadcastToChannel(channel, {
                type: 'merchant_payment_update',
                data: payload.new,
                old_data: payload.old,
                event: payload.eventType,
                timestamp: new Date().toISOString()
              });
            }
          )
          .subscribe();

        // Store subscription for cleanup
        const client = this.clients.get(clientId);
        if (client) {
          client.supabaseSubscriptions = client.supabaseSubscriptions || [];
          client.supabaseSubscriptions.push(subscription);
        }
      }

    } catch (error) {
      console.error('Error subscribing to Supabase:', error);
    }
  }

  /**
   * Broadcast message to all clients subscribed to a channel
   */
  broadcastToChannel(channel, message) {
    const clientIds = this.subscriptions.get(channel);
    if (!clientIds) return;

    clientIds.forEach(clientId => {
      const client = this.clients.get(clientId);
      if (client && client.ws.readyState === WebSocket.OPEN) {
        this.sendMessage(client.ws, message);
      }
    });
  }

  /**
   * Send message to specific client
   */
  sendMessage(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Handle client disconnection
   */
  handleDisconnection(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    console.log(`🔌 WebSocket client disconnected: ${clientId}`);

    // Clean up subscriptions
    client.subscriptions.forEach(channel => {
      this.subscriptions.get(channel)?.delete(clientId);
      if (this.subscriptions.get(channel)?.size === 0) {
        this.subscriptions.delete(channel);
      }
    });

    // Clean up Supabase subscriptions
    if (client.supabaseSubscriptions) {
      client.supabaseSubscriptions.forEach(sub => {
        sub.unsubscribe();
      });
    }

    // Remove client
    this.clients.delete(clientId);
  }

  /**
   * Start heartbeat to check client connections
   */
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (!ws.isAlive) {
          return ws.terminate();
        }

        ws.isAlive = false;
        ws.ping();
      });
    }, 30000); // Check every 30 seconds
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Get WebSocket service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      clientCount: this.clients.size,
      subscriptionCount: this.subscriptions.size,
      channels: Array.from(this.subscriptions.keys()),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Broadcast to all connected clients
   */
  broadcast(message) {
    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        this.sendMessage(client.ws, message);
      }
    });
  }

  /**
   * Generate unique client ID
   */
  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Stop WebSocket service
   */
  stop() {
    console.log('🛑 Stopping WebSocket service...');

    // Stop heartbeat
    this.stopHeartbeat();

    // Close all client connections
    this.clients.forEach((client, clientId) => {
      this.handleDisconnection(clientId);
    });

    // Close server
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    this.isRunning = false;
    console.log('✅ WebSocket service stopped');
  }
}

module.exports = new WebSocketService();
