import express from 'express';
import { createServer } from 'http';
import { SocketServer } from '../core/SocketServer';
import { User } from 'sockr-shared';

describe('SocketServer Integration', () => {
  const authHandler = async (token: string): Promise<User | null> => {
    if (token === 'valid') {
      return {
        id: 'user-1',
        socketId: '',
        connectedAt: Date.now(),
      };
    }
    return null;
  };

  describe('attachToExpress', () => {
    it('should attach to Express app', () => {
      const app = express();
      const socketServer = new SocketServer()
        .attachToExpress(app)
        .useAuth(authHandler);

      expect(socketServer.getIO()).toBeDefined();
    });
  });

  describe('attach', () => {
    it('should attach to existing HTTP server', () => {
      const app = express();
      const httpServer = createServer(app);
      
      const socketServer = new SocketServer()
        .attach(httpServer)
        .useAuth(authHandler);

      expect(socketServer.getIO()).toBeDefined();
    });
  });

  describe('createStandalone', () => {
    it('should create standalone server', () => {
      const socketServer = new SocketServer()
        .createStandalone()
        .useAuth(authHandler);

      expect(socketServer.getIO()).toBeDefined();
    });
  });

  describe('listen', () => {
    it('should warn when calling listen on attached server', async () => {
      const app = express();
      const httpServer = createServer(app);
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const socketServer = new SocketServer()
        .attach(httpServer);

      await socketServer.listen(3000);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('attached to an existing HTTP server')
      );

      consoleWarnSpy.mockRestore();
    });
  });
});