import { describe, it, expect, beforeEach } from 'vitest';
import { FlowEngine, FlowStartOptions } from '../flow-engine.js';
import { StateMachineConfig } from '../state-machine.js';
import { InMemoryStateStorage } from '../storage.js';

describe('FlowEngine', () => {
  let engine: FlowEngine;
  let storage: InMemoryStateStorage;

  const orderFlowConfig: StateMachineConfig = {
    id: 'order-flow',
    initialState: 'pending',
    states: {
      pending: {
        name: 'pending',
        transitions: [
          { event: 'approve', to: 'approved' },
          { event: 'reject', to: 'rejected' }
        ]
      },
      approved: {
        name: 'approved',
        transitions: [
          { event: 'ship', to: 'shipped' }
        ]
      },
      rejected: {
        name: 'rejected',
        transitions: [],
        isFinal: true
      },
      shipped: {
        name: 'shipped',
        transitions: [],
        isFinal: true
      }
    }
  };

  beforeEach(() => {
    storage = new InMemoryStateStorage();
    engine = new FlowEngine(orderFlowConfig, storage);
  });

  describe('flow lifecycle', () => {
    it('should start a new flow', async () => {
      const flow = await engine.start({
        context: { orderId: '12345' }
      });

      expect(flow.flowId).toBeDefined();
      expect(flow.currentState).toBe('pending');
      expect(flow.context.orderId).toBe('12345');
      expect(flow.status).toBe('active');
      expect(flow.history).toHaveLength(0);
    });

    it('should generate unique flow IDs', async () => {
      const flow1 = await engine.start();
      const flow2 = await engine.start();

      expect(flow1.flowId).not.toBe(flow2.flowId);
    });

    it('should allow custom flow ID', async () => {
      const flow = await engine.start({ flowId: 'custom-123' });
      expect(flow.flowId).toBe('custom-123');
    });

    it('should throw error for duplicate flow ID', async () => {
      await engine.start({ flowId: 'test-1' });
      await expect(engine.start({ flowId: 'test-1' })).rejects.toThrow('already exists');
    });

    it('should mark flow as completed when reaching final state', async () => {
      const flow = await engine.start();
      const result = await engine.execute(flow.flowId, { event: 'reject' });

      expect(result.state.status).toBe('completed');
      expect(result.state.currentState).toBe('rejected');
    });
  });

  describe('flow execution', () => {
    it('should execute a valid transition', async () => {
      const flow = await engine.start();
      const result = await engine.execute(flow.flowId, { event: 'approve' });

      expect(result.success).toBe(true);
      expect(result.state.currentState).toBe('approved');
      expect(result.state.history).toHaveLength(1);
      expect(result.state.history[0]).toMatchObject({
        from: 'pending',
        to: 'approved',
        event: 'approve'
      });
    });

    it('should fail for invalid event', async () => {
      const flow = await engine.start();
      const result = await engine.execute(flow.flowId, { event: 'invalid' });

      expect(result.success).toBe(false);
      expect(result.state.status).toBe('failed');
      expect(result.state.error).toBeDefined();
    });

    it('should throw error for non-existent flow', async () => {
      await expect(
        engine.execute('non-existent', { event: 'approve' })
      ).rejects.toThrow('not found');
    });

    it('should not execute on completed flow', async () => {
      const flow = await engine.start();
      await engine.execute(flow.flowId, { event: 'reject' });

      await expect(
        engine.execute(flow.flowId, { event: 'approve' })
      ).rejects.toThrow('not active');
    });

    it('should merge additional data into context', async () => {
      const flow = await engine.start({ context: { userId: '123' } });
      await engine.execute(flow.flowId, {
        event: 'approve',
        data: { approvedBy: 'admin' }
      });

      const updated = await engine.getFlow(flow.flowId);
      expect(updated?.context.userId).toBe('123');
      expect(updated?.context.approvedBy).toBe('admin');
    });

    it('should maintain history of transitions', async () => {
      const flow = await engine.start();
      
      await engine.execute(flow.flowId, { event: 'approve' });
      await engine.execute(flow.flowId, { event: 'ship' });

      const final = await engine.getFlow(flow.flowId);
      expect(final?.history).toHaveLength(2);
      expect(final?.history[0].from).toBe('pending');
      expect(final?.history[0].to).toBe('approved');
      expect(final?.history[1].from).toBe('approved');
      expect(final?.history[1].to).toBe('shipped');
    });
  });

  describe('flow state management', () => {
    it('should get flow by ID', async () => {
      const flow = await engine.start();
      const retrieved = await engine.getFlow(flow.flowId);

      expect(retrieved).toEqual(flow);
    });

    it('should return null for non-existent flow', async () => {
      const retrieved = await engine.getFlow('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should pause an active flow', async () => {
      const flow = await engine.start();
      const paused = await engine.pause(flow.flowId);

      expect(paused.status).toBe('paused');
    });

    it('should not pause a completed flow', async () => {
      const flow = await engine.start();
      await engine.execute(flow.flowId, { event: 'reject' });

      await expect(engine.pause(flow.flowId)).rejects.toThrow('Cannot pause');
    });

    it('should resume a paused flow', async () => {
      const flow = await engine.start();
      await engine.pause(flow.flowId);
      const resumed = await engine.resume(flow.flowId);

      expect(resumed.status).toBe('active');
    });

    it('should not resume a non-paused flow', async () => {
      const flow = await engine.start();
      await expect(engine.resume(flow.flowId)).rejects.toThrow('Cannot resume');
    });

    it('should not execute on paused flow', async () => {
      const flow = await engine.start();
      await engine.pause(flow.flowId);

      await expect(
        engine.execute(flow.flowId, { event: 'approve' })
      ).rejects.toThrow('not active');
    });

    it('should cancel an active flow', async () => {
      const flow = await engine.start();
      const cancelled = await engine.cancel(flow.flowId);

      expect(cancelled.status).toBe('failed');
      expect(cancelled.error?.message).toContain('cancelled');
    });

    it('should not cancel a completed flow', async () => {
      const flow = await engine.start();
      await engine.execute(flow.flowId, { event: 'reject' });

      await expect(engine.cancel(flow.flowId)).rejects.toThrow('Cannot cancel completed');
    });

    it('should delete a flow', async () => {
      const flow = await engine.start();
      await engine.delete(flow.flowId);

      const retrieved = await engine.getFlow(flow.flowId);
      expect(retrieved).toBeNull();
    });
  });

  describe('flow queries', () => {
    beforeEach(async () => {
      await engine.start({ flowId: 'flow-1' });
      await engine.start({ flowId: 'flow-2' });
      await engine.execute('flow-1', { event: 'approve' });
      await engine.execute('flow-2', { event: 'reject' });
    });

    it('should list all flows', async () => {
      const flows = await engine.listFlows();
      expect(flows).toHaveLength(2);
    });

    it('should filter flows by status', async () => {
      const completed = await engine.listFlows({ status: 'completed' });
      expect(completed).toHaveLength(1);
      expect(completed[0].flowId).toBe('flow-2');
    });

    it('should filter flows by current state', async () => {
      const approved = await engine.listFlows({ currentState: 'approved' });
      expect(approved).toHaveLength(1);
      expect(approved[0].flowId).toBe('flow-1');
    });

    it('should get possible transitions', async () => {
      const flow = await engine.start();
      const transitions = await engine.getPossibleTransitions(flow.flowId);

      expect(transitions).toEqual(['approve', 'reject']);
    });
  });

  describe('entry and exit actions', () => {
    it('should execute entry action on initial state', async () => {
      const log: string[] = [];
      
      const config: StateMachineConfig = {
        id: 'test',
        initialState: 'start',
        states: {
          start: {
            name: 'start',
            transitions: [],
            onEntry: () => { log.push('entered'); }
          }
        }
      };

      const testEngine = new FlowEngine(config, new InMemoryStateStorage());
      await testEngine.start();

      expect(log).toEqual(['entered']);
    });

    it('should handle errors in initial state entry action', async () => {
      const config: StateMachineConfig = {
        id: 'test',
        initialState: 'start',
        states: {
          start: {
            name: 'start',
            transitions: [],
            onEntry: () => { throw new Error('Entry failed'); }
          }
        }
      };

      const testEngine = new FlowEngine(config, new InMemoryStateStorage());
      const flow = await testEngine.start();

      expect(flow.status).toBe('failed');
      expect(flow.error?.message).toBe('Entry failed');
    });
  });

  describe('conditional transitions', () => {
    it('should respect guard conditions', async () => {
      const config: StateMachineConfig = {
        id: 'conditional-flow',
        initialState: 'start',
        states: {
          start: {
            name: 'start',
            transitions: [
              {
                event: 'proceed',
                to: 'allowed',
                guard: (ctx) => ctx.canProceed === true
              },
              {
                event: 'proceed',
                to: 'denied',
                guard: (ctx) => ctx.canProceed !== true
              }
            ]
          },
          allowed: {
            name: 'allowed',
            transitions: [],
            isFinal: true
          },
          denied: {
            name: 'denied',
            transitions: [],
            isFinal: true
          }
        }
      };

      const testEngine = new FlowEngine(config, new InMemoryStateStorage());

      // Test with permission
      const flow1 = await testEngine.start({ context: { canProceed: true } });
      const result1 = await testEngine.execute(flow1.flowId, { event: 'proceed' });
      expect(result1.state.currentState).toBe('allowed');

      // Test without permission
      const flow2 = await testEngine.start({ context: { canProceed: false } });
      const result2 = await testEngine.execute(flow2.flowId, { event: 'proceed' });
      expect(result2.state.currentState).toBe('denied');
    });
  });

  describe('metadata', () => {
    it('should return machine ID', () => {
      expect(engine.getMachineId()).toBe('order-flow');
    });

    it('should return storage instance', () => {
      expect(engine.getStorage()).toBe(storage);
    });
  });
});
