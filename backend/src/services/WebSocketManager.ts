import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export interface WebSocketMessage {
  type: string;
  payload: any;
  timestamp: string;
  clientId?: string;
}

export interface ConnectedClient {
  id: string;
  ws: WebSocket;
  subscriptions: Set<string>;
  lastActivity: Date;
}

export class WebSocketManager {
  private static instance: WebSocketManager | null = null;
  private clients: Map<string, ConnectedClient> = new Map();
  private rooms: Map<string, Set<string>> = new Map();

  constructor(private wss: WebSocketServer) {
    this.setupWebSocketServer();
    this.startHeartbeat();
    WebSocketManager.instance = this;
  }

  public static getInstance(): WebSocketManager | null {
    return WebSocketManager.instance;
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientId = uuidv4();
      const client: ConnectedClient = {
        id: clientId,
        ws,
        subscriptions: new Set(),
        lastActivity: new Date()
      };

      this.clients.set(clientId, client);

      logger.info('WebSocket client connected', {
        clientId,
        clientsCount: this.clients.size,
        ip: req.socket.remoteAddress
      });

      // Send welcome message
      this.sendToClient(clientId, {
        type: 'connection',
        payload: {
          clientId,
          message: 'Connected to AI Testing Agent',
          timestamp: new Date().toISOString()
        }
      });

      // Handle messages
      ws.on('message', (data: Buffer) => {
        try {
          const message: WebSocketMessage = JSON.parse(data.toString());
          this.handleClientMessage(clientId, message);
        } catch (error) {
          logger.error('Invalid WebSocket message', {
            clientId,
            error: error.message,
            data: data.toString()
          });

          this.sendToClient(clientId, {
            type: 'error',
            payload: {
              message: 'Invalid message format',
              error: 'Message must be valid JSON'
            }
          });
        }
      });

      // Handle client disconnect
      ws.on('close', () => {
        this.handleClientDisconnect(clientId);
      });

      // Handle errors
      ws.on('error', (error) => {
        logger.error('WebSocket client error', {
          clientId,
          error: error.message
        });
        this.handleClientDisconnect(clientId);
      });
    });
  }

  private handleClientMessage(clientId: string, message: WebSocketMessage): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.lastActivity = new Date();

    logger.debug('WebSocket message received', {
      clientId,
      type: message.type,
      payload: message.payload
    });

    switch (message.type) {
      case 'subscribe':
        this.handleSubscription(clientId, message.payload);
        break;

      case 'unsubscribe':
        this.handleUnsubscription(clientId, message.payload);
        break;

      case 'ping':
        this.sendToClient(clientId, {
          type: 'pong',
          payload: {
            timestamp: new Date().toISOString()
          }
        });
        break;

      default:
        logger.warn('Unknown WebSocket message type', {
          clientId,
          type: message.type
        });
        break;
    }
  }

  private handleSubscription(clientId: string, payload: any): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const { room } = payload;
    if (!room) {
      this.sendToClient(clientId, {
        type: 'error',
        payload: {
          message: 'Room name is required for subscription'
        }
      });
      return;
    }

    // Add client to room
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room)!.add(clientId);
    client.subscriptions.add(room);

    logger.info('Client subscribed to room', {
      clientId,
      room,
      roomSize: this.rooms.get(room)!.size
    });

    this.sendToClient(clientId, {
      type: 'subscribed',
      payload: {
        room,
        message: `Subscribed to ${room}`
      }
    });
  }

  private handleUnsubscription(clientId: string, payload: any): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const { room } = payload;
    if (!room) return;

    // Remove client from room
    if (this.rooms.has(room)) {
      this.rooms.get(room)!.delete(clientId);
      if (this.rooms.get(room)!.size === 0) {
        this.rooms.delete(room);
      }
    }
    client.subscriptions.delete(room);

    logger.info('Client unsubscribed from room', {
      clientId,
      room
    });

    this.sendToClient(clientId, {
      type: 'unsubscribed',
      payload: {
        room,
        message: `Unsubscribed from ${room}`
      }
    });
  }

  private handleClientDisconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove from all rooms
    for (const room of client.subscriptions) {
      if (this.rooms.has(room)) {
        this.rooms.get(room)!.delete(clientId);
        if (this.rooms.get(room)!.size === 0) {
          this.rooms.delete(room);
        }
      }
    }

    this.clients.delete(clientId);

    logger.info('WebSocket client disconnected', {
      clientId,
      clientsCount: this.clients.size
    });
  }

  public sendToClient(clientId: string, message: Partial<WebSocketMessage>): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    const fullMessage: WebSocketMessage = {
      type: message.type || 'message',
      payload: message.payload || {},
      timestamp: new Date().toISOString(),
      clientId
    };

    try {
      client.ws.send(JSON.stringify(fullMessage));
      return true;
    } catch (error) {
      logger.error('Failed to send message to client', {
        clientId,
        error: error.message
      });
      this.handleClientDisconnect(clientId);
      return false;
    }
  }

  public broadcastToRoom(room: string, message: Partial<WebSocketMessage>): number {
    const roomClients = this.rooms.get(room);
    if (!roomClients) return 0;

    let sentCount = 0;
    for (const clientId of roomClients) {
      if (this.sendToClient(clientId, message)) {
        sentCount++;
      }
    }

    logger.debug('Broadcast to room', {
      room,
      clientsCount: roomClients.size,
      sentCount,
      messageType: message.type
    });

    return sentCount;
  }

  public broadcastToAll(message: Partial<WebSocketMessage>): number {
    let sentCount = 0;
    for (const clientId of this.clients.keys()) {
      if (this.sendToClient(clientId, message)) {
        sentCount++;
      }
    }

    logger.debug('Broadcast to all clients', {
      totalClients: this.clients.size,
      sentCount,
      messageType: message.type
    });

    return sentCount;
  }

  private startHeartbeat(): void {
    setInterval(() => {
      const now = new Date();
      const timeout = 60000; // 1 minute timeout

      for (const [clientId, client] of this.clients.entries()) {
        if (now.getTime() - client.lastActivity.getTime() > timeout) {
          logger.info('Closing inactive WebSocket connection', {
            clientId,
            lastActivity: client.lastActivity
          });
          client.ws.close();
          this.handleClientDisconnect(clientId);
        }
      }
    }, 30000); // Check every 30 seconds
  }

  public getStats(): {
    clientsCount: number;
    roomsCount: number;
    rooms: { [room: string]: number };
  } {
    const rooms: { [room: string]: number } = {};
    for (const [room, clients] of this.rooms.entries()) {
      rooms[room] = clients.size;
    }

    return {
      clientsCount: this.clients.size,
      roomsCount: this.rooms.size,
      rooms
    };
  }
}