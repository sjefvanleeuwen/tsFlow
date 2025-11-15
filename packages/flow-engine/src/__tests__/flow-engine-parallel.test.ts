import { describe, it, expect, beforeEach } from 'vitest';
import { FlowEngine, StateMachineConfig, InMemoryStateStorage } from '../index.js';

describe('FlowEngine - Parallel States', () => {
  let storage: InMemoryStateStorage;

  beforeEach(() => {
    storage = new InMemoryStateStorage();
  });

  it('should start a flow with parallel states and initialize all regions', async () => {
    const config: StateMachineConfig = {
      id: 'parallel-order',
      version: '1.0.0',
      initialState: 'processing',
      states: {
        processing: {
          name: 'processing',
          type: 'parallel',
          regions: [
            {
              name: 'payment',
              initialState: 'pending_payment',
              states: ['pending_payment', 'payment_complete']
            },
            {
              name: 'inventory',
              initialState: 'reserving',
              states: ['reserving', 'reserved']
            },
            {
              name: 'shipping',
              initialState: 'waiting',
              states: ['waiting', 'preparing']
            }
          ]
        },
        pending_payment: { name: 'pending_payment' },
        payment_complete: { name: 'payment_complete' },
        reserving: { name: 'reserving' },
        reserved: { name: 'reserved' },
        waiting: { name: 'waiting' },
        preparing: { name: 'preparing' },
        completed: { name: 'completed', type: 'final' }
      },
      transitions: [
        { from: 'pending_payment', to: 'payment_complete', event: 'PAY' },
        { from: 'reserving', to: 'reserved', event: 'RESERVE' },
        { from: 'waiting', to: 'preparing', event: 'START_PREP' },
        { from: 'processing', to: 'completed', event: 'FINISH' }
      ]
    };

    const engine = new FlowEngine(config, storage);
    const flow = await engine.start({
      context: { orderId: 'ORD-123' }
    });

    expect(flow.currentState).toEqual(['pending_payment', 'reserving', 'waiting']);
    expect(flow.status).toBe('active');
    expect(flow.context.orderId).toBe('ORD-123');
  });

  it('should transition a specific parallel region', async () => {
    const config: StateMachineConfig = {
      id: 'parallel-test',
      version: '1.0.0',
      initialState: 'parallel',
      states: {
        parallel: {
          name: 'parallel',
          type: 'parallel',
          regions: [
            { name: 'region1', initialState: 'r1_start', states: ['r1_start', 'r1_end'] },
            { name: 'region2', initialState: 'r2_start', states: ['r2_start', 'r2_end'] }
          ]
        },
        r1_start: { name: 'r1_start' },
        r1_end: { name: 'r1_end' },
        r2_start: { name: 'r2_start' },
        r2_end: { name: 'r2_end' },
        done: { name: 'done', type: 'final' }
      },
      transitions: [
        { from: 'r1_start', to: 'r1_end', event: 'ADVANCE_R1' },
        { from: 'r2_start', to: 'r2_end', event: 'ADVANCE_R2' }
      ]
    };

    const engine = new FlowEngine(config, storage);
    const flow = await engine.start();

    expect(flow.currentState).toEqual(['r1_start', 'r2_start']);

    // Advance region 1
    const result1 = await engine.execute(flow.flowId, {
      event: 'ADVANCE_R1',
      targetRegion: '0'
    });

    expect(result1.success).toBe(true);
    expect(result1.state.currentState).toEqual(['r1_end', 'r2_start']);

    // Advance region 2
    const result2 = await engine.execute(flow.flowId, {
      event: 'ADVANCE_R2',
      targetRegion: '1'
    });

    expect(result2.success).toBe(true);
    expect(result2.state.currentState).toEqual(['r1_end', 'r2_end']);
  });

  it('should transition all applicable regions when no target specified', async () => {
    const config: StateMachineConfig = {
      id: 'parallel-broadcast',
      version: '1.0.0',
      initialState: 'parallel',
      states: {
        parallel: {
          name: 'parallel',
          type: 'parallel',
          regions: [
            { name: 'region1', initialState: 'ready', states: ['ready', 'active'] },
            { name: 'region2', initialState: 'ready', states: ['ready', 'active'] }
          ]
        },
        ready: { name: 'ready' },
        active: { name: 'active' }
      },
      transitions: [
        { from: 'ready', to: 'active', event: 'START' }
      ]
    };

    const engine = new FlowEngine(config, storage);
    const flow = await engine.start();

    expect(flow.currentState).toEqual(['ready', 'ready']);

    // Send START event without target - should transition both regions
    const result = await engine.execute(flow.flowId, {
      event: 'START'
    });

    expect(result.success).toBe(true);
    expect(result.state.currentState).toEqual(['active', 'active']);
  });

  it('should complete when all parallel regions reach final states', async () => {
    const config: StateMachineConfig = {
      id: 'parallel-completion',
      version: '1.0.0',
      initialState: 'parallel',
      states: {
        parallel: {
          name: 'parallel',
          type: 'parallel',
          regions: [
            { name: 'region1', initialState: 'r1_start', states: ['r1_start', 'r1_done'] },
            { name: 'region2', initialState: 'r2_start', states: ['r2_start', 'r2_done'] }
          ]
        },
        r1_start: { name: 'r1_start' },
        r1_done: { name: 'r1_done', isFinal: true },
        r2_start: { name: 'r2_start' },
        r2_done: { name: 'r2_done', isFinal: true }
      },
      transitions: [
        { from: 'r1_start', to: 'r1_done', event: 'FINISH_R1' },
        { from: 'r2_start', to: 'r2_done', event: 'FINISH_R2' }
      ]
    };

    const engine = new FlowEngine(config, storage);
    const flow = await engine.start();

    // Complete region 1
    await engine.execute(flow.flowId, { event: 'FINISH_R1', targetRegion: '0' });
    let state = await engine.getFlow(flow.flowId);
    expect(state?.status).toBe('active'); // Not yet complete

    // Complete region 2
    await engine.execute(flow.flowId, { event: 'FINISH_R2', targetRegion: '1' });
    state = await engine.getFlow(flow.flowId);
    expect(state?.status).toBe('completed'); // Now complete
  });

  it('should track history for parallel transitions', async () => {
    const config: StateMachineConfig = {
      id: 'parallel-history',
      version: '1.0.0',
      initialState: 'parallel',
      states: {
        parallel: {
          name: 'parallel',
          type: 'parallel',
          regions: [
            { name: 'r1', initialState: 'a', states: ['a', 'b'] },
            { name: 'r2', initialState: 'x', states: ['x', 'y'] }
          ]
        },
        a: { name: 'a' },
        b: { name: 'b' },
        x: { name: 'x' },
        y: { name: 'y' }
      },
      transitions: [
        { from: 'a', to: 'b', event: 'GO' },
        { from: 'x', to: 'y', event: 'GO' }
      ]
    };

    const engine = new FlowEngine(config, storage);
    const flow = await engine.start();

    await engine.execute(flow.flowId, { event: 'GO' });

    const state = await engine.getFlow(flow.flowId);
    expect(state?.history).toHaveLength(1);
    expect(state?.history[0]).toMatchObject({
      from: ['a', 'x'],
      to: ['b', 'y'],
      event: 'GO'
    });
  });

  it('should execute entry/exit actions for parallel regions', async () => {
    const entries: string[] = [];
    const exits: string[] = [];

    const config: StateMachineConfig = {
      id: 'parallel-hooks',
      version: '1.0.0',
      initialState: 'parallel',
      states: {
        parallel: {
          name: 'parallel',
          type: 'parallel',
          regions: [
            { name: 'r1', initialState: 's1', states: ['s1', 's2'] },
            { name: 'r2', initialState: 't1', states: ['t1', 't2'] }
          ]
        },
        s1: {
          name: 's1',
          onEntry: async () => { entries.push('s1'); },
          onExit: async () => { exits.push('s1'); }
        },
        s2: {
          name: 's2',
          onEntry: async () => { entries.push('s2'); }
        },
        t1: {
          name: 't1',
          onEntry: async () => { entries.push('t1'); },
          onExit: async () => { exits.push('t1'); }
        },
        t2: {
          name: 't2',
          onEntry: async () => { entries.push('t2'); }
        }
      },
      transitions: [
        { from: 's1', to: 's2', event: 'NEXT_S' },
        { from: 't1', to: 't2', event: 'NEXT_T' }
      ]
    };

    const engine = new FlowEngine(config, storage);
    await engine.start();

    expect(entries).toEqual(['s1', 't1']); // Entry actions on start
    entries.length = 0;

    await engine.execute((await storage.list())[0].flowId, {
      event: 'NEXT_S',
      targetRegion: '0'
    });

    expect(exits).toContain('s1');
    expect(entries).toContain('s2');
  });

  it('should get possible transitions from all parallel regions', async () => {
    const config: StateMachineConfig = {
      id: 'parallel-transitions',
      version: '1.0.0',
      initialState: 'parallel',
      states: {
        parallel: {
          name: 'parallel',
          type: 'parallel',
          regions: [
            { name: 'r1', initialState: 'a', states: ['a', 'b'] },
            { name: 'r2', initialState: 'x', states: ['x', 'y'] }
          ]
        },
        a: { name: 'a' },
        b: { name: 'b' },
        x: { name: 'x' },
        y: { name: 'y' }
      },
      transitions: [
        { from: 'a', to: 'b', event: 'EVENT_A' },
        { from: 'x', to: 'y', event: 'EVENT_X' },
        { from: 'x', to: 'y', event: 'EVENT_SHARED' },
        { from: 'a', to: 'b', event: 'EVENT_SHARED' }
      ]
    };

    const engine = new FlowEngine(config, storage);
    const flow = await engine.start();

    const possibleEvents = await engine.getPossibleTransitions(flow.flowId);
    
    expect(possibleEvents).toContain('EVENT_A');
    expect(possibleEvents).toContain('EVENT_X');
    expect(possibleEvents).toContain('EVENT_SHARED');
    expect(new Set(possibleEvents).size).toBe(3); // Should be unique
  });

  it('should handle error when transitioning with invalid region index', async () => {
    const config: StateMachineConfig = {
      id: 'parallel-error',
      version: '1.0.0',
      initialState: 'parallel',
      states: {
        parallel: {
          name: 'parallel',
          type: 'parallel',
          regions: [
            { name: 'r1', initialState: 'a', states: ['a'] }
          ]
        },
        a: { name: 'a' }
      },
      transitions: []
    };

    const engine = new FlowEngine(config, storage);
    const flow = await engine.start();

    // Invalid region should be caught by compensation mechanism
    const result = await engine.execute(flow.flowId, {
      event: 'ANY',
      targetRegion: '99' // Invalid region
    });

    expect(result.success).toBe(false);
    expect(result.state.status).toBe('failed');
    expect(result.state.error?.message).toContain('Invalid region index');
  });

  it('should handle no regions accepting an event', async () => {
    const config: StateMachineConfig = {
      id: 'parallel-no-match',
      version: '1.0.0',
      initialState: 'parallel',
      states: {
        parallel: {
          name: 'parallel',
          type: 'parallel',
          regions: [
            { name: 'r1', initialState: 'a', states: ['a'] }
          ]
        },
        a: { name: 'a' }
      },
      transitions: []
    };

    const engine = new FlowEngine(config, storage);
    const flow = await engine.start();

    const result = await engine.execute(flow.flowId, {
      event: 'NONEXISTENT'
    });

    expect(result.success).toBe(false);
    expect(result.transition.error?.message).toBe('No region accepted the event');
  });
});
