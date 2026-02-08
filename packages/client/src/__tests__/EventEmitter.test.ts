import { EventEmitter } from '../core/EventEmitter';

describe('EventEmitter', () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    emitter = new EventEmitter();
  });

  describe('on', () => {
    it('should add event listener', () => {
      const handler = jest.fn();
      emitter.on('test', handler);
      emitter.emit('test', 'data');
      expect(handler).toHaveBeenCalledWith('data');
    });

    it('should return cleanup function', () => {
      const handler = jest.fn();
      const cleanup = emitter.on('test', handler);
      
      cleanup();
      emitter.emit('test', 'data');
      
      expect(handler).not.toHaveBeenCalled();
    });

    it('should support multiple handlers for same event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      emitter.on('test', handler1);
      emitter.on('test', handler2);
      emitter.emit('test', 'data');
      
      expect(handler1).toHaveBeenCalledWith('data');
      expect(handler2).toHaveBeenCalledWith('data');
    });
  });

  describe('off', () => {
    it('should remove event listener', () => {
      const handler = jest.fn();
      emitter.on('test', handler);
      emitter.off('test', handler);
      emitter.emit('test', 'data');
      
      expect(handler).not.toHaveBeenCalled();
    });

    it('should not error when removing non-existent listener', () => {
      const handler = jest.fn();
      expect(() => emitter.off('test', handler)).not.toThrow();
    });
  });

  describe('emit', () => {
    it('should emit event with data', () => {
      const handler = jest.fn();
      emitter.on('test', handler);
      emitter.emit('test', 'data1', 'data2');
      
      expect(handler).toHaveBeenCalledWith('data1', 'data2');
    });

    it('should not error when emitting event with no listeners', () => {
      expect(() => emitter.emit('test', 'data')).not.toThrow();
    });

    it('should catch handler errors and continue', () => {
      const errorHandler = jest.fn(() => {
        throw new Error('Handler error');
      });
      const normalHandler = jest.fn();
      
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      emitter.on('test', errorHandler);
      emitter.on('test', normalHandler);
      emitter.emit('test', 'data');
      
      expect(errorHandler).toHaveBeenCalled();
      expect(normalHandler).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('removeAllListeners', () => {
    it('should remove all listeners for specific event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const handler3 = jest.fn();
      
      emitter.on('test1', handler1);
      emitter.on('test1', handler2);
      emitter.on('test2', handler3);
      
      emitter.removeAllListeners('test1');
      
      emitter.emit('test1', 'data');
      emitter.emit('test2', 'data');
      
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
      expect(handler3).toHaveBeenCalled();
    });

    it('should remove all listeners for all events', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      emitter.on('test1', handler1);
      emitter.on('test2', handler2);
      
      emitter.removeAllListeners();
      
      emitter.emit('test1', 'data');
      emitter.emit('test2', 'data');
      
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });
});