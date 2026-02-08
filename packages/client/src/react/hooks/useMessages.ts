import { useState, useCallback } from 'react';
import { useSocketEvent } from './useSocketEvent';
import { EventPayloads, SocketEvent } from 'sockr-shared';

interface Message {
  id: string;
  from: string;
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

interface UseMessagesReturn {
  messages: Message[];
  addMessage: (message: Message) => void;
  clearMessages: () => void;
}

export const useMessages = (): UseMessagesReturn => {
  const [messages, setMessages] = useState<Message[]>([]);

  const addMessage = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  // Listen for incoming messages
  useSocketEvent(
    'message',
    (data: EventPayloads[SocketEvent.RECEIVE_MESSAGE]) => {
      addMessage({
        id: data.messageId,
        from: data.from,
        content: data.content,
        timestamp: data.timestamp,
        metadata: data.metadata,
      });
    }
  );

  return {
    messages,
    addMessage,
    clearMessages,
  };
};