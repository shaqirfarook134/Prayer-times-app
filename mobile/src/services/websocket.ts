import { io, Socket } from 'socket.io-client';

const API_BASE_URL = 'https://prayer-times-api-uddr.onrender.com';

class WebSocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private connectionStateListeners: ((connected: boolean) => void)[] = [];

  connect() {
    if (this.socket?.connected) {
      console.log('🔌 WebSocket already connected');
      return;
    }

    console.log('🔌 Connecting to WebSocket server...');

    this.socket = io(API_BASE_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000, // Max 30s delay
      reconnectionAttempts: Infinity, // Unlimited reconnection attempts
    });

    this.socket.on('connect', () => {
      console.log('✅ WebSocket connected:', this.socket?.id);
      this.reconnectAttempts = 0;
      this.notifyConnectionStateChange(true);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ WebSocket disconnected:', reason);
      this.notifyConnectionStateChange(false);
    });

    this.socket.on('connect_error', (error) => {
      this.reconnectAttempts++;
      const delay = Math.min(Math.pow(2, this.reconnectAttempts) * 1000, 30000);
      console.error(`🔴 WebSocket connection error (attempt ${this.reconnectAttempts}): ${error.message}, retrying in ${delay}ms`);
      this.notifyConnectionStateChange(false);
    });
  }

  // Reset reconnection counter (called when network becomes available)
  resetReconnection() {
    console.log('🔄 Resetting WebSocket reconnection counter');
    this.reconnectAttempts = 0;
    if (this.socket && !this.socket.connected) {
      this.socket.connect();
    }
  }

  // Notify listeners about connection state changes
  private notifyConnectionStateChange(connected: boolean) {
    this.connectionStateListeners.forEach((listener) => listener(connected));
  }

  // Add connection state listener
  onConnectionStateChange(listener: (connected: boolean) => void) {
    this.connectionStateListeners.push(listener);
  }

  // Remove connection state listener
  removeConnectionStateListener(listener: (connected: boolean) => void) {
    this.connectionStateListeners = this.connectionStateListeners.filter((l) => l !== listener);
  }

  disconnect() {
    if (this.socket) {
      console.log('🔌 Disconnecting WebSocket...');
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Listen for masjid added event
  onMasjidAdded(callback: (masjid: any) => void) {
    if (!this.socket) {
      console.warn('⚠️  WebSocket not connected');
      return;
    }

    this.socket.on('masjid_added', (data) => {
      console.log('📡 Received masjid_added event:', data);
      callback(data);
    });
  }

  // Listen for masjid deleted event
  onMasjidDeleted(callback: (data: { id: number }) => void) {
    if (!this.socket) {
      console.warn('⚠️  WebSocket not connected');
      return;
    }

    this.socket.on('masjid_deleted', (data) => {
      console.log('📡 Received masjid_deleted event:', data);
      callback(data);
    });
  }

  // Listen for prayer times updated event
  onPrayerTimesUpdated(callback: (data: { masjidId: number; prayerTimes: any }) => void) {
    if (!this.socket) {
      console.warn('⚠️  WebSocket not connected');
      return;
    }

    this.socket.on('prayer_times_updated', (data) => {
      console.log('📡 Received prayer_times_updated event for masjid:', data.masjidId);
      callback(data);
    });
  }

  // Remove all event listeners
  removeAllListeners() {
    if (this.socket) {
      this.socket.off('masjid_added');
      this.socket.off('masjid_deleted');
      this.socket.off('prayer_times_updated');
    }
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

export default new WebSocketService();
