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
  MESSAGE_READ = 'message_read',
  MESSAGE_ERROR = 'message_error',
  TYPING_START = 'typing_start',
  TYPING_STOP = 'typing_stop',

  GET_MESSAGE_HISTORY = 'get_message_history',
  MESSAGE_HISTORY = 'message_history',

  GROUP_CREATE = 'group_create',
  GROUP_CREATED = 'group_created',
  GROUP_CREATE_ERROR = 'group_create_error',

  GROUP_JOIN = 'group_join',
  GROUP_JOINED = 'group_joined',
  GROUP_JOIN_ERROR = 'group_join_error',

  GROUP_LEAVE = 'group_leave',
  GROUP_LEFT = 'group_left',

  GROUP_MEMBER_JOINED = 'group_member_joined',
  GROUP_MEMBER_LEFT = 'group_member_left',

  GET_GROUP_MEMBERS = 'get_group_members',
  GROUP_MEMBERS = 'group_members',

  GET_USER_GROUPS = 'get_user_groups',
  USER_GROUPS = 'user_groups',

  GROUP_SEND_MESSAGE = 'group_send_message',
  GROUP_RECEIVE_MESSAGE = 'group_receive_message',
  GROUP_MESSAGE_DELIVERED = 'group_message_delivered',
  GROUP_MESSAGE_READ = 'group_message_read',
  GROUP_MESSAGE_ERROR = 'group_message_error',
 
  GROUP_TYPING_START = 'group_typing_start',
  GROUP_TYPING_STOP = 'group_typing_stop',
 
  GET_GROUP_MESSAGE_HISTORY = 'get_group_message_history',
  GROUP_MESSAGE_HISTORY = 'group_message_history',
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

  [SocketEvent.MESSAGE_READ]: {
    messageId: string
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

  [SocketEvent.GET_MESSAGE_HISTORY]: {
    with: string;
    limit?: number;
    before?: number;
  };
  [SocketEvent.MESSAGE_HISTORY]: {
    conversationId: string;
    messages: import('./message').PersistedMessage[];
  };

  [SocketEvent.GROUP_CREATE]: {
    name: string;
    members?: string[];
    metadata?: Record<string, any>;
  };
  [SocketEvent.GROUP_CREATED]: {
    group: import('./group').Group;
  };
  [SocketEvent.GROUP_CREATE_ERROR]: { error: string };
 
  [SocketEvent.GROUP_JOIN]: { groupId: string };
  [SocketEvent.GROUP_JOINED]: {
    groupId: string;
    group: import('./group').Group;
    queuedMessages?: import('./message').PersistedMessage[];
  };
  [SocketEvent.GROUP_JOIN_ERROR]: { groupId: string; error: string };
 
  [SocketEvent.GROUP_LEAVE]: { groupId: string };
  [SocketEvent.GROUP_LEFT]: { groupId: string };
 
  [SocketEvent.GROUP_MEMBER_JOINED]: {
    groupId: string;
    member: import('./group').GroupMember;
  };
  [SocketEvent.GROUP_MEMBER_LEFT]: {
    groupId: string;
    userId: string;
  };
 
  [SocketEvent.GET_GROUP_MEMBERS]: { groupId: string };
  [SocketEvent.GROUP_MEMBERS]: {
    groupId: string;
    members: import('./group').GroupMember[];
  };
 
  [SocketEvent.GET_USER_GROUPS]: Record<string, never>;
  [SocketEvent.USER_GROUPS]: {
    groups: import('./group').Group[];
  };

  [SocketEvent.GROUP_SEND_MESSAGE]: {
    groupId: string;
    content: string;
    metadata?: Record<string, any>;
  };
  [SocketEvent.GROUP_RECEIVE_MESSAGE]: {
    groupId: string;
    messageId: string;
    from: string;
    content: string;
    timestamp: number;
    metadata?: Record<string, any>;
  };
  [SocketEvent.GROUP_MESSAGE_DELIVERED]: {
    groupId: string;
    messageId: string;
  };
  [SocketEvent.GROUP_MESSAGE_READ]: {
    groupId: string;
    messageId: string;
  };
  [SocketEvent.GROUP_MESSAGE_ERROR]: {
    groupId: string;
    messageId?: string;
    error: string;
  };
 
  [SocketEvent.GROUP_TYPING_START]: { groupId: string; from: string };
  [SocketEvent.GROUP_TYPING_STOP]: { groupId: string; from: string };
 
  [SocketEvent.GET_GROUP_MESSAGE_HISTORY]: {
    groupId: string;
    limit?: number;
    before?: number;
  };
  [SocketEvent.GROUP_MESSAGE_HISTORY]: {
    groupId: string;
    messages: import('./message').PersistedMessage[];
  };
}