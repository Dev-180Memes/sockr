export interface Message {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: number;
  delivered: boolean;
  metadata?: Record<string, any>;
}

export interface MessageOptions {
  requireAcknowledgment?: boolean;
  timeout?: number;
}