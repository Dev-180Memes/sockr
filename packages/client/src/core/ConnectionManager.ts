export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  AUTHENTICATED = 'authenticated',
  ERROR = 'error',
  RECONNECTING = 'reconnecting',
}

export class ConnectionManager {
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private listeners: Set<(state: ConnectionState) => void> = new Set();
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number;

  constructor(maxReconnectAttempts: number = 5) {
    this.maxReconnectAttempts = maxReconnectAttempts;
  }

  public getState(): ConnectionState {
    return this.state;
  }

  public setState(state: ConnectionState): void {
    if (this.state !== state) {
      this.state = state;
      this.notifyListeners();
    }
  }

  public isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED || 
           this.state === ConnectionState.AUTHENTICATED;
  }

  public isAuthenticated(): boolean {
    return this.state === ConnectionState.AUTHENTICATED;
  }

  public onStateChange(listener: (state: ConnectionState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener(this.state);
      } catch (error) {
        console.error('Error in connection state listener:', error);
      }
    });
  }

  public incrementReconnectAttempts(): number {
    this.reconnectAttempts++;
    return this.reconnectAttempts;
  }

  public resetReconnectAttempts(): void {
    this.reconnectAttempts = 0;
  }

  public getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  public canReconnect(): boolean {
    return this.reconnectAttempts < this.maxReconnectAttempts;
  }

  public reset(): void {
    this.state = ConnectionState.DISCONNECTED;
    this.reconnectAttempts = 0;
    this.listeners.clear();
  }
}