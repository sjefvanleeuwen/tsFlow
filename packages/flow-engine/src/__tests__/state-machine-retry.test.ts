import { describe, it, expect, vi } from 'vitest';
import { StateMachine, StateMachineConfig } from '../state-machine.js';
import type { TransitionAction } from '../state-machine.js';

describe('StateMachine - Retry Logic', () => {
  describe('Basic Retry', () => {
    it('should succeed without retry when action succeeds on first attempt', async () => {
      const action: TransitionAction = vi.fn().mockResolvedValue(undefined);
      
      const config: StateMachineConfig = {
        id: 'retry-test',
        initialState: 'idle',
        states: {
          idle: {
            name: 'idle',
            type: 'atomic',
            transitions: [
              {
                event: 'START',
                to: 'processing',
                action,
                retry: { maxAttempts: 3, delayMs: 10 }
              }
            ]
          },
          processing: {
            name: 'processing',
            type: 'final'
          }
        }
      };

      const machine = new StateMachine(config);
      const result = await machine.executeTransition('idle', 'START', {});

      expect(result.success).toBe(true);
      expect(result.toState).toBe('processing');
      expect(action).toHaveBeenCalledTimes(1);
    });

    it('should retry and succeed on second attempt with linear backoff', async () => {
      const action: TransitionAction = vi.fn()
        .mockRejectedValueOnce(new Error('Transient failure'))
        .mockResolvedValueOnce(undefined);
      
      const config: StateMachineConfig = {
        id: 'retry-test-linear',
        initialState: 'idle',
        states: {
          idle: {
            name: 'idle',
            type: 'atomic',
            transitions: [
              {
                event: 'START',
                to: 'processing',
                action,
                retry: { maxAttempts: 2, backoff: 'linear', delayMs: 10 }
              }
            ]
          },
          processing: {
            name: 'processing',
            type: 'final'
          }
        }
      };

      const startTime = Date.now();
      const machine = new StateMachine(config);
      const result = await machine.executeTransition('idle', 'START', {});
      const elapsed = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.toState).toBe('processing');
      expect(action).toHaveBeenCalledTimes(2);
      // Linear backoff: attempt 0 fails, delay 10ms, attempt 1 succeeds
      expect(elapsed).toBeGreaterThanOrEqual(10);
    });

    it('should retry and succeed on third attempt with exponential backoff', async () => {
      const action: TransitionAction = vi.fn()
        .mockRejectedValueOnce(new Error('Failure 1'))
        .mockRejectedValueOnce(new Error('Failure 2'))
        .mockResolvedValueOnce(undefined);
      
      const config: StateMachineConfig = {
        id: 'retry-test-exponential',
        initialState: 'idle',
        states: {
          idle: {
            name: 'idle',
            type: 'atomic',
            transitions: [
              {
                event: 'START',
                to: 'processing',
                action,
                retry: { maxAttempts: 3, backoff: 'exponential', delayMs: 10 }
              }
            ]
          },
          processing: {
            name: 'processing',
            type: 'final'
          }
        }
      };

      const startTime = Date.now();
      const machine = new StateMachine(config);
      const result = await machine.executeTransition('idle', 'START', {});
      const elapsed = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.toState).toBe('processing');
      expect(action).toHaveBeenCalledTimes(3);
      // Exponential backoff: attempt 0 fails, delay 10ms, attempt 1 fails, delay 20ms, attempt 2 succeeds
      // Total delay should be at least 30ms
      expect(elapsed).toBeGreaterThanOrEqual(30);
    });

    it('should fail after exhausting all retry attempts', async () => {
      const action: TransitionAction = vi.fn()
        .mockRejectedValue(new Error('Persistent failure'));
      
      const config: StateMachineConfig = {
        id: 'retry-test-fail',
        initialState: 'idle',
        states: {
          idle: {
            name: 'idle',
            type: 'atomic',
            transitions: [
              {
                event: 'START',
                to: 'processing',
                action,
                retry: { maxAttempts: 2, delayMs: 10 }
              }
            ]
          },
          processing: {
            name: 'processing',
            type: 'final'
          }
        }
      };

      const machine = new StateMachine(config);
      const result = await machine.executeTransition('idle', 'START', {});

      expect(result.success).toBe(false);
      expect(result.toState).toBe('idle'); // Should stay in current state
      expect(result.error?.message).toBe('Persistent failure');
      expect(action).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe('Retry Configuration', () => {
    it('should not retry when maxAttempts is 0 (default)', async () => {
      const action: TransitionAction = vi.fn()
        .mockRejectedValue(new Error('Failure'));
      
      const config: StateMachineConfig = {
        id: 'no-retry',
        initialState: 'idle',
        states: {
          idle: {
            name: 'idle',
            type: 'atomic',
            transitions: [
              {
                event: 'START',
                to: 'processing',
                action
                // No retry config - defaults to maxAttempts: 0
              }
            ]
          },
          processing: {
            name: 'processing',
            type: 'final'
          }
        }
      };

      const machine = new StateMachine(config);
      const result = await machine.executeTransition('idle', 'START', {});

      expect(result.success).toBe(false);
      expect(action).toHaveBeenCalledTimes(1); // Only initial attempt
    });

    it('should use linear backoff by default', async () => {
      const action: TransitionAction = vi.fn()
        .mockRejectedValueOnce(new Error('Failure 1'))
        .mockRejectedValueOnce(new Error('Failure 2'))
        .mockResolvedValueOnce(undefined);
      
      const config: StateMachineConfig = {
        id: 'default-backoff',
        initialState: 'idle',
        states: {
          idle: {
            name: 'idle',
            type: 'atomic',
            transitions: [
              {
                event: 'START',
                to: 'processing',
                action,
                retry: { maxAttempts: 2, delayMs: 10 }
                // backoff not specified - defaults to 'linear'
              }
            ]
          },
          processing: {
            name: 'processing',
            type: 'final'
          }
        }
      };

      const startTime = Date.now();
      const machine = new StateMachine(config);
      const result = await machine.executeTransition('idle', 'START', {});
      const elapsed = Date.now() - startTime;

      expect(result.success).toBe(true);
      // Linear: 10ms (attempt 0→1), 20ms (attempt 1→2)
      expect(elapsed).toBeGreaterThanOrEqual(30);
      expect(elapsed).toBeLessThan(60); // Should not be exponential
    });

    it('should use 1000ms default delay', async () => {
      const action: TransitionAction = vi.fn()
        .mockRejectedValueOnce(new Error('Failure'))
        .mockResolvedValueOnce(undefined);
      
      const config: StateMachineConfig = {
        id: 'default-delay',
        initialState: 'idle',
        states: {
          idle: {
            name: 'idle',
            type: 'atomic',
            transitions: [
              {
                event: 'START',
                to: 'processing',
                action,
                retry: { maxAttempts: 1 }
                // delayMs not specified - defaults to 1000
              }
            ]
          },
          processing: {
            name: 'processing',
            type: 'final'
          }
        }
      };

      const startTime = Date.now();
      const machine = new StateMachine(config);
      const result = await machine.executeTransition('idle', 'START', {});
      const elapsed = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(elapsed).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('Retry with State Actions', () => {
    it('should retry on onExit failure', async () => {
      const onExit: TransitionAction = vi.fn()
        .mockRejectedValueOnce(new Error('Exit failure'))
        .mockResolvedValueOnce(undefined);
      
      const config: StateMachineConfig = {
        id: 'exit-retry',
        initialState: 'idle',
        states: {
          idle: {
            name: 'idle',
            type: 'atomic',
            onExit,
            transitions: [
              {
                event: 'START',
                to: 'processing',
                retry: { maxAttempts: 1, delayMs: 10 }
              }
            ]
          },
          processing: {
            name: 'processing',
            type: 'final'
          }
        }
      };

      const machine = new StateMachine(config);
      const result = await machine.executeTransition('idle', 'START', {});

      expect(result.success).toBe(true);
      expect(result.toState).toBe('processing');
      expect(onExit).toHaveBeenCalledTimes(2);
    });

    it('should retry on onEntry failure', async () => {
      const onEntry: TransitionAction = vi.fn()
        .mockRejectedValueOnce(new Error('Entry failure'))
        .mockResolvedValueOnce(undefined);
      
      const config: StateMachineConfig = {
        id: 'entry-retry',
        initialState: 'idle',
        states: {
          idle: {
            name: 'idle',
            type: 'atomic',
            transitions: [
              {
                event: 'START',
                to: 'processing',
                retry: { maxAttempts: 1, delayMs: 10 }
              }
            ]
          },
          processing: {
            name: 'processing',
            type: 'final',
            onEntry
          }
        }
      };

      const machine = new StateMachine(config);
      const result = await machine.executeTransition('idle', 'START', {});

      expect(result.success).toBe(true);
      expect(result.toState).toBe('processing');
      expect(onEntry).toHaveBeenCalledTimes(2);
    });

    it('should retry transition action', async () => {
      const onExit: TransitionAction = vi.fn().mockResolvedValue(undefined);
      const transitionAction: TransitionAction = vi.fn()
        .mockRejectedValueOnce(new Error('Failure'))
        .mockResolvedValueOnce(undefined);
      const onEntry: TransitionAction = vi.fn().mockResolvedValue(undefined);
      
      const config: StateMachineConfig = {
        id: 'action-retry',
        initialState: 'idle',
        states: {
          idle: {
            name: 'idle',
            type: 'atomic',
            onExit,
            transitions: [
              {
                event: 'START',
                to: 'processing',
                action: transitionAction,
                retry: { maxAttempts: 1, delayMs: 10 }
              }
            ]
          },
          processing: {
            name: 'processing',
            type: 'final',
            onEntry
          }
        }
      };

      const machine = new StateMachine(config);
      const result = await machine.executeTransition('idle', 'START', {});

      expect(result.success).toBe(true);
      expect(transitionAction).toHaveBeenCalledTimes(2); // Initial + 1 retry
      expect(onExit).toHaveBeenCalledTimes(2); // Called on each attempt
      expect(onEntry).toHaveBeenCalledTimes(1); // Only called once after success
    });
  });

  describe('Error Handling', () => {
    it('should call onError handler after exhausting retries', async () => {
      const onError: (error: Error, context: Record<string, any>) => Promise<void> = vi.fn().mockResolvedValue(undefined);
      const action: TransitionAction = vi.fn()
        .mockRejectedValue(new Error('Persistent failure'));
      
      const config: StateMachineConfig = {
        id: 'error-handler',
        initialState: 'idle',
        onError,
        states: {
          idle: {
            name: 'idle',
            type: 'atomic',
            transitions: [
              {
                event: 'START',
                to: 'processing',
                action,
                retry: { maxAttempts: 2, delayMs: 10 }
              }
            ]
          },
          processing: {
            name: 'processing',
            type: 'final'
          }
        }
      };

      const machine = new StateMachine(config);
      const result = await machine.executeTransition('idle', 'START', {});

      expect(result.success).toBe(false);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Persistent failure' }),
        {}
      );
    });

    it('should not call onError on successful retry', async () => {
      const onError: (error: Error, context: Record<string, any>) => Promise<void> = vi.fn().mockResolvedValue(undefined);
      const action: TransitionAction = vi.fn()
        .mockRejectedValueOnce(new Error('Transient failure'))
        .mockResolvedValueOnce(undefined);
      
      const config: StateMachineConfig = {
        id: 'success-no-error',
        initialState: 'idle',
        onError,
        states: {
          idle: {
            name: 'idle',
            type: 'atomic',
            transitions: [
              {
                event: 'START',
                to: 'processing',
                action,
                retry: { maxAttempts: 1, delayMs: 10 }
              }
            ]
          },
          processing: {
            name: 'processing',
            type: 'final'
          }
        }
      };

      const machine = new StateMachine(config);
      const result = await machine.executeTransition('idle', 'START', {});

      expect(result.success).toBe(true);
      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle API call with exponential backoff', async () => {
      let attemptCount = 0;
      const apiCall: TransitionAction = async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('503 Service Unavailable');
        }
      };
      
      const config: StateMachineConfig = {
        id: 'api-call',
        initialState: 'idle',
        states: {
          idle: {
            name: 'idle',
            type: 'atomic',
            transitions: [
              {
                event: 'FETCH',
                to: 'success',
                action: apiCall,
                retry: { maxAttempts: 3, backoff: 'exponential', delayMs: 50 }
              }
            ]
          },
          success: {
            name: 'success',
            type: 'final'
          }
        }
      };

      const startTime = Date.now();
      const machine = new StateMachine(config);
      const result = await machine.executeTransition('idle', 'FETCH', {});
      const elapsed = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(attemptCount).toBe(3);
      // Exponential: 50ms + 100ms = 150ms minimum
      expect(elapsed).toBeGreaterThanOrEqual(150);
    });

    it('should handle database connection retry', async () => {
      const connectionAttempts: number[] = [];
      const dbConnect: TransitionAction = async (context) => {
        connectionAttempts.push(Date.now());
        if (connectionAttempts.length <= 2) {
          throw new Error('Connection timeout');
        }
        context.connected = true;
      };
      
      const config: StateMachineConfig = {
        id: 'db-connection',
        initialState: 'disconnected',
        states: {
          disconnected: {
            name: 'disconnected',
            type: 'atomic',
            transitions: [
              {
                event: 'CONNECT',
                to: 'connected',
                action: dbConnect,
                retry: { maxAttempts: 3, backoff: 'linear', delayMs: 100 }
              }
            ]
          },
          connected: {
            name: 'connected',
            type: 'final'
          }
        }
      };

      const context = {};
      const machine = new StateMachine(config);
      const result = await machine.executeTransition('disconnected', 'CONNECT', context);

      expect(result.success).toBe(true);
      expect(context).toEqual({ connected: true });
      expect(connectionAttempts.length).toBe(3);
    });

    it('should fail payment processing after max retries', async () => {
      const paymentAttempts: string[] = [];
      const processPayment: TransitionAction = async () => {
        paymentAttempts.push('attempt');
        throw new Error('Payment gateway timeout');
      };
      
      const config: StateMachineConfig = {
        id: 'payment',
        initialState: 'pending',
        states: {
          pending: {
            name: 'pending',
            type: 'atomic',
            transitions: [
              {
                event: 'PROCESS',
                to: 'completed',
                action: processPayment,
                retry: { maxAttempts: 2, backoff: 'exponential', delayMs: 50 }
              }
            ]
          },
          completed: {
            name: 'completed',
            type: 'final'
          }
        }
      };

      const machine = new StateMachine(config);
      const result = await machine.executeTransition('pending', 'PROCESS', {});

      expect(result.success).toBe(false);
      expect(result.toState).toBe('pending');
      expect(result.error?.message).toBe('Payment gateway timeout');
      expect(paymentAttempts.length).toBe(3); // Initial + 2 retries
    });
  });
});
