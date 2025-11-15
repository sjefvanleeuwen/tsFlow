import { describe, it, expect, beforeEach } from 'vitest';
import { StateMachine, StateMachineConfig, State } from '../state-machine.js';

describe('StateMachine', () => {
  describe('construction and validation', () => {
    it('should create a valid state machine', () => {
      const config: StateMachineConfig = {
        id: 'test-machine',
        initialState: 'idle',
        states: {
          idle: {
            name: 'idle',
            transitions: [
              { event: 'start', to: 'running' }
            ]
          },
          running: {
            name: 'running',
            transitions: [
              { event: 'stop', to: 'idle' }
            ]
          }
        }
      };

      const machine = new StateMachine(config);
      expect(machine.getId()).toBe('test-machine');
      expect(machine.getInitialState()).toBe('idle');
    });

    it('should throw error if initial state does not exist', () => {
      const config: StateMachineConfig = {
        id: 'test-machine',
        initialState: 'non-existent',
        states: {
          idle: {
            name: 'idle',
            transitions: []
          }
        }
      };

      expect(() => new StateMachine(config)).toThrow('Initial state "non-existent" not found');
    });

    it('should throw error if transition target does not exist', () => {
      const config: StateMachineConfig = {
        id: 'test-machine',
        initialState: 'idle',
        states: {
          idle: {
            name: 'idle',
            transitions: [
              { event: 'start', to: 'non-existent' }
            ]
          }
        },
        transitions: [
          { from: 'idle', event: 'start', to: 'non-existent' }
        ]
      };

      expect(() => new StateMachine(config)).toThrow('Transition target "non-existent"');
    });
  });

  describe('state queries', () => {
    let machine: StateMachine;

    beforeEach(() => {
      const config: StateMachineConfig = {
        id: 'test-machine',
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
            transitions: [],
            isFinal: true
          },
          rejected: {
            name: 'rejected',
            transitions: [],
            isFinal: true
          }
        }
      };

      machine = new StateMachine(config);
    });

    it('should get state by name', () => {
      const state = machine.getState('pending');
      expect(state).toBeDefined();
      expect(state?.name).toBe('pending');
    });

    it('should return undefined for non-existent state', () => {
      const state = machine.getState('non-existent');
      expect(state).toBeUndefined();
    });

    it('should get all state names', () => {
      const states = machine.getAllStates();
      expect(states).toEqual(['pending', 'approved', 'rejected']);
    });

    it('should identify final states', () => {
      expect(machine.isFinalState('pending')).toBe(false);
      expect(machine.isFinalState('approved')).toBe(true);
      expect(machine.isFinalState('rejected')).toBe(true);
    });

    it('should get transitions for a state', () => {
      const transitions = machine.getTransitions('pending');
      expect(transitions).toHaveLength(2);
      expect(transitions.map(t => t.event)).toEqual(['approve', 'reject']);
    });
  });

  describe('transition execution', () => {
    it('should execute a simple transition', async () => {
      const config: StateMachineConfig = {
        id: 'test-machine',
        initialState: 'idle',
        states: {
          idle: {
            name: 'idle',
            transitions: [{ event: 'start', to: 'running' }]
          },
          running: {
            name: 'running',
            transitions: []
          }
        }
      };

      const machine = new StateMachine(config);
      const result = await machine.executeTransition('idle', 'start', {});

      expect(result.success).toBe(true);
      expect(result.fromState).toBe('idle');
      expect(result.toState).toBe('running');
      expect(result.event).toBe('start');
    });

    it('should fail transition for invalid event', async () => {
      const config: StateMachineConfig = {
        id: 'test-machine',
        initialState: 'idle',
        states: {
          idle: {
            name: 'idle',
            transitions: [{ event: 'start', to: 'running' }]
          },
          running: {
            name: 'running',
            transitions: []
          }
        }
      };

      const machine = new StateMachine(config);
      const result = await machine.executeTransition('idle', 'invalid', {});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('No valid transition');
    });

    it('should execute transition with guard', async () => {
      const config: StateMachineConfig = {
        id: 'test-machine',
        initialState: 'idle',
        states: {
          idle: {
            name: 'idle',
            transitions: [
              {
                event: 'start',
                to: 'running',
                guard: (context) => context.allowed === true
              }
            ]
          },
          running: {
            name: 'running',
            transitions: []
          }
        }
      };

      const machine = new StateMachine(config);

      // Guard allows transition
      const result1 = await machine.executeTransition('idle', 'start', { allowed: true });
      expect(result1.success).toBe(true);

      // Guard blocks transition
      const result2 = await machine.executeTransition('idle', 'start', { allowed: false });
      expect(result2.success).toBe(false);
    });

    it('should execute transition action', async () => {
      const context = { counter: 0 };

      const config: StateMachineConfig = {
        id: 'test-machine',
        initialState: 'idle',
        states: {
          idle: {
            name: 'idle',
            transitions: [
              {
                event: 'start',
                to: 'running',
                action: (ctx) => { ctx.counter += 1; }
              }
            ]
          },
          running: {
            name: 'running',
            transitions: []
          }
        }
      };

      const machine = new StateMachine(config);
      await machine.executeTransition('idle', 'start', context);

      expect(context.counter).toBe(1);
    });

    it('should execute entry and exit actions', async () => {
      const log: string[] = [];

      const config: StateMachineConfig = {
        id: 'test-machine',
        initialState: 'idle',
        states: {
          idle: {
            name: 'idle',
            transitions: [{ event: 'start', to: 'running' }],
            onExit: () => { log.push('exit-idle'); }
          },
          running: {
            name: 'running',
            transitions: [],
            onEntry: () => { log.push('enter-running'); }
          }
        }
      };

      const machine = new StateMachine(config);
      await machine.executeTransition('idle', 'start', {});

      expect(log).toEqual(['exit-idle', 'enter-running']);
    });

    it('should handle errors in actions', async () => {
      const config: StateMachineConfig = {
        id: 'test-machine',
        initialState: 'idle',
        states: {
          idle: {
            name: 'idle',
            transitions: [
              {
                event: 'start',
                to: 'running',
                action: () => { throw new Error('Action failed'); }
              }
            ]
          },
          running: {
            name: 'running',
            transitions: []
          }
        }
      };

      const machine = new StateMachine(config);
      const result = await machine.executeTransition('idle', 'start', {});

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Action failed');
    });

    it('should call error handler on transition failure', async () => {
      let errorHandled = false;

      const config: StateMachineConfig = {
        id: 'test-machine',
        initialState: 'idle',
        states: {
          idle: {
            name: 'idle',
            transitions: [
              {
                event: 'start',
                to: 'running',
                action: () => { throw new Error('Action failed'); }
              }
            ]
          },
          running: {
            name: 'running',
            transitions: []
          }
        },
        onError: () => { errorHandled = true; }
      };

      const machine = new StateMachine(config);
      await machine.executeTransition('idle', 'start', {});

      expect(errorHandled).toBe(true);
    });
  });

  describe('complex workflows', () => {
    it('should handle multiple transitions in sequence', async () => {
      const config: StateMachineConfig = {
        id: 'order-flow',
        initialState: 'cart',
        states: {
          cart: {
            name: 'cart',
            transitions: [{ event: 'checkout', to: 'payment' }]
          },
          payment: {
            name: 'payment',
            transitions: [
              { event: 'pay', to: 'processing' },
              { event: 'cancel', to: 'cart' }
            ]
          },
          processing: {
            name: 'processing',
            transitions: [
              { event: 'confirm', to: 'shipped' },
              { event: 'fail', to: 'payment' }
            ]
          },
          shipped: {
            name: 'shipped',
            transitions: [],
            isFinal: true
          }
        }
      };

      const machine = new StateMachine(config);
      let currentState = 'cart';

      // cart -> payment
      let result = await machine.executeTransition(currentState, 'checkout', {});
      expect(result.success).toBe(true);
      currentState = Array.isArray(result.toState) ? result.toState[0] : result.toState;

      // payment -> processing
      result = await machine.executeTransition(currentState, 'pay', {});
      expect(result.success).toBe(true);
      currentState = Array.isArray(result.toState) ? result.toState[0] : result.toState;

      // processing -> shipped
      result = await machine.executeTransition(currentState, 'confirm', {});
      expect(result.success).toBe(true);
      expect(result.toState).toBe('shipped');
      const finalState = Array.isArray(result.toState) ? result.toState[0] : result.toState;
      expect(machine.isFinalState(finalState)).toBe(true);
    });
  });
});

