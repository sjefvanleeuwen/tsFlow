# Advanced Patterns

Master advanced tsFlow features including parallel states, hierarchical states, sub-flows, and saga patterns.

## Table of Contents

- [Parallel States](#parallel-states)
- [Hierarchical States](#hierarchical-states)
- [Sub-Flow Composition](#sub-flow-composition)
- [Saga Pattern (Compensation)](#saga-pattern-compensation)
- [Retry Logic](#retry-logic)
- [Middleware](#middleware)
- [Validation](#validation)

## Parallel States

Execute multiple independent state regions concurrently.

### Basic Parallel States

```typescript
import { FlowEngine, StateMachineConfig } from '@tsflow/flow-engine';

const config: StateMachineConfig = {
  id: 'parallel-document-processing',
  initialState: 'document_received',
  states: {
    document_received: {
      name: 'document_received',
      transitions: [
        { event: 'START_PROCESSING', to: 'parallel_processing' }
      ]
    },
    parallel_processing: {
      name: 'parallel_processing',
      type: 'parallel',
      regions: {
        // Region 1: Content extraction
        content: {
          initialState: 'extracting_text',
          states: {
            extracting_text: {
              name: 'extracting_text',
              transitions: [
                { event: 'TEXT_EXTRACTED', to: 'text_complete' }
              ]
            },
            text_complete: {
              name: 'text_complete',
              type: 'final'
            }
          }
        },
        // Region 2: Metadata processing
        metadata: {
          initialState: 'extracting_metadata',
          states: {
            extracting_metadata: {
              name: 'extracting_metadata',
              transitions: [
                { event: 'METADATA_EXTRACTED', to: 'metadata_complete' }
              ]
            },
            metadata_complete: {
              name: 'metadata_complete',
              type: 'final'
            }
          }
        },
        // Region 3: Image processing
        images: {
          initialState: 'extracting_images',
          states: {
            extracting_images: {
              name: 'extracting_images',
              transitions: [
                { event: 'IMAGES_EXTRACTED', to: 'images_complete' }
              ]
            },
            images_complete: {
              name: 'images_complete',
              type: 'final'
            }
          }
        }
      },
      transitions: [
        { event: 'ALL_COMPLETE', to: 'processing_complete' }
      ]
    },
    processing_complete: {
      name: 'processing_complete',
      type: 'final'
    }
  }
};

const engine = new FlowEngine(config);

async function processDocument() {
  const flow = await engine.start({
    context: { documentId: 'DOC-123' }
  });

  // Start parallel processing
  await engine.execute(flow.flowId, { event: 'START_PROCESSING' });

  // Process each region independently
  await engine.execute(flow.flowId, {
    event: 'TEXT_EXTRACTED',
    targetRegion: 'content',
    data: { textContent: 'Document text...' }
  });

  await engine.execute(flow.flowId, {
    event: 'METADATA_EXTRACTED',
    targetRegion: 'metadata',
    data: { author: 'John Doe', created: '2024-11-15' }
  });

  await engine.execute(flow.flowId, {
    event: 'IMAGES_EXTRACTED',
    targetRegion: 'images',
    data: { imageCount: 5, images: [...] }
  });

  // All regions complete - move to next state
  await engine.execute(flow.flowId, { event: 'ALL_COMPLETE' });
}
```

### Use Cases for Parallel States

- **Document Processing**: Extract text, metadata, and images simultaneously
- **Order Fulfillment**: Process payment, check inventory, and reserve shipping concurrently
- **Data Validation**: Run multiple validation checks in parallel
- **Multi-Channel Notifications**: Send email, SMS, and push notifications at once

## Hierarchical States

Create nested state machines for complex workflows.

### Basic Hierarchical States

```typescript
const config: StateMachineConfig = {
  id: 'order-with-payment',
  initialState: 'order_created',
  states: {
    order_created: {
      name: 'order_created',
      transitions: [
        { event: 'START_PAYMENT', to: 'payment' }
      ]
    },
    payment: {
      name: 'payment',
      type: 'compound',
      // Nested sub-machine for payment flow
      initialState: 'payment_pending',
      states: {
        payment_pending: {
          name: 'payment_pending',
          transitions: [
            { event: 'AUTHORIZE', to: 'payment_authorized' }
          ]
        },
        payment_authorized: {
          name: 'payment_authorized',
          transitions: [
            { event: 'CAPTURE', to: 'payment_captured' },
            { event: 'CANCEL', to: 'payment_cancelled' }
          ]
        },
        payment_captured: {
          name: 'payment_captured',
          type: 'final'
        },
        payment_cancelled: {
          name: 'payment_cancelled',
          type: 'final'
        }
      },
      // Transition when payment sub-machine completes
      transitions: [
        { event: 'PAYMENT_COMPLETE', to: 'order_confirmed' }
      ]
    },
    order_confirmed: {
      name: 'order_confirmed',
      type: 'final'
    }
  }
};
```

### Use Cases for Hierarchical States

- **Nested Workflows**: Payment processing within order fulfillment
- **State Grouping**: Organize related states together
- **Reusable Components**: Define sub-machines that can be reused
- **Complex State Management**: Break down large workflows into manageable pieces

## Sub-Flow Composition

Compose complex workflows from reusable sub-flow components.

### Creating Sub-Flows

```typescript
import { FlowEngine, StateMachineConfig } from '@tsflow/flow-engine';

// Define payment sub-flow
const paymentFlow: StateMachineConfig = {
  id: 'payment-processing',
  initialState: 'pending',
  states: {
    pending: {
      name: 'pending',
      transitions: [
        { event: 'PROCESS', to: 'processing' }
      ]
    },
    processing: {
      name: 'processing',
      onEntry: (context) => {
        console.log(`Processing payment of $${context.amount}`);
      },
      transitions: [
        {
          event: 'SUCCESS',
          to: 'completed',
          action: (context) => {
            context.transactionId = `TXN-${Date.now()}`;
          }
        },
        { event: 'FAILED', to: 'failed' }
      ]
    },
    completed: {
      name: 'completed',
      type: 'final'
    },
    failed: {
      name: 'failed',
      type: 'final'
    }
  }
};

// Define main order flow
const orderFlow: StateMachineConfig = {
  id: 'order-flow',
  initialState: 'created',
  states: {
    created: {
      name: 'created',
      transitions: [
        { event: 'VALIDATE', to: 'validated' }
      ]
    },
    validated: {
      name: 'validated',
      transitions: [
        { event: 'START_PAYMENT', to: 'awaiting_payment' }
      ]
    },
    awaiting_payment: {
      name: 'awaiting_payment',
      onEntry: async (context, flow) => {
        // Start payment sub-flow
        const result = await flow.engine.startSubFlow(
          flow.flowId,
          paymentFlow,
          {
            amount: context.orderTotal,
            customerId: context.customerId
          }
        );
        context.paymentFlowId = result.subFlowId;
      },
      transitions: [
        { event: 'PAYMENT_COMPLETE', to: 'paid' },
        { event: 'PAYMENT_FAILED', to: 'payment_failed' }
      ]
    },
    paid: {
      name: 'paid',
      transitions: [
        { event: 'SHIP', to: 'shipped' }
      ]
    },
    shipped: {
      name: 'shipped',
      type: 'final'
    },
    payment_failed: {
      name: 'payment_failed',
      type: 'final'
    }
  }
};

// Usage
async function processOrderWithSubFlow() {
  const orderEngine = new FlowEngine(orderFlow);
  const paymentEngine = new FlowEngine(paymentFlow);

  // Start order
  const order = await orderEngine.start({
    context: {
      orderId: 'ORD-123',
      orderTotal: 99.99,
      customerId: 'CUST-456'
    }
  });

  await orderEngine.execute(order.flowId, { event: 'VALIDATE' });
  await orderEngine.execute(order.flowId, { event: 'START_PAYMENT' });

  // Get payment sub-flow ID from context
  const orderState = await orderEngine.getFlow(order.flowId);
  const paymentFlowId = orderState?.context.paymentFlowId;

  // Execute payment sub-flow
  await paymentEngine.execute(paymentFlowId, { event: 'PROCESS' });
  await paymentEngine.execute(paymentFlowId, { event: 'SUCCESS' });

  // Wait for payment to complete
  await orderEngine.waitForSubFlow(order.flowId, paymentFlowId);

  // Continue main flow
  await orderEngine.execute(order.flowId, { event: 'PAYMENT_COMPLETE' });
  await orderEngine.execute(order.flowId, { event: 'SHIP' });
}
```

### Use Cases for Sub-Flows

- **Reusable Workflows**: Payment, notification, approval sub-flows
- **Microservices**: Each service manages its own flow
- **Complex Orchestration**: Break down large processes into manageable pieces
- **Parallel Sub-Flows**: Run multiple independent workflows concurrently

## Saga Pattern (Compensation)

Implement distributed transactions with automatic compensation/rollback.

### Basic Saga Pattern

```typescript
import { FlowEngine, StateMachineConfig } from '@tsflow/flow-engine';

const travelBookingFlow: StateMachineConfig = {
  id: 'travel-booking',
  initialState: 'started',
  states: {
    started: {
      name: 'started',
      transitions: [
        { event: 'BOOK_FLIGHT', to: 'flight_booked' }
      ]
    },
    flight_booked: {
      name: 'flight_booked',
      onEntry: async (context, flow) => {
        // Book flight
        context.flightBookingId = await bookFlight(context.flightDetails);
        
        // Register compensation (will run if flow fails later)
        await flow.engine.recordCompensation(
          flow.flowId,
          async (ctx) => {
            console.log(`Cancelling flight: ${ctx.flightBookingId}`);
            await cancelFlight(ctx.flightBookingId);
          },
          'Cancel flight booking'
        );
      },
      transitions: [
        { event: 'BOOK_HOTEL', to: 'hotel_booked' },
        { event: 'ERROR', to: 'failed' }
      ]
    },
    hotel_booked: {
      name: 'hotel_booked',
      onEntry: async (context, flow) => {
        // Book hotel
        context.hotelBookingId = await bookHotel(context.hotelDetails);
        
        // Register compensation
        await flow.engine.recordCompensation(
          flow.flowId,
          async (ctx) => {
            console.log(`Cancelling hotel: ${ctx.hotelBookingId}`);
            await cancelHotel(ctx.hotelBookingId);
          },
          'Cancel hotel booking'
        );
      },
      transitions: [
        { event: 'BOOK_CAR', to: 'car_booked' },
        { event: 'ERROR', to: 'failed' }
      ]
    },
    car_booked: {
      name: 'car_booked',
      onEntry: async (context, flow) => {
        // Book car
        context.carBookingId = await bookCar(context.carDetails);
        
        // Register compensation
        await flow.engine.recordCompensation(
          flow.flowId,
          async (ctx) => {
            console.log(`Cancelling car: ${ctx.carBookingId}`);
            await cancelCar(ctx.carBookingId);
          },
          'Cancel car rental'
        );
      },
      transitions: [
        { event: 'COMPLETE', to: 'completed' },
        { event: 'ERROR', to: 'failed' }
      ]
    },
    completed: {
      name: 'completed',
      type: 'final'
    },
    failed: {
      name: 'failed',
      type: 'final',
      onEntry: async (context, flow) => {
        // Automatically run all compensations in reverse order (LIFO)
        console.log('Booking failed - running compensations...');
        await flow.engine.compensate(flow.flowId);
      }
    }
  }
};

// Usage with error handling
async function bookTravel() {
  const engine = new FlowEngine(travelBookingFlow);
  
  const booking = await engine.start({
    context: {
      flightDetails: { from: 'NYC', to: 'LAX', date: '2024-12-01' },
      hotelDetails: { name: 'Grand Hotel', nights: 3 },
      carDetails: { type: 'SUV', days: 3 }
    }
  });

  try {
    await engine.execute(booking.flowId, { event: 'BOOK_FLIGHT' });
    await engine.execute(booking.flowId, { event: 'BOOK_HOTEL' });
    await engine.execute(booking.flowId, { event: 'BOOK_CAR' });
    
    // If we get here, all bookings succeeded
    await engine.execute(booking.flowId, { event: 'COMPLETE' });
    console.log('✅ Travel booking completed successfully!');
  } catch (error) {
    // Trigger compensation on error
    await engine.execute(booking.flowId, { event: 'ERROR' });
    console.log('❌ Travel booking failed - all compensations executed');
  }
}
```

### Saga Features

- **Automatic Rollback**: Compensations run in reverse order (LIFO)
- **Partial Failure Handling**: Undo only what was completed
- **Compensation Tracking**: See which compensations ran
- **Async Support**: Compensations can be async functions

### Use Cases for Saga Pattern

- **Distributed Transactions**: Bookings, reservations, multi-step purchases
- **Microservices**: Coordinate actions across services
- **Financial Transactions**: Multi-step payments with rollback
- **Resource Allocation**: Reserve resources with automatic cleanup

## Retry Logic

Automatically retry failed operations with configurable backoff.

### Configuring Retry

```typescript
import { FlowEngine, StateMachineConfig } from '@tsflow/flow-engine';

const config: StateMachineConfig = {
  id: 'api-call-with-retry',
  initialState: 'calling_api',
  states: {
    calling_api: {
      name: 'calling_api',
      retry: {
        maxAttempts: 3,
        delayMs: 1000,
        backoffMultiplier: 2,  // Exponential backoff: 1s, 2s, 4s
        retryableErrors: ['NetworkError', 'TimeoutError']
      },
      onEntry: async (context) => {
        // This will be retried up to 3 times if it fails
        context.apiResponse = await callExternalAPI(context.apiUrl);
      },
      transitions: [
        { event: 'SUCCESS', to: 'completed' },
        { event: 'FAILED', to: 'failed' }
      ]
    },
    completed: {
      name: 'completed',
      type: 'final'
    },
    failed: {
      name: 'failed',
      type: 'final'
    }
  }
};
```

### Retry Strategies

**Linear Backoff**:
```typescript
retry: {
  maxAttempts: 5,
  delayMs: 2000,  // Wait 2s between each attempt
  backoffMultiplier: 1
}
```

**Exponential Backoff**:
```typescript
retry: {
  maxAttempts: 4,
  delayMs: 1000,  // 1s, 2s, 4s, 8s
  backoffMultiplier: 2
}
```

**Custom Retry Logic**:
```typescript
retry: {
  maxAttempts: 3,
  delayMs: 500,
  shouldRetry: (error, attempt) => {
    // Custom logic to determine if we should retry
    return error.code === 'RATE_LIMIT' && attempt < 3;
  }
}
```

## Middleware

Add hooks for logging, metrics, observability, and more.

### Creating Middleware

```typescript
import { FlowEngine, Middleware } from '@tsflow/flow-engine';

// Logging middleware
const loggingMiddleware: Middleware = {
  name: 'logger',
  beforeTransition: async (context, event, from, to) => {
    console.log(`[${new Date().toISOString()}] ${from} --${event}--> ${to}`);
  },
  afterTransition: async (context, event, from, to, result) => {
    console.log(`[${new Date().toISOString()}] Transition completed: ${result.success}`);
  },
  onError: async (context, error) => {
    console.error(`[${new Date().toISOString()}] Error:`, error.message);
  }
};

// Metrics middleware
const metricsMiddleware: Middleware = {
  name: 'metrics',
  beforeTransition: async (context, event) => {
    context._startTime = Date.now();
  },
  afterTransition: async (context) => {
    const duration = Date.now() - context._startTime;
    // Send to metrics service
    recordMetric('transition_duration', duration);
  }
};

// Validation middleware
const validationMiddleware: Middleware = {
  name: 'validator',
  beforeTransition: async (context, event, from, to) => {
    if (to === 'payment_processing' && !context.paymentMethod) {
      throw new Error('Payment method required');
    }
  }
};

// Apply middleware
const engine = new FlowEngine(config);
engine.use(loggingMiddleware);
engine.use(metricsMiddleware);
engine.use(validationMiddleware);
```

### Built-in Middleware Use Cases

- **Logging**: Track all state transitions
- **Metrics**: Measure transition duration, success rates
- **Auditing**: Record who made changes and when
- **Validation**: Enforce business rules
- **Caching**: Cache expensive operations
- **Rate Limiting**: Prevent too many transitions

## Validation

Validate context data at state entry using schemas.

### Schema Validation

```typescript
import { FlowEngine, StateMachineConfig } from '@tsflow/flow-engine';

const config: StateMachineConfig = {
  id: 'validated-order',
  initialState: 'created',
  states: {
    created: {
      name: 'created',
      transitions: [
        { event: 'SUBMIT', to: 'validating' }
      ]
    },
    validating: {
      name: 'validating',
      // Validate context when entering this state
      validation: {
        schema: {
          type: 'object',
          required: ['orderId', 'items', 'total'],
          properties: {
            orderId: { type: 'string', pattern: '^ORD-[0-9]+$' },
            items: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['sku', 'quantity', 'price'],
                properties: {
                  sku: { type: 'string' },
                  quantity: { type: 'number', minimum: 1 },
                  price: { type: 'number', minimum: 0 }
                }
              }
            },
            total: { type: 'number', minimum: 0 }
          }
        }
      },
      transitions: [
        { event: 'VALID', to: 'validated' },
        { event: 'INVALID', to: 'validation_failed' }
      ]
    },
    validated: {
      name: 'validated',
      type: 'final'
    },
    validation_failed: {
      name: 'validation_failed',
      type: 'final'
    }
  }
};
```

---

**Next Steps:**
- [YAML Workflows](./yaml-workflows.md) - Define workflows declaratively
- [Enterprise Features](./enterprise-features.md) - Production-ready features
- [Examples](./examples.md) - Real-world workflow examples
