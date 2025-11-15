# Real-World Examples

Production-ready workflow examples you can adapt for your projects.

## Table of Contents

- [E-Commerce](#e-commerce)
- [User Management](#user-management)
- [Content Management](#content-management)
- [DevOps & Infrastructure](#devops--infrastructure)
- [Finance & Banking](#finance--banking)
- [Healthcare](#healthcare)
- [Customer Support](#customer-support)
- [IoT & Hardware](#iot--hardware)

## E-Commerce

### Shopping Cart to Order

Complete e-commerce flow from cart to delivery.

```typescript
import { FlowEngine, StateMachineConfig } from '@tsflow/flow-engine';

const ecommerceFlow: StateMachineConfig = {
  id: 'ecommerce-order',
  initialState: 'cart',
  states: {
    cart: {
      name: 'cart',
      onEntry: (context) => {
        context.cartTotal = context.items.reduce(
          (sum, item) => sum + item.price * item.quantity, 0
        );
      },
      transitions: [
        {
          event: 'CHECKOUT',
          to: 'checkout',
          guard: (context) => context.items.length > 0
        },
        { event: 'CLEAR', to: 'cart' }
      ]
    },
    checkout: {
      name: 'checkout',
      onEntry: (context) => {
        context.tax = context.cartTotal * 0.08;
        context.shipping = calculateShipping(context.address);
        context.total = context.cartTotal + context.tax + context.shipping;
      },
      transitions: [
        { event: 'PROCEED_TO_PAYMENT', to: 'payment' },
        { event: 'BACK_TO_CART', to: 'cart' }
      ]
    },
    payment: {
      name: 'payment',
      onEntry: async (context, flow) => {
        // Register compensation for payment
        await flow.engine.recordCompensation(
          flow.flowId,
          async (ctx) => {
            await refundPayment(ctx.paymentId);
            console.log(`Refunded payment: ${ctx.paymentId}`);
          },
          'Refund payment'
        );
      },
      transitions: [
        {
          event: 'PAYMENT_SUCCESS',
          to: 'order_confirmed',
          action: async (context) => {
            context.paymentId = await processPayment(context.paymentDetails);
            context.paidAt = new Date().toISOString();
          }
        },
        { event: 'PAYMENT_FAILED', to: 'payment_failed' }
      ]
    },
    order_confirmed: {
      name: 'order_confirmed',
      onEntry: async (context, flow) => {
        // Register compensation for inventory
        await flow.engine.recordCompensation(
          flow.flowId,
          async (ctx) => {
            await restoreInventory(ctx.items);
            console.log('Inventory restored');
          },
          'Restore inventory'
        );
        
        // Reserve inventory
        await reserveInventory(context.items);
        context.orderId = generateOrderId();
        await sendConfirmationEmail(context.email, context.orderId);
      },
      transitions: [
        { event: 'START_FULFILLMENT', to: 'fulfillment' }
      ]
    },
    fulfillment: {
      name: 'fulfillment',
      type: 'parallel',
      regions: {
        picking: {
          initialState: 'picking_items',
          states: {
            picking_items: {
              name: 'picking_items',
              transitions: [
                { event: 'PICKED', to: 'items_picked' }
              ]
            },
            items_picked: {
              name: 'items_picked',
              type: 'final'
            }
          }
        },
        packing: {
          initialState: 'awaiting_items',
          states: {
            awaiting_items: {
              name: 'awaiting_items',
              transitions: [
                { event: 'START_PACKING', to: 'packing' }
              ]
            },
            packing: {
              name: 'packing',
              transitions: [
                { event: 'PACKED', to: 'packed' }
              ]
            },
            packed: {
              name: 'packed',
              type: 'final'
            }
          }
        },
        labeling: {
          initialState: 'awaiting_label',
          states: {
            awaiting_label: {
              name: 'awaiting_label',
              transitions: [
                { event: 'GENERATE_LABEL', to: 'label_generated' }
              ]
            },
            label_generated: {
              name: 'label_generated',
              type: 'final'
            }
          }
        }
      },
      transitions: [
        {
          event: 'ALL_READY',
          to: 'ready_to_ship',
          action: (context) => {
            context.fulfilledAt = new Date().toISOString();
          }
        }
      ]
    },
    ready_to_ship: {
      name: 'ready_to_ship',
      transitions: [
        {
          event: 'SHIP',
          to: 'shipped',
          action: async (context) => {
            context.trackingNumber = await createShipment(context);
            context.shippedAt = new Date().toISOString();
            await sendShippingNotification(context.email, context.trackingNumber);
          }
        }
      ]
    },
    shipped: {
      name: 'shipped',
      transitions: [
        { event: 'OUT_FOR_DELIVERY', to: 'out_for_delivery' }
      ]
    },
    out_for_delivery: {
      name: 'out_for_delivery',
      transitions: [
        { event: 'DELIVERED', to: 'delivered' },
        { event: 'DELIVERY_FAILED', to: 'delivery_failed' }
      ]
    },
    delivered: {
      name: 'delivered',
      onEntry: async (context) => {
        context.deliveredAt = new Date().toISOString();
        await sendDeliveryConfirmation(context.email);
      },
      type: 'final'
    },
    payment_failed: {
      name: 'payment_failed',
      type: 'final'
    },
    delivery_failed: {
      name: 'delivery_failed',
      transitions: [
        { event: 'RETRY_DELIVERY', to: 'out_for_delivery' },
        { event: 'RETURN_TO_SENDER', to: 'returned' }
      ]
    },
    returned: {
      name: 'returned',
      type: 'final'
    }
  }
};

// Usage
async function processEcommerceOrder() {
  const engine = new FlowEngine(ecommerceFlow);
  
  const order = await engine.start({
    context: {
      items: [
        { sku: 'WIDGET-1', name: 'Widget', price: 29.99, quantity: 2 },
        { sku: 'GADGET-1', name: 'Gadget', price: 49.99, quantity: 1 }
      ],
      email: 'customer@example.com',
      address: {
        street: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zip: '62701'
      },
      paymentDetails: {
        cardNumber: '****-****-****-1234',
        cvv: '***'
      }
    }
  });

  // Customer flow
  await engine.execute(order.flowId, { event: 'CHECKOUT' });
  await engine.execute(order.flowId, { event: 'PROCEED_TO_PAYMENT' });
  await engine.execute(order.flowId, { event: 'PAYMENT_SUCCESS' });
  await engine.execute(order.flowId, { event: 'START_FULFILLMENT' });
  
  // Warehouse operations (parallel)
  await engine.execute(order.flowId, { event: 'PICKED', targetRegion: 'picking' });
  await engine.execute(order.flowId, { event: 'START_PACKING', targetRegion: 'packing' });
  await engine.execute(order.flowId, { event: 'PACKED', targetRegion: 'packing' });
  await engine.execute(order.flowId, { event: 'GENERATE_LABEL', targetRegion: 'labeling' });
  
  await engine.execute(order.flowId, { event: 'ALL_READY' });
  await engine.execute(order.flowId, { event: 'SHIP' });
  await engine.execute(order.flowId, { event: 'OUT_FOR_DELIVERY' });
  await engine.execute(order.flowId, { event: 'DELIVERED' });
  
  console.log('Order completed successfully!');
}
```

## User Management

### User Registration with Email Verification

```yaml
id: user-registration
initial: started

states:
  started:
    entry: "console.log('🚀 Registration started')"
    on:
      submit_email: email_validation

  email_validation:
    entry: |
      if (!context.email.includes('@')) {
        console.log('❌ Invalid email');
        context.error = 'Invalid email format';
      } else {
        console.log('✅ Email valid:', context.email);
      }
    on:
      valid: password_setup
      invalid: started

  password_setup:
    entry: "console.log('🔐 Setting up password')"
    on:
      password_set: account_created

  account_created:
    entry: |
      context.userId = 'USER-' + Date.now();
      context.verificationToken = Math.random().toString(36).substring(7);
      console.log('✅ Account created:', context.userId);
      console.log('📧 Sending verification email...');
    on:
      email_sent: awaiting_verification

  awaiting_verification:
    entry: "console.log('⏳ Awaiting email verification')"
    on:
      verify: email_verified
      resend: account_created
      timeout: verification_expired

  email_verified:
    entry: |
      context.verifiedAt = new Date().toISOString();
      console.log('✅ Email verified');
    on:
      complete_profile: profile_setup

  profile_setup:
    entry: "console.log('📝 Profile setup')"
    on:
      save: registration_complete

  registration_complete:
    entry: |
      context.completedAt = new Date().toISOString();
      console.log('🎉 Registration complete!');
      console.log('User ID:', context.userId);
    final: true

  verification_expired:
    entry: "console.log('⏰ Verification link expired')"
    on:
      restart: account_created

```

## Content Management

### Blog Post Publishing Workflow

```typescript
const blogPostFlow: StateMachineConfig = {
  id: 'blog-post-workflow',
  initialState: 'draft',
  states: {
    draft: {
      name: 'draft',
      onEntry: (context) => {
        context.version = 1;
        context.createdAt = new Date().toISOString();
      },
      transitions: [
        { event: 'SAVE_DRAFT', to: 'draft' },
        {
          event: 'SUBMIT_FOR_REVIEW',
          to: 'pending_review',
          guard: (context) => {
            return context.title && context.content && context.content.length >= 100;
          }
        }
      ]
    },
    pending_review: {
      name: 'pending_review',
      onEntry: async (context) => {
        context.submittedAt = new Date().toISOString();
        await notifyReviewers(context.postId);
      },
      transitions: [
        {
          event: 'ASSIGN_REVIEWER',
          to: 'under_review',
          action: (context, data) => {
            context.reviewer = data.reviewerId;
            context.reviewStartedAt = new Date().toISOString();
          }
        }
      ]
    },
    under_review: {
      name: 'under_review',
      transitions: [
        {
          event: 'APPROVE',
          to: 'approved',
          action: async (context, data) => {
            context.approvedAt = new Date().toISOString();
            context.approvedBy = data.reviewerId;
            context.reviewNotes = data.notes;
            await notifyAuthor(context.authorId, 'approved');
          }
        },
        {
          event: 'REQUEST_CHANGES',
          to: 'changes_requested',
          action: async (context, data) => {
            context.changesRequestedAt = new Date().toISOString();
            context.requiredChanges = data.changes;
            await notifyAuthor(context.authorId, 'changes-requested');
          }
        },
        {
          event: 'REJECT',
          to: 'rejected',
          action: async (context, data) => {
            context.rejectedAt = new Date().toISOString();
            context.rejectionReason = data.reason;
            await notifyAuthor(context.authorId, 'rejected');
          }
        }
      ]
    },
    changes_requested: {
      name: 'changes_requested',
      transitions: [
        {
          event: 'UPDATE',
          to: 'changes_requested',
          action: (context) => {
            context.version += 1;
            context.lastUpdatedAt = new Date().toISOString();
          }
        },
        {
          event: 'RESUBMIT',
          to: 'pending_review',
          guard: (context) => context.requiredChanges.every(c => c.completed)
        }
      ]
    },
    approved: {
      name: 'approved',
      transitions: [
        {
          event: 'SCHEDULE',
          to: 'scheduled',
          action: (context, data) => {
            context.scheduledFor = data.publishDate;
          }
        },
        {
          event: 'PUBLISH_NOW',
          to: 'published',
          action: async (context) => {
            context.publishedAt = new Date().toISOString();
            await publishPost(context.postId);
            await notifySubscribers(context.postId);
          }
        }
      ]
    },
    scheduled: {
      name: 'scheduled',
      transitions: [
        {
          event: 'PUBLISH',
          to: 'published',
          guard: (context) => new Date() >= new Date(context.scheduledFor)
        },
        { event: 'RESCHEDULE', to: 'scheduled' },
        { event: 'CANCEL_SCHEDULE', to: 'approved' }
      ]
    },
    published: {
      name: 'published',
      onEntry: (context) => {
        context.published = true;
        context.views = 0;
        context.shares = 0;
      },
      transitions: [
        {
          event: 'UPDATE',
          to: 'published',
          action: (context) => {
            context.version += 1;
            context.lastUpdatedAt = new Date().toISOString();
          }
        },
        {
          event: 'UNPUBLISH',
          to: 'unpublished',
          action: async (context) => {
            context.unpublishedAt = new Date().toISOString();
            await unpublishPost(context.postId);
          }
        },
        { event: 'ARCHIVE', to: 'archived' }
      ]
    },
    unpublished: {
      name: 'unpublished',
      transitions: [
        { event: 'REPUBLISH', to: 'published' },
        { event: 'ARCHIVE', to: 'archived' }
      ]
    },
    rejected: {
      name: 'rejected',
      transitions: [
        { event: 'START_OVER', to: 'draft' }
      ]
    },
    archived: {
      name: 'archived',
      type: 'final'
    }
  }
};
```

## DevOps & Infrastructure

### Cloud Resource Provisioning with Rollback

```typescript
const infraProvisioningFlow: StateMachineConfig = {
  id: 'infrastructure-provisioning',
  initialState: 'planning',
  states: {
    planning: {
      name: 'planning',
      onEntry: (context) => {
        console.log('Planning infrastructure deployment');
        context.plan = generateDeploymentPlan(context.requirements);
      },
      transitions: [
        {
          event: 'VALIDATE',
          to: 'validation',
          action: (context) => {
            context.validationResults = validatePlan(context.plan);
          }
        }
      ]
    },
    validation: {
      name: 'validation',
      transitions: [
        {
          event: 'VALID',
          to: 'provisioning',
          guard: (context) => context.validationResults.valid
        },
        {
          event: 'INVALID',
          to: 'planning',
          action: (context) => {
            console.error('Validation failed:', context.validationResults.errors);
          }
        }
      ]
    },
    provisioning: {
      name: 'provisioning',
      type: 'parallel',
      regions: {
        network: {
          initialState: 'creating_vpc',
          states: {
            creating_vpc: {
              name: 'creating_vpc',
              onEntry: async (context, flow) => {
                context.vpcId = await createVPC(context.plan.vpc);
                // Register cleanup
                await flow.engine.recordCompensation(
                  flow.flowId,
                  async (ctx) => await deleteVPC(ctx.vpcId),
                  'Delete VPC'
                );
              },
              transitions: [
                { event: 'VPC_CREATED', to: 'creating_subnets' }
              ]
            },
            creating_subnets: {
              name: 'creating_subnets',
              onEntry: async (context, flow) => {
                context.subnetIds = await createSubnets(context.vpcId, context.plan.subnets);
                await flow.engine.recordCompensation(
                  flow.flowId,
                  async (ctx) => await deleteSubnets(ctx.subnetIds),
                  'Delete Subnets'
                );
              },
              transitions: [
                { event: 'SUBNETS_CREATED', to: 'network_complete' }
              ]
            },
            network_complete: {
              name: 'network_complete',
              type: 'final'
            }
          }
        },
        compute: {
          initialState: 'awaiting_network',
          states: {
            awaiting_network: {
              name: 'awaiting_network',
              transitions: [
                { event: 'START_COMPUTE', to: 'creating_instances' }
              ]
            },
            creating_instances: {
              name: 'creating_instances',
              onEntry: async (context, flow) => {
                context.instanceIds = await createInstances(context.plan.instances);
                await flow.engine.recordCompensation(
                  flow.flowId,
                  async (ctx) => await terminateInstances(ctx.instanceIds),
                  'Terminate Instances'
                );
              },
              transitions: [
                { event: 'INSTANCES_CREATED', to: 'compute_complete' }
              ]
            },
            compute_complete: {
              name: 'compute_complete',
              type: 'final'
            }
          }
        },
        database: {
          initialState: 'awaiting_network',
          states: {
            awaiting_network: {
              name: 'awaiting_network',
              transitions: [
                { event: 'START_DATABASE', to: 'creating_database' }
              ]
            },
            creating_database: {
              name: 'creating_database',
              onEntry: async (context, flow) => {
                context.dbInstanceId = await createDatabase(context.plan.database);
                await flow.engine.recordCompensation(
                  flow.flowId,
                  async (ctx) => await deleteDatabase(ctx.dbInstanceId),
                  'Delete Database'
                );
              },
              transitions: [
                { event: 'DATABASE_CREATED', to: 'database_complete' }
              ]
            },
            database_complete: {
              name: 'database_complete',
              type: 'final'
            }
          }
        }
      },
      transitions: [
        {
          event: 'ALL_PROVISIONED',
          to: 'configuring',
          action: (context) => {
            context.provisionedAt = new Date().toISOString();
          }
        },
        {
          event: 'PROVISIONING_FAILED',
          to: 'rollback',
          action: (context, data) => {
            context.error = data.error;
            console.error('Provisioning failed:', data.error);
          }
        }
      ]
    },
    configuring: {
      name: 'configuring',
      onEntry: async (context) => {
        await configureResources(context);
      },
      transitions: [
        { event: 'CONFIGURED', to: 'ready' },
        { event: 'CONFIG_FAILED', to: 'rollback' }
      ]
    },
    ready: {
      name: 'ready',
      onEntry: (context) => {
        console.log('Infrastructure ready!');
        context.readyAt = new Date().toISOString();
      },
      type: 'final'
    },
    rollback: {
      name: 'rollback',
      onEntry: async (context, flow) => {
        console.log('Rolling back infrastructure...');
        await flow.engine.compensate(flow.flowId);
        console.log('Rollback complete');
      },
      type: 'final'
    }
  }
};
```

## Finance & Banking

### Loan Application Process

```yaml
id: loan-application
initial: application_started

states:
  application_started:
    entry: |
      context.applicationId = 'LOAN-' + Date.now();
      context.startedAt = new Date().toISOString();
      console.log('📋 Loan application started:', context.applicationId);
    on:
      submit_personal_info: personal_info_review

  personal_info_review:
    entry: "console.log('👤 Reviewing personal information')"
    on:
      personal_info_valid: employment_verification
      personal_info_invalid: application_rejected

  employment_verification:
    entry: "console.log('💼 Verifying employment')"
    on:
      employment_verified: credit_check
      employment_failed: application_rejected

  credit_check:
    entry: |
      console.log('📊 Running credit check');
      context.creditCheckStarted = new Date().toISOString();
    on:
      credit_check_complete: credit_review

  credit_review:
    entry: |
      console.log('🔍 Reviewing credit score:', context.creditScore);
      if (context.creditScore >= 700) {
        context.riskLevel = 'low';
      } else if (context.creditScore >= 600) {
        context.riskLevel = 'medium';
      } else {
        context.riskLevel = 'high';
      }
    on:
      approved: loan_approved
      needs_review: manual_review
      rejected: application_rejected

  manual_review:
    entry: |
      console.log('👁️  Manual review required');
      context.reviewStartedAt = new Date().toISOString();
    on:
      approve: loan_approved
      reject: application_rejected

  loan_approved:
    entry: |
      context.approvedAt = new Date().toISOString();
      context.loanAmount = context.requestedAmount;
      context.interestRate = calculateInterestRate(context.creditScore);
      console.log('✅ Loan approved!');
      console.log('Amount:', context.loanAmount);
      console.log('Rate:', context.interestRate + '%');
    on:
      accept_terms: terms_accepted

  terms_accepted:
    entry: |
      context.termsAcceptedAt = new Date().toISOString();
      console.log('📝 Terms accepted');
    on:
      sign_documents: documents_signed

  documents_signed:
    entry: |
      context.documentsSignedAt = new Date().toISOString();
      console.log('✍️  Documents signed');
    on:
      disburse_funds: funds_disbursed

  funds_disbursed:
    entry: |
      context.disbursedAt = new Date().toISOString();
      context.disbursementMethod = 'ACH Transfer';
      console.log('💰 Funds disbursed');
      console.log('Method:', context.disbursementMethod);
    final: true

  application_rejected:
    entry: |
      context.rejectedAt = new Date().toISOString();
      console.log('❌ Application rejected');
    final: true
```

---

More examples available in the [examples/](../packages/flow-engine/examples/) directory.

**Next Steps:**
- [Getting Started](./getting-started.md) - Set up tsFlow in your project
- [Advanced Patterns](./advanced-patterns.md) - Learn advanced features
- [API Reference](../API_REFERENCE.md) - Complete API documentation
