export enum SocketEvent {
  // Connection events
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  ERROR = 'error',

  // Authentication
  AUTHENTICATE = 'authenticate',
  AUTHENTICATED = 'authenticated',
  AUTH_ERROR = 'auth_error',

  // Presence
  USER_ONLINE = 'user_online',
  USER_OFFLINE = 'user_offline',
  GET_ONLINE_STATUS = 'get_online_status',
  ONLINE_STATUS = 'online_status',

  // Messaging
  SEND_MESSAGE = 'send_message',
  RECEIVE_MESSAGE = 'receive_message',
  MESSAGE_DELIVERED = 'message_delivered',
  MESSAGE_ERROR = 'message_error',
  TYPING_START = 'typing_start',
  TYPING_STOP = 'typing_stop',
}

export interface EventPayloads {
  [SocketEvent.AUTHENTICATE]: {
    token: string;
  };

  [SocketEvent.AUTHENTICATED]: {
    userId: string;
    socketId: string;
  };

  [SocketEvent.AUTH_ERROR]: {
    message: string;
  };

  [SocketEvent.USER_ONLINE]: {
    userId: string;
  };

  [SocketEvent.USER_OFFLINE]: {
    userId: string;
  };

  [SocketEvent.GET_ONLINE_STATUS]: {
    userIds: string[];
  };

  [SocketEvent.ONLINE_STATUS]: {
    statuses: Record<string, boolean>;
  };

  [SocketEvent.SEND_MESSAGE]: {
    to: string;
    content: string;
    metadata?: Record<string, any>;
  };

  [SocketEvent.RECEIVE_MESSAGE]: {
    from: string;
    content: string;
    timestamp: number;
    messageId: string;
    metadata?: Record<string, any>;
  };

  [SocketEvent.MESSAGE_DELIVERED]: {
    messageId: string;
  };

  [SocketEvent.MESSAGE_ERROR]: {
    messageId: string;
    error: string;
  };

  [SocketEvent.TYPING_START]: {
    from: string;
  };

  [SocketEvent.TYPING_STOP]: {
    from: string;
  };
}