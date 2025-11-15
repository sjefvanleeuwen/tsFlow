import { describe, it, expect, beforeEach } from 'vitest';
import { FlowEngine, Middleware, MiddlewareContext } from '../flow-engine.js';
import { StateMachineConfig } from '../state-machine.js';
import { InMemoryStateStorage } from '../storage.js';

describe('Middleware', () => {
  let engine: FlowEngine;
  let storage: InMemoryStateStorage;

  const simpleConfig: StateMachineConfig = {
    id: 'test-flow',
    initialState: 'start',
    states: {
      start: {
        name: 'start',
        transitions: [
          { event: 'next', to: 'end' }
        ]
      },
      end: {
        name: 'end',
        transitions: [],
        isFinal: true
      }
    }
  };

  beforeEach(() => {
    storage = new InMemoryStateStorage();
    engine = new FlowEngine(simpleConfig, storage);
  });

  describe('basic middleware', () => {
    it('should execute middleware before and after transition', async () => {
      const log: string[] = [];

      const loggingMiddleware: Middleware = async (context, next) => {
        log.push(`before:${context.event}`);
        const result = await next();
        log.push(`after:${context.event}`);
        return result;
      };

      engine.use(loggingMiddleware);

      const flow = await engine.start();
      await engine.execute(flow.flowId, { event: 'next' });

      expect(log).toEqual(['before:next', 'after:next']);
    });

    it('should pass through multiple middleware in order', async () => {
      const log: string[] = [];

      engine.use(async (context, next) => {
        log.push('middleware-1-before');
        const result = await next();
        log.push('middleware-1-after');
        return result;
      });

      engine.use(async (context, next) => {
        log.push('middleware-2-before');
        const result = await next();
        log.push('middleware-2-after');
        return result;
      });

      const flow = await engine.start();
      await engine.execute(flow.flowId, { event: 'next' });

      expect(log).toEqual([
        'middleware-1-before',
        'middleware-2-before',
        'middleware-2-after',
        'middleware-1-after'
      ]);
    });

    it('should provide context to middleware', async () => {
      let capturedContext: MiddlewareContext | undefined;

      engine.use(async (context, next) => {
        capturedContext = context;
        return next();
      });

      const flow = await engine.start({ context: { orderId: '123' } });
      await engine.execute(flow.flowId, { event: 'next' });

      expect(capturedContext).toBeDefined();
      expect(capturedContext!.flowId).toBe(flow.flowId);
      expect(capturedContext!.event).toBe('next');
      expect(capturedContext!.flowState.context.orderId).toBe('123');
    });
  });

  describe('middleware can modify behavior', () => {
    it('should allow middleware to modify result', async () => {
      engine.use(async (context, next) => {
        const result = await next();
        // Add custom property to result
        (result as any).middlewareRan = true;
        return result;
      });

      const flow = await engine.start();
      const result = await engine.execute(flow.flowId, { event: 'next' });

      expect((result as any).middlewareRan).toBe(true);
    });

    it('should allow middleware to track metrics', async () => {
      const metrics = {
        executionCount: 0,
        totalDuration: 0,
        events: [] as string[]
      };

      engine.use(async (context, next) => {
        metrics.executionCount++;
        metrics.events.push(context.event);
        
        const start = Date.now();
        const result = await next();
        const duration = Date.now() - start;
        
        metrics.totalDuration += duration;
        return result;
      });

      const flow = await engine.start();
      await engine.execute(flow.flowId, { event: 'next' });

      expect(metrics.executionCount).toBe(1);
      expect(metrics.events).toEqual(['next']);
      expect(metrics.totalDuration).toBeGreaterThanOrEqual(0);
    });

    it('should allow middleware to add logging', async () => {
      const logs: Array<{ level: string; message: string; timestamp: number }> = [];

      const loggingMiddleware: Middleware = async (context, next) => {
        logs.push({
          level: 'info',
          message: `Executing event "${context.event}" on flow ${context.flowId}`,
          timestamp: Date.now()
        });

        try {
          const result = await next();
          
          logs.push({
            level: 'info',
            message: `Successfully transitioned from ${result.transition.fromState} to ${result.transition.toState}`,
            timestamp: Date.now()
          });

          return result;
        } catch (error) {
          logs.push({
            level: 'error',
            message: `Failed to execute event: ${error}`,
            timestamp: Date.now()
          });
          throw error;
        }
      };

      engine.use(loggingMiddleware);

      const flow = await engine.start();
      await engine.execute(flow.flowId, { event: 'next' });

      expect(logs).toHaveLength(2);
      expect(logs[0].level).toBe('info');
      expect(logs[0].message).toContain('Executing event');
      expect(logs[1].level).toBe('info');
      expect(logs[1].message).toContain('Successfully transitioned');
    });
  });

  describe('error handling', () => {
    it('should catch errors thrown in middleware', async () => {
      engine.use(async (context, next) => {
        throw new Error('Middleware error');
      });

      const flow = await engine.start();
      
      await expect(
        engine.execute(flow.flowId, { event: 'next' })
      ).rejects.toThrow('Middleware error');
    });

    it('should allow middleware to handle errors from execution', async () => {
      const errorConfig: StateMachineConfig = {
        id: 'error-flow',
        initialState: 'start',
        states: {
          start: {
            name: 'start',
            transitions: [
              {
                event: 'fail',
                to: 'end',
                action: () => {
                  throw new Error('Action failed');
                }
              }
            ]
          },
          end: {
            name: 'end',
            transitions: [],
            isFinal: true
          }
        }
      };

      const errorEngine = new FlowEngine(errorConfig, storage);
      let errorCaught = false;

      errorEngine.use(async (context, next) => {
        const result = await next();
        
        // Check if execution failed
        if (!result.success && result.transition.error) {
          errorCaught = true;
        }
        
        return result;
      });

      const flow = await errorEngine.start();
      const result = await errorEngine.execute(flow.flowId, { event: 'fail' });

      expect(result.success).toBe(false);
      expect(errorCaught).toBe(true);
    });
  });

  describe('middleware management', () => {
    it('should clear all middleware', async () => {
      const log: string[] = [];

      engine.use(async (context, next) => {
        log.push('middleware-1');
        return next();
      });

      engine.clearMiddleware();

      const flow = await engine.start();
      await engine.execute(flow.flowId, { event: 'next' });

      expect(log).toHaveLength(0);
    });

    it('should support chaining middleware registration', () => {
      const result = engine
        .use(async (ctx, next) => next())
        .use(async (ctx, next) => next())
        .use(async (ctx, next) => next());

      expect(result).toBe(engine);
    });
  });

  describe('real-world scenarios', () => {
    it('should support authorization middleware', async () => {
      const authMiddleware: Middleware = async (context, next) => {
        // Check if user has permission
        const isAuthorized = context.flowState.context.userRole === 'admin';
        
        if (!isAuthorized) {
          throw new Error('Unauthorized: Only admins can execute this event');
        }

        return next();
      };

      engine.use(authMiddleware);

      // Unauthorized user
      const flow1 = await engine.start({ context: { userRole: 'user' } });
      await expect(
        engine.execute(flow1.flowId, { event: 'next' })
      ).rejects.toThrow('Unauthorized');

      // Authorized user
      const flow2 = await engine.start({ context: { userRole: 'admin' } });
      const result = await engine.execute(flow2.flowId, { event: 'next' });
      expect(result.success).toBe(true);
    });

    it('should support rate limiting middleware', async () => {
      const rateLimiter = {
        attempts: 0,
        maxAttempts: 2,
        reset: () => { rateLimiter.attempts = 0; }
      };

      const rateLimitMiddleware: Middleware = async (context, next) => {
        rateLimiter.attempts++;
        
        if (rateLimiter.attempts > rateLimiter.maxAttempts) {
          throw new Error('Rate limit exceeded');
        }

        return next();
      };

      engine.use(rateLimitMiddleware);

      const flow = await engine.start();

      // First two should work
      await engine.execute(flow.flowId, { event: 'next' });
      const flow2 = await engine.start();
      await engine.execute(flow2.flowId, { event: 'next' });

      // Third should fail
      const flow3 = await engine.start();
      await expect(
        engine.execute(flow3.flowId, { event: 'next' })
      ).rejects.toThrow('Rate limit exceeded');
    });

    it('should support performance monitoring middleware', async () => {
      interface PerformanceMetrics {
        slowExecutions: Array<{
          flowId: string;
          event: string;
          duration: number;
        }>;
      }

      const metrics: PerformanceMetrics = {
        slowExecutions: []
      };

      const performanceMiddleware: Middleware = async (context, next) => {
        const start = context.startTime;
        const result = await next();
        const duration = Date.now() - start;

        // Track slow executions (>100ms)
        if (duration > 100) {
          metrics.slowExecutions.push({
            flowId: context.flowId,
            event: context.event,
            duration
          });
        }

        return result;
      };

      engine.use(performanceMiddleware);

      const flow = await engine.start();
      await engine.execute(flow.flowId, { event: 'next' });

      // This execution should be fast
      expect(metrics.slowExecutions).toHaveLength(0);
    });
  });
});
