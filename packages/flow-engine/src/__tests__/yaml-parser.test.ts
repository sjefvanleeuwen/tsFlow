import { describe, it, expect } from 'vitest';
import { YamlFlowParser } from '../yaml-parser.js';
import { FlowEngine } from '../flow-engine.js';
import { InMemoryStateStorage } from '../storage.js';
import { State, isAtomicState } from '../state-machine.js';

describe('YamlFlowParser', () => {
  describe('basic parsing', () => {
    it('should parse a simple flow definition', () => {
      const yaml = `
id: simple-flow
initial: start
states:
  start:
    on:
      next: end
  end:
    final: true
`;

      const config = YamlFlowParser.fromYaml(yaml);

      expect(config.id).toBe('simple-flow');
      expect(config.initialState).toBe('start');
      expect(Object.keys(config.states)).toHaveLength(2);
    });

    it('should throw error for missing id', () => {
      const yaml = `
initial: start
states:
  start:
    on:
      next: end
`;

      expect(() => YamlFlowParser.fromYaml(yaml)).toThrow('must have an "id"');
    });

    it('should throw error for missing initial state', () => {
      const yaml = `
id: test
states:
  start:
    on:
      next: end
`;

      expect(() => YamlFlowParser.fromYaml(yaml)).toThrow('must have an "initial"');
    });

    it('should throw error if initial state not in states', () => {
      const yaml = `
id: test
initial: nonexistent
states:
  start:
    on:
      next: end
`;

      expect(() => YamlFlowParser.fromYaml(yaml)).toThrow('Initial state "nonexistent" not found');
    });
  });

  describe('state transitions', () => {
    it('should parse simple string transitions', () => {
      const yaml = `
id: test
initial: a
states:
  a:
    on:
      go: b
  b:
    final: true
`;

      const config = YamlFlowParser.fromYaml(yaml);
      const stateA = config.states['a'] as State;

      expect(stateA?.transitions).toHaveLength(1);
      expect(stateA?.transitions?.[0]).toMatchObject({
        event: 'go',
        to: 'b'
      });
    });

    it('should parse multiple transitions', () => {
      const yaml = `
id: test
initial: start
states:
  start:
    on:
      approve: approved
      reject: rejected
  approved:
    final: true
  rejected:
    final: true
`;

      const config = YamlFlowParser.fromYaml(yaml);
      const startState = config.states['start'] as State;

      expect(startState?.transitions).toHaveLength(2);
      expect(startState?.transitions?.map(t => t.event)).toEqual(['approve', 'reject']);
    });

    it('should parse states without transitions', () => {
      const yaml = `
id: test
initial: start
states:
  start:
    final: true
`;

      const config = YamlFlowParser.fromYaml(yaml);
      const startState = config.states['start'] as State;

      expect(startState?.transitions).toHaveLength(0);
      expect(startState?.isFinal).toBe(true);
    });
  });

  describe('final states', () => {
    it('should mark final states correctly', () => {
      const yaml = `
id: test
initial: start
states:
  start:
    on:
      finish: end
  end:
    final: true
`;

      const config = YamlFlowParser.fromYaml(yaml);
      const endState = config.states['end'] as State;

      expect(endState?.isFinal).toBe(true);
    });
  });

  describe('guards and actions', () => {
    it('should parse guards', () => {
      const yaml = `
id: test
initial: start
states:
  start:
    on:
      proceed:
        to: next
        guard: "age >= 18"
  next:
    final: true
`;

      const config = YamlFlowParser.fromYaml(yaml);
      const startState = config.states['start'] as State;

      expect(startState?.transitions?.[0].guard).toBeDefined();
    });

    it('should evaluate guards correctly', async () => {
      const yaml = `
id: test
initial: start
states:
  start:
    on:
      proceed:
        to: allowed
        guard: "age >= 18"
  allowed:
    final: true
`;

      const config = YamlFlowParser.fromYaml(yaml);
      const engine = new FlowEngine(config, new InMemoryStateStorage());

      // Adult can proceed
      const flow1 = await engine.start({ context: { age: 25 } });
      const result1 = await engine.execute(flow1.flowId, { event: 'proceed' });
      expect(result1.success).toBe(true);

      // Minor cannot proceed
      const flow2 = await engine.start({ context: { age: 16 } });
      const result2 = await engine.execute(flow2.flowId, { event: 'proceed' });
      expect(result2.success).toBe(false);
    });

    it('should parse actions', () => {
      const yaml = `
id: test
initial: start
states:
  start:
    on:
      next:
        to: end
        action: "context.visited = true"
  end:
    final: true
`;

      const config = YamlFlowParser.fromYaml(yaml);
      const startState = config.states['start'] as State;

      expect(startState?.transitions?.[0].action).toBeDefined();
    });

    it('should execute actions correctly', async () => {
      const yaml = `
id: test
initial: start
states:
  start:
    on:
      next:
        to: end
        action: "context.counter = (context.counter || 0) + 1"
  end:
    final: true
`;

      const config = YamlFlowParser.fromYaml(yaml);
      const engine = new FlowEngine(config, new InMemoryStateStorage());

      const flow = await engine.start({ context: {} });
      await engine.execute(flow.flowId, { event: 'next' });

      const updated = await engine.getFlow(flow.flowId);
      expect(updated?.context.counter).toBe(1);
    });
  });

  describe('entry and exit actions', () => {
    it('should parse entry actions', () => {
      const yaml = `
id: test
initial: start
states:
  start:
    entry: "context.entered = true"
    final: true
`;

      const config = YamlFlowParser.fromYaml(yaml);
      const startState = config.states['start'];

      expect(startState?.onEntry).toBeDefined();
    });

    it('should parse exit actions', () => {
      const yaml = `
id: test
initial: start
states:
  start:
    exit: "context.exited = true"
    on:
      next: end
  end:
    final: true
`;

      const config = YamlFlowParser.fromYaml(yaml);
      const startState = config.states['start'];

      expect(startState?.onExit).toBeDefined();
    });

    it('should execute entry and exit actions', async () => {
      const yaml = `
id: test
initial: start
states:
  start:
    exit: "context.exitedStart = true"
    on:
      next: end
  end:
    entry: "context.enteredEnd = true"
    final: true
`;

      const config = YamlFlowParser.fromYaml(yaml);
      const engine = new FlowEngine(config, new InMemoryStateStorage());

      const flow = await engine.start({ context: {} });
      await engine.execute(flow.flowId, { event: 'next' });

      const updated = await engine.getFlow(flow.flowId);
      expect(updated?.context.exitedStart).toBe(true);
      expect(updated?.context.enteredEnd).toBe(true);
    });
  });

  describe('custom functions', () => {
    it('should use custom functions in guards', async () => {
      const yaml = `
id: test
initial: start
states:
  start:
    on:
      proceed:
        to: allowed
        guard: "isAdmin(user)"
  allowed:
    final: true
`;

      const config = YamlFlowParser.fromYaml(yaml, {
        functions: {
          isAdmin: (user: any) => user?.role === 'admin'
        }
      });

      const engine = new FlowEngine(config, new InMemoryStateStorage());

      // Admin can proceed
      const flow1 = await engine.start({ context: { user: { role: 'admin' } } });
      const result1 = await engine.execute(flow1.flowId, { event: 'proceed' });
      expect(result1.success).toBe(true);

      // Regular user cannot
      const flow2 = await engine.start({ context: { user: { role: 'user' } } });
      const result2 = await engine.execute(flow2.flowId, { event: 'proceed' });
      expect(result2.success).toBe(false);
    });

    it('should use custom functions in actions', async () => {
      const yaml = `
id: test
initial: start
states:
  start:
    on:
      notify:
        to: end
        action: "sendEmail(context.email)"
  end:
    final: true
`;

      let emailSent = '';

      const config = YamlFlowParser.fromYaml(yaml, {
        functions: {
          sendEmail: (email: string) => { emailSent = email; }
        }
      });

      const engine = new FlowEngine(config, new InMemoryStateStorage());

      const flow = await engine.start({ context: { email: 'test@example.com' } });
      await engine.execute(flow.flowId, { event: 'notify' });

      expect(emailSent).toBe('test@example.com');
    });
  });

  describe('real-world examples', () => {
    it('should handle an order approval flow', async () => {
      const yaml = `
id: order-approval
initial: pending
states:
  pending:
    on:
      approve:
        to: approved
        guard: "amount < 10000"
      escalate:
        to: manager-review
        guard: "amount >= 10000"
      reject: rejected
  manager-review:
    on:
      approve: approved
      reject: rejected
  approved:
    on:
      ship: shipped
  rejected:
    final: true
  shipped:
    final: true
`;

      const config = YamlFlowParser.fromYaml(yaml);
      const engine = new FlowEngine(config, new InMemoryStateStorage());

      // Small order - direct approval
      const flow1 = await engine.start({ context: { amount: 5000 } });
      const result1 = await engine.execute(flow1.flowId, { event: 'approve' });
      expect(result1.success).toBe(true);
      expect(result1.state.currentState).toBe('approved');

      // Large order - needs escalation (approve won't work due to guard)
      const flow2 = await engine.start({ context: { amount: 15000 } });
      
      // Use escalate directly since approve is blocked by guard
      const result2 = await engine.execute(flow2.flowId, { event: 'escalate' });
      expect(result2.success).toBe(true);
      expect(result2.state.currentState).toBe('manager-review');
    });
  });
});

