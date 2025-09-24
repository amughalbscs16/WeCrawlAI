import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface WebSocketMessage {
  type: string;
  payload: any;
  timestamp: string;
  clientId?: string;
}

interface WebSocketState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  clientId: string | null;
  subscriptions: string[];
  messages: WebSocketMessage[];
  connectionAttempts: number;
  lastHeartbeat: string | null;
}

const initialState: WebSocketState = {
  connected: false,
  connecting: false,
  error: null,
  clientId: null,
  subscriptions: [],
  messages: [],
  connectionAttempts: 0,
  lastHeartbeat: null,
};

const websocketSlice = createSlice({
  name: 'websocket',
  initialState,
  reducers: {
    connectionStart: (state) => {
      state.connecting = true;
      state.error = null;
      state.connectionAttempts += 1;
    },
    connectionSuccess: (state, action: PayloadAction<{ clientId: string }>) => {
      state.connected = true;
      state.connecting = false;
      state.clientId = action.payload.clientId;
      state.error = null;
      state.lastHeartbeat = new Date().toISOString();
    },
    connectionFailure: (state, action: PayloadAction<string>) => {
      state.connected = false;
      state.connecting = false;
      state.error = action.payload;
      state.clientId = null;
    },
    connectionClosed: (state) => {
      state.connected = false;
      state.connecting = false;
      state.clientId = null;
      state.subscriptions = [];
    },
    messageReceived: (state, action: PayloadAction<WebSocketMessage>) => {
      state.messages.unshift(action.payload);

      // Keep only last 100 messages
      if (state.messages.length > 100) {
        state.messages = state.messages.slice(0, 100);
      }

      // Update heartbeat timestamp for ping messages
      if (action.payload.type === 'pong') {
        state.lastHeartbeat = action.payload.timestamp;
      }
    },
    subscribe: (state, action: PayloadAction<string>) => {
      if (!state.subscriptions.includes(action.payload)) {
        state.subscriptions.push(action.payload);
      }
    },
    unsubscribe: (state, action: PayloadAction<string>) => {
      state.subscriptions = state.subscriptions.filter(sub => sub !== action.payload);
    },
    clearMessages: (state) => {
      state.messages = [];
    },
    clearError: (state) => {
      state.error = null;
    },
    resetConnectionAttempts: (state) => {
      state.connectionAttempts = 0;
    },
  },
});

export const {
  connectionStart,
  connectionSuccess,
  connectionFailure,
  connectionClosed,
  messageReceived,
  subscribe,
  unsubscribe,
  clearMessages,
  clearError,
  resetConnectionAttempts,
} = websocketSlice.actions;

export default websocketSlice.reducer;