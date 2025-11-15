# tsFlow - Enterprise TypeScript Workflow Engine

A powerful, production-ready workflow engine built with TypeScript. Features a robust state machine core with advanced enterprise capabilities including parallel execution, hierarchical states, saga patterns, middleware, retry logic, idempotency, and validation.

## ✨ Features

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

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Build packages
npm run build

# Run tests
npm test
```

### Your First Workflow

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

### YAML Workflows

```yaml
id: order-flow
initial: pending

states:
  pending:
    on:
      APPROVE: approved
      REJECT: rejected
  approved:
    final: true
  rejected:
    final: true
```

## 📚 Documentation

### For Users Integrating tsFlow

Complete documentation for using tsFlow in your projects:

- **[Getting Started](./docs/getting-started.md)** - Installation, setup, and your first workflow
- **[Advanced Patterns](./docs/advanced-patterns.md)** - Parallel states, saga pattern, sub-flows, middleware
- **[YAML Workflows](./docs/yaml-workflows.md)** - Declarative workflow definitions
- **[Examples](./docs/examples.md)** - Real-world production examples (e-commerce, DevOps, finance, etc.)
- **[API Reference](./API_REFERENCE.md)** - Complete API documentation

👉 **Start here:** [Documentation Home](./docs/README.md)

## 🎯 Use Cases

- **E-Commerce** - Order processing, payments, fulfillment
- **User Management** - Registration, verification, onboarding
- **Content Management** - Approval workflows, publishing pipelines
- **DevOps** - CI/CD, infrastructure provisioning, deployments
- **Finance** - Loan applications, KYC, transaction processing
- **Customer Support** - Ticket management, escalation workflows
- **IoT** - Device provisioning, commissioning, updates

## 🏗️ Architecture

```
tsFlow/
├── packages/
│   └── flow-engine/          # Core workflow engine package
│       ├── src/
│       │   ├── flow-engine.ts      # Main FlowEngine class
│       │   ├── state-machine.ts    # State machine implementation
│       │   ├── storage.ts          # Storage interfaces
│       │   └── yaml-parser.ts      # YAML DSL parser
│       ├── examples/               # Example workflows
│       └── tests/                  # Comprehensive test suite
├── docs/                     # Complete documentation
└── examples/                 # Additional examples
```

## 🧪 Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# Run specific test file
npm test flow-engine.test.ts
```

Current test status: **162 tests passing** ✅

## 📦 Package Structure

- **@tsflow/flow-engine** - Main workflow engine package
  - FlowEngine - High-level workflow orchestration
  - StateMachine - Core state machine implementation
  - Storage - Pluggable storage backends
  - YamlParser - YAML workflow parser

## 🤝 Contributing

Contributions are welcome! This is a monorepo using:
- **Turbo** - Build system
- **TypeScript** - Language
- **Vitest** - Testing
- **Vite** - Build tool

## 📄 License

[Your License Here]

## 🔗 Links

- **Documentation**: [docs/](./docs/)
- **Examples**: [examples/](./packages/flow-engine/examples/)
- **Tests**: [tests/](./packages/flow-engine/tests/)

---

**Ready to build workflows?** Start with the [Getting Started Guide](./docs/getting-started.md)!
