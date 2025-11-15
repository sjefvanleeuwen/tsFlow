# Getting Started with tsFlow

A comprehensive guide to integrating tsFlow workflow engine into your project.

## Table of Contents

- [Installation](#installation)
- [Basic Setup](#basic-setup)
- [Core Concepts](#core-concepts)
- [Your First Workflow](#your-first-workflow)
- [Configuration Options](#configuration-options)
- [Next Steps](#next-steps)

## Installation

### Option 1: Install from NPM (Coming Soon)

```bash
npm install @tsflow/flow-engine
# or
yarn add @tsflow/flow-engine
# or
pnpm add @tsflow/flow-engine
```

### Option 2: Use as Local Package (Development)

1. Clone the tsFlow repository:
```bash
git clone <your-repo-url>
cd tsFlow
```

2. Install dependencies and build:
```bash
npm install
npm run build
```

3. Link to your project:
```bash
cd packages/flow-engine
npm link

# In your project
cd /path/to/your-project
npm link @tsflow/flow-engine
```

### Option 3: Direct File Reference (Monorepo)

If both projects are in the same workspace:

```json
{
  "dependencies": {
    "@tsflow/flow-engine": "file:../tsFlow/packages/flow-engine"
  }
}
```

## Basic Setup

### TypeScript Configuration

Ensure your `tsconfig.json` supports ES modules:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "strict": true
  }
}
```

### Package.json Configuration

Add `"type": "module"` for ES modules:

```json
{
  "name": "your-project",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@tsflow/flow-engine": "^0.0.1"
  }
}
```

## Core Concepts

### 1. State Machine Config

The blueprint of your workflow:

```typescript
import { StateMachineConfig } from '@tsflow/flow-engine';

const config: StateMachineConfig = {
  id: 'my-workflow',
  initialState: 'start',
  states: {
    start: {
      name: 'start',
      transitions: [
        { event: 'next', to: 'processing' }
      ]
    },
    processing: {
      name: 'processing',
      transitions: [
        { event: 'complete', to: 'done' }
      ]
    },
    done: {
      name: 'done',
      type: 'final'
    }
  }
};
```

### 2. Flow Engine

The execution engine that manages workflow instances:

```typescript
import { FlowEngine, InMemoryStateStorage } from '@tsflow/flow-engine';

const storage = new InMemoryStateStorage();
const engine = new FlowEngine(config, storage);
```

### 3. Flow State

Runtime state of a workflow instance:

```typescript
interface FlowState {
  flowId: string;                    // Unique flow instance ID
  flowDefinitionId: string;          // Config ID
  currentState: string;              // Current state name
  status: 'active' | 'completed' | 'paused' | 'cancelled' | 'failed';
  context: Record<string, any>;      // Workflow data
  history: TransitionRecord[];       // State transitions
  createdAt: Date;
  updatedAt: Date;
}
```

## Your First Workflow

Let's build a simple order processing workflow.

### Step 1: Define the Workflow

Create `order-workflow.ts`:

```typescript
import {
  FlowEngine,
  StateMachineConfig,
  InMemoryStateStorage
} from '@tsflow/flow-engine';

// Define states and transitions
const orderWorkflow: StateMachineConfig = {
  id: 'order-processing',
  initialState: 'pending',
  states: {
    pending: {
      name: 'pending',
      transitions: [
        {
          event: 'APPROVE',
          to: 'approved',
          guard: (context) => context.amount < 10000,
          action: (context) => {
            context.approvedAt = new Date().toISOString();
            console.log(`Order ${context.orderId} approved`);
          }
        },
        {
          event: 'REJECT',
          to: 'rejected',
          action: (context) => {
            context.rejectedAt = new Date().toISOString();
            console.log(`Order ${context.orderId} rejected`);
          }
        }
      ]
    },
    approved: {
      name: 'approved',
      transitions: [
        {
          event: 'PROCESS_PAYMENT',
          to: 'payment_processing',
          action: (context) => {
            console.log(`Processing payment for order ${context.orderId}`);
          }
        }
      ]
    },
    payment_processing: {
      name: 'payment_processing',
      transitions: [
        { event: 'PAYMENT_SUCCESS', to: 'paid' },
        { event: 'PAYMENT_FAILED', to: 'payment_failed' }
      ]
    },
    paid: {
      name: 'paid',
      transitions: [
        {
          event: 'SHIP',
          to: 'shipped',
          action: (context) => {
            context.shippedAt = new Date().toISOString();
            console.log(`Order ${context.orderId} shipped`);
          }
        }
      ]
    },
    shipped: {
      name: 'shipped',
      transitions: [
        { event: 'DELIVER', to: 'delivered' }
      ]
    },
    delivered: {
      name: 'delivered',
      type: 'final'
    },
    rejected: {
      name: 'rejected',
      type: 'final'
    },
    payment_failed: {
      name: 'payment_failed',
      type: 'final'
    }
  }
};

// Create engine
const storage = new InMemoryStateStorage();
const engine = new FlowEngine(orderWorkflow, storage);

export { engine };
```

### Step 2: Use the Workflow

Create `process-order.ts`:

```typescript
import { engine } from './order-workflow.js';

async function processOrder() {
  // Start a new order workflow
  const order = await engine.start({
    context: {
      orderId: 'ORD-12345',
      amount: 299.99,
      customerId: 'CUST-456',
      items: [
        { sku: 'WIDGET-1', quantity: 2, price: 149.99 }
      ]
    }
  });

  console.log('Order flow started:', order.flowId);
  console.log('Current state:', order.currentState); // 'pending'

  // Approve the order
  const approvalResult = await engine.execute(order.flowId, {
    event: 'APPROVE',
    data: { approvedBy: 'manager@company.com' }
  });

  console.log('Order approved:', approvalResult.success);

  // Process payment
  await engine.execute(order.flowId, {
    event: 'PROCESS_PAYMENT'
  });

  // Simulate payment success
  await engine.execute(order.flowId, {
    event: 'PAYMENT_SUCCESS',
    data: {
      transactionId: 'TXN-789',
      paymentMethod: 'credit_card'
    }
  });

  // Ship the order
  await engine.execute(order.flowId, {
    event: 'SHIP',
    data: {
      carrier: 'FedEx',
      trackingNumber: 'TRACK-123456'
    }
  });

  // Deliver
  await engine.execute(order.flowId, {
    event: 'DELIVER'
  });

  // Get final state
  const finalState = await engine.getFlow(order.flowId);
  console.log('\n📦 Final Order State:');
  console.log('Status:', finalState?.status);
  console.log('Current State:', finalState?.currentState);
  console.log('Context:', JSON.stringify(finalState?.context, null, 2));
  console.log('\n📜 History:');
  finalState?.history.forEach((h, i) => {
    console.log(`${i + 1}. ${h.from} → ${h.to} (${h.event})`);
  });
}

processOrder().catch(console.error);
```

### Step 3: Run It

```bash
npx tsx process-order.ts
```

Expected output:
```
Order flow started: abc-123-def
Current state: pending
Order ORD-12345 approved
Order approved: true
Processing payment for order ORD-12345
Order ORD-12345 shipped

📦 Final Order State:
Status: completed
Current State: delivered
Context: {
  "orderId": "ORD-12345",
  "amount": 299.99,
  "customerId": "CUST-456",
  "approvedAt": "2024-11-15T10:30:00.000Z",
  "shippedAt": "2024-11-15T10:30:02.000Z",
  ...
}

📜 History:
1. pending → approved (APPROVE)
2. approved → payment_processing (PROCESS_PAYMENT)
3. payment_processing → paid (PAYMENT_SUCCESS)
4. paid → shipped (SHIP)
5. shipped → delivered (DELIVER)
```

## Configuration Options

### Guards - Conditional Transitions

Guards prevent transitions unless conditions are met:

```typescript
transitions: [
  {
    event: 'APPROVE',
    to: 'approved',
    guard: (context) => {
      // Only allow approval if amount is under limit
      return context.amount < 10000;
    }
  }
]
```

### Actions - Side Effects

Actions execute code during transitions:

```typescript
transitions: [
  {
    event: 'SHIP',
    to: 'shipped',
    action: (context) => {
      // Update context
      context.shippedAt = new Date().toISOString();
      
      // Call external services
      sendShippingNotification(context.email);
      
      // Log events
      console.log(`Shipped order ${context.orderId}`);
    }
  }
]
```

### Entry/Exit Actions

Execute code when entering or leaving a state:

```typescript
states: {
  payment_processing: {
    name: 'payment_processing',
    onEntry: (context) => {
      console.log('Entering payment processing');
      context.paymentStartedAt = new Date().toISOString();
    },
    onExit: (context) => {
      console.log('Exiting payment processing');
      context.paymentEndedAt = new Date().toISOString();
    },
    transitions: [...]
  }
}
```

### Context Data

Pass data through your workflow:

```typescript
// Initial context
const flow = await engine.start({
  context: {
    orderId: 'ORD-123',
    items: [...],
    total: 99.99
  }
});

// Add data during transitions
await engine.execute(flowId, {
  event: 'APPROVE',
  data: {
    approvedBy: 'admin',
    approvalNotes: 'Looks good'
  }
});

// Access in guards/actions
guard: (context) => context.approvedBy === 'admin'
action: (context) => sendEmail(context.approvedBy)
```

### Idempotency

Prevent duplicate operations:

```typescript
// Starting a flow
const flow = await engine.start({
  context: { orderId: 'ORD-123' },
  idempotencyKey: 'create-order-123'  // Won't create duplicate if called again
});

// Executing events
await engine.execute(flowId, {
  event: 'PROCESS_PAYMENT',
  idempotencyKey: 'payment-order-123'  // Won't process payment twice
});
```

## Next Steps

Now that you understand the basics, explore advanced features:

- **[Advanced Patterns](./advanced-patterns.md)** - Parallel states, hierarchical states, saga pattern
- **[YAML Workflows](./yaml-workflows.md)** - Define workflows declaratively
- **[Enterprise Features](./enterprise-features.md)** - Middleware, retry logic, validation
- **[Storage Backends](./storage-backends.md)** - Implement custom storage (Redis, PostgreSQL, etc.)
- **[API Reference](../API_REFERENCE.md)** - Complete API documentation
- **[Examples](./examples.md)** - Real-world workflow examples

## Common Use Cases

tsFlow is perfect for:

- **Order Processing** - Shopping carts, payments, fulfillment
- **User Onboarding** - Multi-step registration, verification
- **Approval Workflows** - Document review, expense approval
- **Infrastructure Provisioning** - Cloud resource deployment
- **Data Pipelines** - ETL, data transformations
- **Customer Support** - Ticket routing, escalation
- **IoT Device Management** - Installation, commissioning, monitoring

## Getting Help

- **Issues**: [GitHub Issues](https://github.com/your-org/tsFlow/issues)
- **Documentation**: [Full Documentation](../README.md)
- **Examples**: [examples/](../packages/flow-engine/examples/)

---

**Ready to build something awesome?** Check out the [Advanced Patterns](./advanced-patterns.md) guide next!
