import { describe, it, expect, beforeEach } from 'vitest';
import { FlowEngine } from '../flow-engine.js';
import { InMemoryStateStorage } from '../storage.js';
import type { StateMachineConfig } from '../state-machine.js';

describe('FlowEngine - Idempotency', () => {
  let storage: InMemoryStateStorage;
  let config: StateMachineConfig;

  beforeEach(() => {
    storage = new InMemoryStateStorage();
    config = {
      id: 'order-flow',
      initialState: 'draft',
      states: {
        draft: {
          name: 'draft',
          transitions: [
            { event: 'SUBMIT', to: 'processing' }
          ]
        },
        processing: {
          name: 'processing',
          transitions: [
            { event: 'APPROVE', to: 'completed' }
          ]
        },
        completed: {
          name: 'completed',
          type: 'final'
        }
      }
    };
  });

  describe('Flow Start Idempotency', () => {
    it('should create new flow without idempotency key', async () => {
      const engine = new FlowEngine(config, storage);

      const flow1 = await engine.start({ context: { orderId: '123' } });
      const flow2 = await engine.start({ context: { orderId: '456' } });

      expect(flow1.flowId).not.toBe(flow2.flowId);
      expect(flow1.context.orderId).toBe('123');
      expect(flow2.context.orderId).toBe('456');
    });

    it('should return same flow when using same idempotency key', async () => {
      const engine = new FlowEngine(config, storage);
      const idempotencyKey = 'order-create-123';

      const flow1 = await engine.start({
        context: { orderId: '123' },
        idempotencyKey
      });

      const flow2 = await engine.start({
        context: { orderId: '456' }, // Different context
        idempotencyKey // Same key
      });

      expect(flow1.flowId).toBe(flow2.flowId);
      expect(flow2.context.orderId).toBe('123'); // Original context preserved
    });

    it('should create different flows with different idempotency keys', async () => {
      const engine = new FlowEngine(config, storage);

      const flow1 = await engine.start({
        context: { orderId: '123' },
        idempotencyKey: 'order-create-123'
      });

      const flow2 = await engine.start({
        context: { orderId: '456' },
        idempotencyKey: 'order-create-456'
      });

      expect(flow1.flowId).not.toBe(flow2.flowId);
      expect(flow1.context.orderId).toBe('123');
      expect(flow2.context.orderId).toBe('456');
    });

    it('should allow multiple attempts with same idempotency key', async () => {
      const engine = new FlowEngine(config, storage);
      const idempotencyKey = 'order-create-multi';

      const flow1 = await engine.start({
        context: { orderId: '123' },
        idempotencyKey
      });

      // Second attempt
      const flow2 = await engine.start({
        context: { orderId: '456' },
        idempotencyKey
      });

      // Third attempt
      const flow3 = await engine.start({
        context: { orderId: '789' },
        idempotencyKey
      });

      expect(flow1.flowId).toBe(flow2.flowId);
      expect(flow2.flowId).toBe(flow3.flowId);
      expect(flow3.context.orderId).toBe('123'); // Always returns original
    });

    it('should work with custom flow IDs and idempotency keys', async () => {
      const engine = new FlowEngine(config, storage);

      const flow1 = await engine.start({
        flowId: 'custom-id-1',
        context: { orderId: '123' },
        idempotencyKey: 'idem-key-1'
      });

      const flow2 = await engine.start({
        flowId: 'custom-id-2', // Different custom ID
        context: { orderId: '456' },
        idempotencyKey: 'idem-key-1' // Same idempotency key
      });

      // Should return original flow despite different custom ID
      expect(flow2.flowId).toBe('custom-id-1');
      expect(flow2.context.orderId).toBe('123');
    });
  });

  describe('Flow Execute Idempotency', () => {
    it('should execute event without idempotency key', async () => {
      const engine = new FlowEngine(config, storage);
      const flow = await engine.start({ context: { count: 0 } });

      const result1 = await engine.execute(flow.flowId, { event: 'SUBMIT' });
      expect(result1.success).toBe(true);
      expect(result1.state.currentState).toBe('processing');

      const result2 = await engine.execute(flow.flowId, { event: 'APPROVE' });
      expect(result2.success).toBe(true);
      expect(result2.state.currentState).toBe('completed');
    });

    it('should prevent duplicate execution with same idempotency key', async () => {
      const engine = new FlowEngine(config, storage);
      const flow = await engine.start({ context: { count: 0 } });
      const idempotencyKey = 'submit-123';

      const result1 = await engine.execute(flow.flowId, {
        event: 'SUBMIT',
        idempotencyKey
      });

      expect(result1.success).toBe(true);
      expect(result1.state.currentState).toBe('processing');

      // Second attempt with same key
      const result2 = await engine.execute(flow.flowId, {
        event: 'SUBMIT',
        idempotencyKey
      });

      expect(result2.success).toBe(true);
      expect(result2.state.currentState).toBe('processing'); // Still in processing
    });

    it('should allow different events with different idempotency keys', async () => {
      const engine = new FlowEngine(config, storage);
      const flow = await engine.start();

      const result1 = await engine.execute(flow.flowId, {
        event: 'SUBMIT',
        idempotencyKey: 'key-1'
      });

      expect(result1.success).toBe(true);
      expect(result1.state.currentState).toBe('processing');

      const result2 = await engine.execute(flow.flowId, {
        event: 'APPROVE',
        idempotencyKey: 'key-2'
      });

      expect(result2.success).toBe(true);
      expect(result2.state.currentState).toBe('completed');
    });

    it('should handle concurrent requests with same idempotency key', async () => {
      const engine = new FlowEngine(config, storage);
      const flow = await engine.start();
      const idempotencyKey = 'concurrent-submit';

      // Execute concurrently
      const [result1, result2, result3] = await Promise.all([
        engine.execute(flow.flowId, { event: 'SUBMIT', idempotencyKey }),
        engine.execute(flow.flowId, { event: 'SUBMIT', idempotencyKey }),
        engine.execute(flow.flowId, { event: 'SUBMIT', idempotencyKey })
      ]);

      // All should succeed and have same result
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result3.success).toBe(true);
      expect(result1.state.currentState).toBe('processing');
      expect(result2.state.currentState).toBe('processing');
      expect(result3.state.currentState).toBe('processing');
    });
  });

  describe('Real-World Scenarios', () => {
    it('should prevent duplicate payment processing', async () => {
      const paymentConfig: StateMachineConfig = {
        id: 'payment-flow',
        initialState: 'pending',
        states: {
          pending: {
            name: 'pending',
            transitions: [
              {
                event: 'PROCESS',
                to: 'processing',
                action: async (ctx) => {
                  ctx.processedAt = Date.now();
                  ctx.transactionId = Math.random().toString(36).substring(7);
                }
              }
            ]
          },
          processing: {
            name: 'processing',
            transitions: [
              { event: 'COMPLETE', to: 'completed' }
            ]
          },
          completed: {
            name: 'completed',
            type: 'final'
          }
        }
      };

      const engine = new FlowEngine(paymentConfig, storage);
      const payment = await engine.start({
        context: { amount: 100, userId: 'user-123' },
        idempotencyKey: 'payment-user123-20240101'
      });

      // Process payment
      const result1 = await engine.execute(payment.flowId, {
        event: 'PROCESS',
        idempotencyKey: 'process-payment-user123'
      });

      const transactionId1 = result1.state.context.transactionId;
      expect(result1.success).toBe(true);
      expect(transactionId1).toBeDefined();

      // Duplicate request (e.g., network retry)
      const result2 = await engine.execute(payment.flowId, {
        event: 'PROCESS',
        idempotencyKey: 'process-payment-user123'
      });

      // Should have same transaction ID (not processed twice)
      expect(result2.state.context.transactionId).toBe(transactionId1);
    });

    it('should handle order submission idempotency', async () => {
      const orderConfig: StateMachineConfig = {
        id: 'order-workflow',
        initialState: 'cart',
        states: {
          cart: {
            name: 'cart',
            transitions: [
              {
                event: 'CHECKOUT',
                to: 'submitted',
                action: async (ctx) => {
                  ctx.orderId = `ORD-${Math.random().toString(36).substring(7)}`;
                  ctx.submittedAt = Date.now();
                }
              }
            ]
          },
          submitted: {
            name: 'submitted',
            type: 'final'
          }
        }
      };

      const engine = new FlowEngine(orderConfig, storage);

      // User clicks checkout button multiple times
      const idempotencyKey = 'checkout-cart-abc123';

      const result1 = await engine.start({
        context: { items: ['item1', 'item2'], total: 150 },
        idempotencyKey
      });

      const result2 = await engine.start({
        context: { items: ['item1', 'item2'], total: 150 },
        idempotencyKey
      });

      // Should be same flow
      expect(result1.flowId).toBe(result2.flowId);

      // Execute checkout with idempotency
      const checkout1 = await engine.execute(result1.flowId, {
        event: 'CHECKOUT',
        idempotencyKey: 'submit-order-abc123'
      });

      const orderId1 = checkout1.state.context.orderId;

      // Retry checkout (e.g., browser refresh)
      const checkout2 = await engine.execute(result1.flowId, {
        event: 'CHECKOUT',
        idempotencyKey: 'submit-order-abc123'
      });

      // Should have same order ID
      expect(checkout2.state.context.orderId).toBe(orderId1);
    });

    it('should support webhook retry with idempotency', async () => {
      const webhookConfig: StateMachineConfig = {
        id: 'webhook-processor',
        initialState: 'received',
        states: {
          received: {
            name: 'received',
            transitions: [
              {
                event: 'PROCESS',
                to: 'processed',
                action: async (ctx) => {
                  ctx.processedCount = (ctx.processedCount || 0) + 1;
                }
              }
            ]
          },
          processed: {
            name: 'processed',
            type: 'final'
          }
        }
      };

      const engine = new FlowEngine(webhookConfig, storage);
      const webhookId = 'webhook-evt-12345';
      const idempotencyKey = `webhook-${webhookId}`;

      // First webhook delivery
      const flow1 = await engine.start({
        context: { webhookId, data: { event: 'payment.success' } },
        idempotencyKey
      });

      const result1 = await engine.execute(flow1.flowId, {
        event: 'PROCESS',
        idempotencyKey: `process-${webhookId}`
      });

      expect(result1.state.context.processedCount).toBe(1);

      // Webhook retry (webhook provider retries on timeout)
      const flow2 = await engine.start({
        context: { webhookId, data: { event: 'payment.success' } },
        idempotencyKey
      });

      expect(flow2.flowId).toBe(flow1.flowId);

      const result2 = await engine.execute(flow2.flowId, {
        event: 'PROCESS',
        idempotencyKey: `process-${webhookId}`
      });

      // Should not process twice
      expect(result2.state.context.processedCount).toBe(1);
    });
  });

  describe('Storage Integration', () => {
    it('should persist idempotency keys across engine instances', async () => {
      const engine1 = new FlowEngine(config, storage);
      const idempotencyKey = 'persistent-key-123';

      const flow1 = await engine1.start({
        context: { value: 'original' },
        idempotencyKey
      });

      // Create new engine instance with same storage
      const engine2 = new FlowEngine(config, storage);

      const flow2 = await engine2.start({
        context: { value: 'duplicate' },
        idempotencyKey
      });

      expect(flow2.flowId).toBe(flow1.flowId);
      expect(flow2.context.value).toBe('original');
    });

    it('should handle storage clear', async () => {
      const engine = new FlowEngine(config, storage);
      const idempotencyKey = 'key-before-clear';

      await engine.start({
        context: { value: 'before' },
        idempotencyKey
      });

      expect(await storage.hasIdempotencyKey(idempotencyKey)).toBe(true);

      storage.clear();

      expect(await storage.hasIdempotencyKey(idempotencyKey)).toBe(false);

      // Should create new flow after clear
      const flow = await engine.start({
        context: { value: 'after' },
        idempotencyKey
      });

      expect(flow.context.value).toBe('after');
    });
  });
});
