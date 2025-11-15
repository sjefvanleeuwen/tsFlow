# @tsflow/flow-engine

Enterprise TypeScript workflow engine with state machines, parallel execution, saga patterns, and YAML DSL.

## Installation

```bash
npm install @tsflow/flow-engine
```

## Quick Start

```typescript
import { FlowEngine, StateMachineConfig } from '@tsflow/flow-engine';

const config: StateMachineConfig = {
  id: 'order-flow',
  initialState: 'pending',
  states: {
    pending: {
      name: 'pending',
      transitions: [
        { event: 'APPROVE', to: 'approved' },
        { event: 'REJECT', to: 'rejected' }
      ]
    },
    approved: { name: 'approved', type: 'final' },
    rejected: { name: 'rejected', type: 'final' }
  }
};

const engine = new FlowEngine(config);
const flow = await engine.start({ context: { orderId: '12345' } });

await engine.execute(flow.flowId, { event: 'APPROVE' });
console.log('Order approved!');
```

## Features

- 🎯 **State Machine Core** - Robust state machine with transitions, guards, and actions
- ⚡ **Parallel States** - Execute multiple regions concurrently
- 🏗️ **Hierarchical States** - Nested state machines for complex workflows
- 🎭 **Saga Pattern** - Built-in compensation/rollback for distributed transactions
- 🔁 **Sub-Flows** - Compose workflows from reusable components
- 🔌 **Middleware** - Hooks for logging, metrics, observability
- ♻️ **Retry Logic** - Automatic retry with exponential backoff
- 🔐 **Idempotency** - Prevent duplicate executions
- ✅ **Validation** - Schema-based context validation
- 📝 **YAML DSL** - Define workflows declaratively
- 🏷️ **Type-Safe** - Full TypeScript support
- 🧪 **Well Tested** - 162+ comprehensive tests

## Documentation

Complete documentation available at:
- [Getting Started](https://github.com/sjefvanleeuwen/tsFlow/blob/main/docs/getting-started.md)
- [Advanced Patterns](https://github.com/sjefvanleeuwen/tsFlow/blob/main/docs/advanced-patterns.md)
- [YAML Workflows](https://github.com/sjefvanleeuwen/tsFlow/blob/main/docs/yaml-workflows.md)
- [Examples](https://github.com/sjefvanleeuwen/tsFlow/blob/main/docs/examples.md)
- [API Reference](https://github.com/sjefvanleeuwen/tsFlow/blob/main/API_REFERENCE.md)

## Use Cases

- E-Commerce (order processing, payments, fulfillment)
- User Management (registration, verification, onboarding)
- Content Management (approval workflows, publishing)
- DevOps (CI/CD, infrastructure provisioning)
- Finance (loan applications, KYC, transactions)
- Customer Support (ticket management, escalation)
- IoT (device provisioning, commissioning)

## License

MIT

## Repository

https://github.com/sjefvanleeuwen/tsFlow
