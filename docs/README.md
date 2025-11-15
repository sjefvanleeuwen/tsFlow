# tsFlow Documentation

Complete documentation for integrating and using tsFlow in your projects.

## 📚 Documentation Overview

### Getting Started
- **[Getting Started Guide](./getting-started.md)** - Install tsFlow and build your first workflow
  - Installation options (NPM, local, monorepo)
  - Basic setup and configuration
  - Your first workflow example
  - Core concepts explained

### Advanced Features
- **[Advanced Patterns](./advanced-patterns.md)** - Master advanced workflow patterns
  - Parallel States - Execute multiple regions concurrently
  - Hierarchical States - Nest state machines
  - Sub-Flow Composition - Reusable workflow components
  - Saga Pattern - Distributed transactions with compensation
  - Retry Logic - Automatic retry with backoff
  - Middleware - Hooks for logging, metrics, validation
  - Validation - Schema-based context validation

### YAML Workflows
- **[YAML Workflows](./yaml-workflows.md)** - Define workflows declaratively
  - Basic YAML syntax
  - Entry/exit actions
  - Context updates
  - Loading and hot-reloading
  - YAML vs TypeScript comparison
  - Limitations and best practices

### Real-World Examples
- **[Examples](./examples.md)** - Production-ready workflow templates
  - E-Commerce (shopping cart to delivery)
  - User Management (registration, verification)
  - Content Management (blog post workflow)
  - DevOps (infrastructure provisioning)
  - Finance (loan applications)
  - Healthcare, Support, IoT examples

### API Reference
- **[API Reference](../API_REFERENCE.md)** - Complete API documentation
  - FlowEngine API
  - StateMachine API
  - Storage interfaces
  - Type definitions
  - Middleware system
  - YAML parser

## 🚀 Quick Navigation

### I want to...

**...get started quickly**
→ Read [Getting Started](./getting-started.md)

**...see code examples**
→ Check out [Examples](./examples.md)

**...use YAML instead of TypeScript**
→ Read [YAML Workflows](./yaml-workflows.md)

**...implement parallel execution**
→ See [Parallel States](./advanced-patterns.md#parallel-states)

**...handle distributed transactions**
→ See [Saga Pattern](./advanced-patterns.md#saga-pattern-compensation)

**...add logging and metrics**
→ See [Middleware](./advanced-patterns.md#middleware)

**...understand the full API**
→ Read [API Reference](../API_REFERENCE.md)

## 📖 Learning Path

### Beginner
1. Read [Getting Started](./getting-started.md)
2. Follow "Your First Workflow" tutorial
3. Explore simple [Examples](./examples.md)
4. Try [YAML Workflows](./yaml-workflows.md)

### Intermediate
1. Learn [Parallel States](./advanced-patterns.md#parallel-states)
2. Implement [Saga Pattern](./advanced-patterns.md#saga-pattern-compensation)
3. Add [Middleware](./advanced-patterns.md#middleware)
4. Build a real-world example

### Advanced
1. Implement [Sub-Flow Composition](./advanced-patterns.md#sub-flow-composition)
2. Add [Retry Logic](./advanced-patterns.md#retry-logic)
3. Implement [Validation](./advanced-patterns.md#validation)
4. Build custom storage backends
5. Create production deployments

## 🎯 Use Cases

### E-Commerce
- Shopping cart management
- Order processing
- Payment flows
- Fulfillment and shipping
- Returns and refunds

### User Management
- Registration flows
- Email verification
- Multi-factor authentication
- Password reset
- Account upgrades

### Content Management
- Content approval workflows
- Publishing pipelines
- Version control
- Multi-stage reviews
- Scheduled publishing

### DevOps & Infrastructure
- CI/CD pipelines
- Infrastructure provisioning
- Deployment workflows
- Rollback procedures
- Environment management

### Finance & Banking
- Loan applications
- KYC processes
- Transaction processing
- Fraud detection flows
- Compliance workflows

### Healthcare
- Patient onboarding
- Appointment scheduling
- Treatment workflows
- Lab result processing
- Insurance claims

### Customer Support
- Ticket management
- Escalation workflows
- SLA tracking
- Resolution processes
- Feedback loops

### IoT & Hardware
- Device provisioning
- Firmware updates
- Commissioning flows
- Maintenance workflows
- Decommissioning

## 🔧 Core Concepts

### State Machine
A state machine defines the possible states and transitions in your workflow.

```typescript
const config: StateMachineConfig = {
  id: 'my-workflow',
  initialState: 'start',
  states: { /* ... */ }
};
```

### Flow Engine
The engine executes workflow instances based on state machine configurations.

```typescript
const engine = new FlowEngine(config);
const flow = await engine.start({ context: {...} });
```

### Flow State
Runtime state of a workflow instance, including current state, context, and history.

```typescript
const flow = await engine.getFlow(flowId);
console.log(flow.currentState); // 'processing'
console.log(flow.status);       // 'active'
```

### Context
Data that flows through your workflow, accessible in guards and actions.

```typescript
const flow = await engine.start({
  context: {
    orderId: 'ORD-123',
    amount: 99.99
  }
});
```

### Transitions
Move between states based on events.

```typescript
await engine.execute(flowId, {
  event: 'APPROVE',
  data: { approvedBy: 'admin' }
});
```

### Guards
Conditional logic that determines if a transition can occur.

```typescript
transitions: [{
  event: 'APPROVE',
  to: 'approved',
  guard: (context) => context.amount < 1000
}]
```

### Actions
Side effects executed during transitions.

```typescript
transitions: [{
  event: 'SHIP',
  to: 'shipped',
  action: (context) => {
    context.shippedAt = new Date().toISOString();
    sendNotification(context.email);
  }
}]
```

## 📊 Features Overview

### ✅ Production Ready
- Type-safe TypeScript
- Comprehensive test coverage (162+ tests)
- Battle-tested patterns
- Error handling
- Async/await support

### ⚡ Performance
- In-memory storage
- Efficient state transitions
- Minimal overhead
- Scalable architecture

### 🔌 Extensible
- Custom storage backends
- Middleware system
- Plugin architecture
- Framework agnostic

### 🛠️ Developer Experience
- Clean, intuitive API
- Full TypeScript support
- YAML DSL option
- Rich examples
- Complete documentation

### 🏢 Enterprise Features
- Saga pattern (compensation)
- Parallel execution
- Hierarchical states
- Sub-flow composition
- Retry logic
- Idempotency
- Validation
- Middleware

## 🤝 Contributing

Contributions welcome! Please read our contributing guidelines.

## 📄 License

[Your License Here]

## 🔗 Links

- **GitHub**: [Your Repo URL]
- **NPM**: [Package URL]
- **Issues**: [Issues URL]
- **Examples**: [examples/](../packages/flow-engine/examples/)

## 💡 Support

- **Documentation Issues**: [Open an issue](https://github.com/your-org/tsFlow/issues)
- **Questions**: [Discussions](https://github.com/your-org/tsFlow/discussions)
- **Bug Reports**: [Issue Tracker](https://github.com/your-org/tsFlow/issues)

---

**Ready to get started?** Begin with the [Getting Started Guide](./getting-started.md)!
