import { io, Socket } from 'socket.io-client';

const API_BASE_URL = 'https://prayer-times-api-uddr.onrender.com';

class WebSocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

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
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts,
    });

    this.socket.on('connect', () => {
      console.log('✅ WebSocket connected:', this.socket?.id);
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ WebSocket disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('🔴 WebSocket connection error:', error.message);
      this.reconnectAttempts++;

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.log('⚠️  Max reconnection attempts reached');
      }
    });
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
