// Core client (platform agnostic)
export { SocketClient } from './core/SocketClient';
export { EventEmitter } from './core/EventEmitter';
export { ConnectionManager, ConnectionState } from './core/ConnectionManager';

// React hooks and components
export * from './react';

// Re-export shared types for convenience
export * from 'sockr-shared';