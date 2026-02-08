type EventHandler = (...args: any[]) => void;

export class EventEmitter {
  private events: Map<string, EventHandler[]> = new Map();

  public on(event: string, handler: EventHandler): () => void {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    
    const handlers = this.events.get(event)!;
    handlers.push(handler);

    // Return cleanup function
    return () => this.off(event, handler);
  }

  public off(event: string, handler: EventHandler): void {
    const handlers = this.events.get(event);
    if (!handlers) return;

    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }

    if (handlers.length === 0) {
      this.events.delete(event);
    }
  }

  public emit(event: string, ...args: any[]): void {
    const handlers = this.events.get(event);
    if (!handlers) return;

    handlers.forEach((handler) => {
      try {
        handler(...args);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    });
  }

  public removeAllListeners(event?: string): void {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
  }
}