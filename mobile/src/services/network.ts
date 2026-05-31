import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export type ConnectionStatus = 'online' | 'offline' | 'connecting';

class NetworkService {
  private connectionStatus: ConnectionStatus = 'connecting';
  private listeners: ((status: ConnectionStatus) => void)[] = [];

  // Initialize network monitoring
  initialize() {
    console.log('🌐 Initializing network monitoring...');

    // Subscribe to network state changes
    NetInfo.addEventListener((state: NetInfoState) => {
      this.handleNetworkChange(state);
    });

    // Get initial network state asynchronously (non-blocking)
    NetInfo.fetch().then((state: NetInfoState) => {
      this.handleNetworkChange(state);
    }).catch((error) => {
      console.error('Failed to fetch initial network state:', error);
      // Assume online if we can't determine
      this.connectionStatus = 'online';
    });
  }

  // Handle network state changes
  private handleNetworkChange(state: NetInfoState) {
    const wasOffline = this.connectionStatus === 'offline';
    const newStatus: ConnectionStatus = state.isConnected && state.isInternetReachable !== false
      ? 'online'
      : 'offline';

    if (newStatus !== this.connectionStatus) {
      console.log(`🌐 Network status changed: ${this.connectionStatus} → ${newStatus}`);

      if (newStatus === 'online') {
        console.log(`📶 Network type: ${state.type}`);
      }

      this.connectionStatus = newStatus;
      this.notifyListeners(newStatus);

      // If network just came back online, trigger recovery
      if (wasOffline && newStatus === 'online') {
        this.onNetworkRestored();
      }
    }
  }

  // Called when network is restored
  private onNetworkRestored() {
    console.log('✅ Network restored! App should reconnect automatically.');
  }

  // Get current connection status
  getStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  // Check if currently online
  isOnline(): boolean {
    return this.connectionStatus === 'online';
  }

  // Add listener for connection status changes
  addListener(listener: (status: ConnectionStatus) => void) {
    this.listeners.push(listener);
  }

  // Remove listener
  removeListener(listener: (status: ConnectionStatus) => void) {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  // Notify all listeners
  private notifyListeners(status: ConnectionStatus) {
    this.listeners.forEach((listener) => listener(status));
  }
}

export default new NetworkService();
