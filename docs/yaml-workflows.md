# YAML Workflows

Define workflows declaratively using YAML for cleaner, more maintainable configurations.

## Table of Contents

- [Why YAML?](#why-yaml)
- [Basic Syntax](#basic-syntax)
- [YAML vs TypeScript](#yaml-vs-typescript)
- [Complete Examples](#complete-examples)
- [Advanced YAML Features](#advanced-yaml-features)
- [Loading YAML Files](#loading-yaml-files)
- [Limitations](#limitations)

## Why YAML?

**Benefits of YAML workflows:**
- ✅ **Declarative** - Focus on "what" not "how"
- ✅ **Readable** - Easy to understand and review
- ✅ **Versionable** - Track changes in git
- ✅ **Portable** - Share workflows across teams
- ✅ **Non-Technical Friendly** - Business users can read/write
- ✅ **No Compilation** - Edit and reload instantly

**When to use TypeScript instead:**
- Complex business logic in guards/actions
- Need strong typing and IDE support
- Heavy integration with TypeScript codebase
- Dynamic workflow generation

## Basic Syntax

### Minimal YAML Workflow

```yaml
id: simple-flow
initial: start

states:
  start:
    on:
      next: processing

  processing:
    on:
      complete: done

  done:
    final: true
```

### With Entry/Exit Actions

```yaml
id: workflow-with-actions
initial: idle

states:
  idle:
    entry: "console.log('Workflow started')"
    on:
      start: working

  working:
    entry: "console.log('Working...'); context.startedAt = new Date().toISOString()"
    exit: "console.log('Work complete')"
    on:
      finish: completed

  completed:
    entry: "console.log('All done!')"
    final: true
```

### With Transition Actions

```yaml
id: approval-flow
initial: pending

states:
  pending:
    on:
      approve:
        to: approved
        action: "context.approvedAt = new Date().toISOString(); console.log('Approved!')"
      reject:
        to: rejected
        action: "context.rejectedAt = new Date().toISOString(); console.log('Rejected')"

  approved:
    final: true

  rejected:
    final: true
```

## YAML vs TypeScript

### TypeScript Configuration

```typescript
const config: StateMachineConfig = {
  id: 'order-flow',
  initialState: 'pending',
  states: {
    pending: {
      name: 'pending',
      transitions: [
        {
          event: 'APPROVE',
          to: 'approved',
          guard: (context) => context.amount < 1000,
          action: (context) => {
            context.approvedAt = new Date().toISOString();
            sendNotification(context.email);
          }
        }
      ]
    },
    approved: {
      name: 'approved',
      type: 'final'
    }
  }
};
```

### Equivalent YAML

```yaml
id: order-flow
initial: pending

states:
  pending:
    on:
      APPROVE:
        to: approved
        action: "context.approvedAt = new Date().toISOString()"

  approved:
    final: true
```

**Note**: Complex guards and actions (like `sendNotification()`) require TypeScript. YAML actions support simple JavaScript expressions.

## Complete Examples

### Example 1: Order Processing

```yaml
id: order-processing
initial: created

states:
  created:
    entry: "console.log('📦 Order created:', context.orderId)"
    on:
      validate: validating

  validating:
    entry: "console.log('✅ Validating order...')"
    on:
      valid: payment_pending
      invalid: validation_failed

  payment_pending:
    entry: "console.log('💳 Awaiting payment...')"
    on:
      payment_received: processing_payment

  processing_payment:
    entry: "console.log('💰 Processing payment...'); context.paymentStartedAt = new Date().toISOString()"
    exit: "console.log('✅ Payment processed'); context.paymentCompletedAt = new Date().toISOString()"
    on:
      payment_success: paid
      payment_failed: payment_failed

  paid:
    entry: "console.log('✅ Payment successful')"
    on:
      ship: shipped

  shipped:
    entry: "console.log('🚚 Order shipped'); context.shippedAt = new Date().toISOString()"
    on:
      deliver: delivered

  delivered:
    entry: "console.log('📬 Order delivered'); context.deliveredAt = new Date().toISOString()"
    final: true

  validation_failed:
    entry: "console.log('❌ Validation failed')"
    final: true

  payment_failed:
    entry: "console.log('❌ Payment failed')"
    final: true
```

### Example 2: User Onboarding

```yaml
id: user-onboarding
initial: registration

states:
  registration:
    entry: "console.log('👤 New user registration')"
    on:
      submit: email_verification

  email_verification:
    entry: "console.log('📧 Sending verification email...'); context.verificationEmailSent = true"
    on:
      verify: profile_setup
      resend: email_verification

  profile_setup:
    entry: "console.log('📝 Profile setup')"
    on:
      complete: preferences

  preferences:
    entry: "console.log('⚙️  Setting preferences')"
    on:
      save: onboarding_complete

  onboarding_complete:
    entry: "console.log('🎉 Onboarding complete!'); context.completedAt = new Date().toISOString()"
    final: true
```

### Example 3: Support Ticket

```yaml
id: support-ticket
initial: new

states:
  new:
    entry: "console.log('🎫 New ticket:', context.ticketId)"
    on:
      assign: assigned

  assigned:
    entry: "console.log('👤 Ticket assigned to:', context.assignedTo)"
    on:
      start_work: in_progress
      escalate: escalated

  in_progress:
    entry: "console.log('🔧 Working on ticket...')"
    on:
      resolve: resolved
      need_info: waiting_for_customer
      escalate: escalated

  waiting_for_customer:
    entry: "console.log('⏳ Waiting for customer response')"
    on:
      customer_responded: in_progress
      timeout: auto_closed

  escalated:
    entry: "console.log('⬆️  Ticket escalated')"
    on:
      assign: assigned

  resolved:
    entry: "console.log('✅ Ticket resolved'); context.resolvedAt = new Date().toISOString()"
    on:
      reopen: in_progress
      close: closed

  closed:
    entry: "console.log('🔒 Ticket closed'); context.closedAt = new Date().toISOString()"
    final: true

  auto_closed:
    entry: "console.log('🔒 Ticket auto-closed (no response)')"
    final: true
```

### Example 4: Document Approval

```yaml
id: document-approval
initial: draft

states:
  draft:
    entry: "console.log('📄 Document in draft')"
    on:
      submit: pending_review

  pending_review:
    entry: "console.log('👁️  Awaiting review'); context.submittedAt = new Date().toISOString()"
    on:
      assign_reviewer: under_review

  under_review:
    entry: "console.log('🔍 Under review by:', context.reviewer)"
    on:
      approve: approved
      reject: rejected
      request_changes: changes_requested

  changes_requested:
    entry: "console.log('✏️  Changes requested'); context.changesRequestedAt = new Date().toISOString()"
    on:
      resubmit: pending_review

  approved:
    entry: "console.log('✅ Document approved'); context.approvedAt = new Date().toISOString(); context.approvedBy = context.reviewer"
    on:
      publish: published

  published:
    entry: "console.log('📢 Document published'); context.publishedAt = new Date().toISOString()"
    final: true

  rejected:
    entry: "console.log('❌ Document rejected'); context.rejectedAt = new Date().toISOString()"
    final: true
```

## Advanced YAML Features

### Context Updates

```yaml
states:
  processing:
    entry: |
      context.startedAt = new Date().toISOString();
      context.attempts = (context.attempts || 0) + 1;
      console.log('Attempt:', context.attempts);
    on:
      complete: done
```

### Multi-line Actions

```yaml
states:
  checkout:
    entry: |
      console.log('Processing checkout...');
      context.subtotal = context.items.reduce((sum, item) => sum + item.price, 0);
      context.tax = context.subtotal * 0.08;
      context.total = context.subtotal + context.tax;
      console.log('Total:', context.total);
    on:
      pay: payment
```

### Conditional Logic in Actions

```yaml
states:
  review:
    entry: |
      if (context.priority === 'high') {
        console.log('⚠️  High priority - escalating');
        context.escalated = true;
      } else {
        console.log('📋 Normal priority');
      }
    on:
      next: processing
```

## Loading YAML Files

### From File System

```typescript
import { YamlFlowParser, FlowEngine } from '@tsflow/flow-engine';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load YAML file
const yamlContent = readFileSync(
  join(__dirname, 'workflows', 'order-flow.yaml'),
  'utf-8'
);

// Parse to config
const config = YamlFlowParser.fromYaml(yamlContent);

// Create engine
const engine = new FlowEngine(config);

// Use it!
const flow = await engine.start({
  context: { orderId: 'ORD-123' }
});

await engine.execute(flow.flowId, { event: 'validate' });
```

### Loading Multiple Workflows

```typescript
import { readdirSync } from 'fs';

// Load all YAML workflows from a directory
const workflowDir = join(__dirname, 'workflows');
const engines = new Map<string, FlowEngine>();

readdirSync(workflowDir)
  .filter(f => f.endsWith('.yaml'))
  .forEach(file => {
    const yaml = readFileSync(join(workflowDir, file), 'utf-8');
    const config = YamlFlowParser.fromYaml(yaml);
    engines.set(config.id, new FlowEngine(config));
  });

// Use workflows by ID
const orderEngine = engines.get('order-processing');
const ticketEngine = engines.get('support-ticket');
```

### Hot Reloading Workflows

```typescript
import { watch } from 'fs';

function loadWorkflow(filePath: string): FlowEngine {
  const yaml = readFileSync(filePath, 'utf-8');
  const config = YamlFlowParser.fromYaml(yaml);
  return new FlowEngine(config);
}

let engine = loadWorkflow('./workflow.yaml');

// Watch for changes
watch('./workflow.yaml', () => {
  console.log('Workflow updated - reloading...');
  engine = loadWorkflow('./workflow.yaml');
});
```

## Limitations

### What YAML Can Do

✅ Define states and transitions  
✅ Simple JavaScript expressions  
✅ Console logging  
✅ Context updates  
✅ Basic conditionals  
✅ Date/time operations  
✅ String manipulation  

### What YAML Cannot Do

❌ Complex guard functions  
❌ Async operations (API calls, database queries)  
❌ Import external functions  
❌ Type checking  
❌ Access to external libraries  
❌ Parallel states (use TypeScript)  
❌ Hierarchical states (use TypeScript)  

### Hybrid Approach

Combine YAML with TypeScript for the best of both worlds:

**workflow.yaml** (structure):
```yaml
id: order-flow
initial: pending

states:
  pending:
    on:
      approve: approved
      reject: rejected

  approved:
    final: true

  rejected:
    final: true
```

**workflow.ts** (logic):
```typescript
import { YamlFlowParser, FlowEngine } from '@tsflow/flow-engine';
import { readFileSync } from 'fs';

// Load structure from YAML
const yaml = readFileSync('./workflow.yaml', 'utf-8');
const config = YamlFlowParser.fromYaml(yaml);

// Add complex logic in TypeScript
config.states.pending.transitions[0].guard = (context) => {
  return context.amount < 1000 && context.verified;
};

config.states.pending.transitions[0].action = async (context) => {
  context.approvedAt = new Date().toISOString();
  await sendEmail(context.email, 'Order approved');
  await updateDatabase(context.orderId);
};

// Create engine with enhanced config
const engine = new FlowEngine(config);
```

## Best Practices

### 1. Keep YAML Simple
Use YAML for workflow structure, TypeScript for complex logic.

### 2. Use Descriptive State Names
```yaml
# Good
states:
  awaiting_customer_approval:
  payment_processing:
  shipment_in_transit:

# Bad
states:
  state1:
  state2:
  state3:
```

### 3. Add Comments
```yaml
id: order-flow
initial: created

states:
  # Customer submits order
  created:
    entry: "console.log('Order created')"
    on:
      validate: validating

  # Validate order items and inventory
  validating:
    on:
      valid: payment_pending
      invalid: validation_failed
```

### 4. Group Related States
```yaml
# Group payment states together
payment_pending:
  # ...
payment_processing:
  # ...
payment_success:
  # ...
payment_failed:
  # ...

# Group shipping states together
shipping_preparing:
  # ...
shipping_in_transit:
  # ...
shipping_delivered:
  # ...
```

### 5. Use Consistent Naming
```yaml
# Pick a style and stick with it
# snake_case
payment_processing:
pending_review:

# OR kebab-case
payment-processing:
pending-review:

# OR camelCase
paymentProcessing:
pendingReview:
```

---

**Next Steps:**
- [Examples](./examples.md) - More real-world YAML workflows
- [API Reference](../API_REFERENCE.md) - YamlFlowParser API
- [Advanced Patterns](./advanced-patterns.md) - When to use TypeScript instead
