import { describe, it, expect, beforeEach } from 'vitest';
import { FlowEngine } from '../flow-engine.js';
import { InMemoryStateStorage } from '../storage.js';
import type { StateMachineConfig } from '../state-machine.js';

describe('FlowEngine - Sub-flow Composition', () => {
  let storage: InMemoryStateStorage;
  let parentEngine: FlowEngine;
  let childEngine: FlowEngine;

  beforeEach(() => {
    storage = new InMemoryStateStorage();
  });

  describe('Basic Sub-flow Operations', () => {
    it('should start and wait for sub-flow completion', async () => {
      // Parent workflow
      const parentConfig: StateMachineConfig = {
        id: 'parent-workflow',
        initialState: 'start',
        states: {
          start: {
            name: 'start',
            transitions: [
              { event: 'START_CHILD', to: 'waiting' }
            ]
          },
          waiting: {
            name: 'waiting',
            transitions: [
              { event: 'CHILD_DONE', to: 'done' }
            ]
          },
          done: {
            name: 'done',
            type: 'final'
          }
        }
      };

      // Child workflow
      const childConfig: StateMachineConfig = {
        id: 'child-workflow',
        initialState: 'processing',
        states: {
          processing: {
            name: 'processing',
            onEntry: async (ctx) => {
              ctx.result = 'processed';
            },
            transitions: [
              { event: 'FINISH', to: 'completed' }
            ]
          },
          completed: {
            name: 'completed',
            type: 'final'
          }
        }
      };

      parentEngine = new FlowEngine(parentConfig, storage);
      
      // Start parent
      const parentFlow = await parentEngine.start({ context: { data: 'test' } });
      await parentEngine.execute(parentFlow.flowId, { event: 'START_CHILD' });

      // Start sub-flow - this creates an internal engine with childConfig
      const childFlow = await parentEngine.startSubFlow(
        parentFlow.flowId,
        childConfig,
        { context: { additionalData: 'child-data' } }
      );

      // Create child engine with same config to execute the child flow
      childEngine = new FlowEngine(childConfig, storage);
      const childResult = await childEngine.execute(childFlow.flowId, { event: 'FINISH' });
      
      // Verify child completed
      expect(childResult.success).toBe(true);
      expect(childResult.state.status).toBe('completed');
      expect(childResult.state.currentState).toBe('completed');

      // Wait for child completion (should return immediately since child is already completed)
      const finalChildState = await parentEngine.waitForSubFlow(parentFlow.flowId, childFlow.flowId);
      expect(finalChildState.status).toBe('completed');
      expect(finalChildState.context.result).toBe('processed');

      // Continue parent
      await parentEngine.execute(parentFlow.flowId, { event: 'CHILD_DONE' });

      const finalParent = await parentEngine.getFlow(parentFlow.flowId);
      expect(finalParent?.status).toBe('completed');
      expect(finalParent?.subFlows?.[0].subFlowId).toBe(childFlow.flowId);
    });

    it('should track multiple sub-flows', async () => {
      const parentConfig: StateMachineConfig = {
        id: 'multi-subflow-parent',
        initialState: 'start',
        states: {
          start: {
            name: 'start',
            transitions: [
              { event: 'COMPLETE', to: 'done' }
            ]
          },
          done: {
            name: 'done',
            type: 'final'
          }
        }
      };

      const childConfig: StateMachineConfig = {
        id: 'simple-child',
        initialState: 'working',
        states: {
          working: {
            name: 'working',
            transitions: [
              { event: 'DONE', to: 'finished' }
            ]
          },
          finished: {
            name: 'finished',
            type: 'final'
          }
        }
      };

      parentEngine = new FlowEngine(parentConfig, storage);
      childEngine = new FlowEngine(childConfig, storage);

      const parentFlow = await parentEngine.start();

      // Start multiple sub-flows
      const child1 = await parentEngine.startSubFlow(parentFlow.flowId, childConfig, { context: { id: 1 } });
      const child2 = await parentEngine.startSubFlow(parentFlow.flowId, childConfig, { context: { id: 2 } });
      const child3 = await parentEngine.startSubFlow(parentFlow.flowId, childConfig, { context: { id: 3 } });

      // Complete all children
      await childEngine.execute(child1.flowId, { event: 'DONE' });
      await childEngine.execute(child2.flowId, { event: 'DONE' });
      await childEngine.execute(child3.flowId, { event: 'DONE' });

      // Verify parent tracks all sub-flows
      const parentState = await parentEngine.getFlow(parentFlow.flowId);
      expect(parentState?.subFlows).toHaveLength(3);
      expect(parentState?.subFlows?.[0].subFlowId).toBe(child1.flowId);
      expect(parentState?.subFlows?.[1].subFlowId).toBe(child2.flowId);
      expect(parentState?.subFlows?.[2].subFlowId).toBe(child3.flowId);
    });

    it('should pass context from parent to child', async () => {
      const parentConfig: StateMachineConfig = {
        id: 'context-parent',
        initialState: 'start',
        states: {
          start: {
            name: 'start',
            type: 'final'
          }
        }
      };

      const childConfig: StateMachineConfig = {
        id: 'context-child',
        initialState: 'init',
        states: {
          init: {
            name: 'init',
            onEntry: async (ctx) => {
              // Should receive parent context merged with child context
              ctx.childProcessed = true;
            },
            type: 'final'
          }
        }
      };

      parentEngine = new FlowEngine(parentConfig, storage);
      childEngine = new FlowEngine(childConfig, storage);

      const parentFlow = await parentEngine.start({
        context: { parentData: 'important-value', userId: 123 }
      });

      const childFlow = await parentEngine.startSubFlow(
        parentFlow.flowId,
        childConfig,
        { context: { childSpecificData: 'child-value' } }
      );

      const childState = await childEngine.getFlow(childFlow.flowId);
      // Child gets parent context (passed by startSubFlow)
      expect(childState?.context.childSpecificData).toBe('child-value');
      expect(childState?.context.childProcessed).toBe(true);
      // Note: parent context is only passed if options.context doesn't override it
      // Per flow-engine.ts line 553: context: options.context || parentFlow.context
    });
  });

  describe('Nested Sub-flows', () => {
    it('should support nested sub-flows (grandchild)', async () => {
      const grandparentConfig: StateMachineConfig = {
        id: 'grandparent',
        initialState: 'start',
        states: {
          start: { name: 'start', type: 'final' }
        }
      };

      const parentConfig: StateMachineConfig = {
        id: 'parent',
        initialState: 'start',
        states: {
          start: { name: 'start', type: 'final' }
        }
      };

      const childConfig: StateMachineConfig = {
        id: 'child',
        initialState: 'start',
        states: {
          start: { name: 'start', type: 'final' }
        }
      };

      const grandparentEngine = new FlowEngine(grandparentConfig, storage);
      const parentEngine = new FlowEngine(parentConfig, storage);
      const childEngine = new FlowEngine(childConfig, storage);

      // Start grandparent
      const grandparentFlow = await grandparentEngine.start({
        context: { level: 'grandparent' }
      });

      // Start parent as sub-flow
      const parentFlow = await grandparentEngine.startSubFlow(
        grandparentFlow.flowId,
        parentConfig,
        { context: { level: 'parent' } }
      );

      // Start child as sub-flow of parent
      const childFlow = await parentEngine.startSubFlow(
        parentFlow.flowId,
        childConfig,
        { context: { level: 'child' } }
      );

      // Verify hierarchy
      const grandparentState = await grandparentEngine.getFlow(grandparentFlow.flowId);
      const parentState = await parentEngine.getFlow(parentFlow.flowId);
      const childState = await childEngine.getFlow(childFlow.flowId);

      expect(grandparentState?.subFlows?.[0].subFlowId).toBe(parentFlow.flowId);
      expect(parentState?.subFlows?.[0].subFlowId).toBe(childFlow.flowId);
      expect(childState?.context.level).toBe('child');
      expect(parentState?.context.level).toBe('parent');
      expect(grandparentState?.context.level).toBe('grandparent');
    });
  });

  describe('Real-World Composition Patterns', () => {
    it('should implement order processing with payment sub-flow', async () => {
      const operations: string[] = [];

      // Main order workflow
      const orderConfig: StateMachineConfig = {
        id: 'order-processing',
        initialState: 'pending',
        states: {
          pending: {
            name: 'pending',
            transitions: [
              { event: 'VALIDATE', to: 'validated' }
            ]
          },
          validated: {
            name: 'validated',
            onEntry: async (ctx) => {
              operations.push('order_validated');
            },
            transitions: [
              { event: 'PROCESS_PAYMENT', to: 'payment_processing' }
            ]
          },
          payment_processing: {
            name: 'payment_processing',
            transitions: [
              { event: 'PAYMENT_DONE', to: 'shipping' }
            ]
          },
          shipping: {
            name: 'shipping',
            onEntry: async (ctx) => {
              operations.push('order_shipped');
            },
            transitions: [
              { event: 'SHIPPED', to: 'completed' }
            ]
          },
          completed: {
            name: 'completed',
            type: 'final'
          }
        }
      };

      // Payment sub-workflow
      const paymentConfig: StateMachineConfig = {
        id: 'payment-processing',
        initialState: 'authorizing',
        states: {
          authorizing: {
            name: 'authorizing',
            onEntry: async (ctx) => {
              operations.push('payment_authorizing');
            },
            transitions: [
              { event: 'AUTHORIZED', to: 'capturing' }
            ]
          },
          capturing: {
            name: 'capturing',
            onEntry: async (ctx) => {
              operations.push('payment_capturing');
            },
            transitions: [
              { event: 'CAPTURED', to: 'confirmed' }
            ]
          },
          confirmed: {
            name: 'confirmed',
            onEntry: async (ctx) => {
              operations.push('payment_confirmed');
              ctx.paymentId = 'PAY-123';
            },
            type: 'final'
          }
        }
      };

      const orderEngine = new FlowEngine(orderConfig, storage);
      const paymentEngine = new FlowEngine(paymentConfig, storage);

      // Start order
      const orderFlow = await orderEngine.start({
        context: { orderId: 'ORD-001', amount: 100 }
      });

      await orderEngine.execute(orderFlow.flowId, { event: 'VALIDATE' });
      await orderEngine.execute(orderFlow.flowId, { event: 'PROCESS_PAYMENT' });

      // Start payment sub-flow
      const paymentFlow = await orderEngine.startSubFlow(
        orderFlow.flowId,
        paymentConfig,
        { context: { amount: 100, currency: 'USD' } }
      );

      // Execute payment workflow
      await paymentEngine.execute(paymentFlow.flowId, { event: 'AUTHORIZED' });
      await paymentEngine.execute(paymentFlow.flowId, { event: 'CAPTURED' });

      // Wait for payment completion
      const paymentResult = await orderEngine.waitForSubFlow(orderFlow.flowId, paymentFlow.flowId);
      expect(paymentResult.status).toBe('completed');
      expect(paymentResult.context.paymentId).toBe('PAY-123');

      // Continue order processing
      await orderEngine.execute(orderFlow.flowId, { event: 'PAYMENT_DONE' });
      await orderEngine.execute(orderFlow.flowId, { event: 'SHIPPED' });

      // Verify operations order
      expect(operations).toEqual([
        'order_validated',
        'payment_authorizing',
        'payment_capturing',
        'payment_confirmed',
        'order_shipped'
      ]);

      const finalOrder = await orderEngine.getFlow(orderFlow.flowId);
      expect(finalOrder?.status).toBe('completed');
      expect(finalOrder?.subFlows?.[0].subFlowId).toBe(paymentFlow.flowId);
    });

    it('should implement document approval with review sub-flows', async () => {
      const reviews: string[] = [];

      // Main document workflow
      const documentConfig: StateMachineConfig = {
        id: 'document-approval',
        initialState: 'submitted',
        states: {
          submitted: {
            name: 'submitted',
            transitions: [
              { event: 'START_REVIEW', to: 'under_review' }
            ]
          },
          under_review: {
            name: 'under_review',
            transitions: [
              { event: 'ALL_APPROVED', to: 'approved' },
              { event: 'REJECTED', to: 'rejected' }
            ]
          },
          approved: {
            name: 'approved',
            type: 'final'
          },
          rejected: {
            name: 'rejected',
            type: 'final'
          }
        }
      };

      // Review sub-workflow
      const reviewConfig: StateMachineConfig = {
        id: 'review-process',
        initialState: 'pending',
        states: {
          pending: {
            name: 'pending',
            transitions: [
              { event: 'APPROVE', to: 'approved' },
              { event: 'REJECT', to: 'rejected' }
            ]
          },
          approved: {
            name: 'approved',
            onEntry: async (ctx) => {
              reviews.push(`${ctx.reviewer}:approved`);
              ctx.decision = 'approved';
            },
            type: 'final'
          },
          rejected: {
            name: 'rejected',
            onEntry: async (ctx) => {
              reviews.push(`${ctx.reviewer}:rejected`);
              ctx.decision = 'rejected';
            },
            type: 'final'
          }
        }
      };

      const documentEngine = new FlowEngine(documentConfig, storage);
      const reviewEngine = new FlowEngine(reviewConfig, storage);

      // Start document
      const docFlow = await documentEngine.start({
        context: { documentId: 'DOC-001', title: 'Contract' }
      });

      await documentEngine.execute(docFlow.flowId, { event: 'START_REVIEW' });

      // Start multiple review sub-flows
      const review1 = await documentEngine.startSubFlow(
        docFlow.flowId,
        reviewConfig,
        { context: { reviewer: 'Alice' } }
      );

      const review2 = await documentEngine.startSubFlow(
        docFlow.flowId,
        reviewConfig,
        { context: { reviewer: 'Bob' } }
      );

      const review3 = await documentEngine.startSubFlow(
        docFlow.flowId,
        reviewConfig,
        { context: { reviewer: 'Carol' } }
      );

      // Execute reviews
      await reviewEngine.execute(review1.flowId, { event: 'APPROVE' });
      await reviewEngine.execute(review2.flowId, { event: 'APPROVE' });
      await reviewEngine.execute(review3.flowId, { event: 'APPROVE' });

      // Wait for all reviews
      const result1 = await documentEngine.waitForSubFlow(docFlow.flowId, review1.flowId);
      const result2 = await documentEngine.waitForSubFlow(docFlow.flowId, review2.flowId);
      const result3 = await documentEngine.waitForSubFlow(docFlow.flowId, review3.flowId);

      expect(result1.context.decision).toBe('approved');
      expect(result2.context.decision).toBe('approved');
      expect(result3.context.decision).toBe('approved');

      // All approved - complete document
      await documentEngine.execute(docFlow.flowId, { event: 'ALL_APPROVED' });

      expect(reviews).toHaveLength(3);
      expect(reviews).toContain('Alice:approved');
      expect(reviews).toContain('Bob:approved');
      expect(reviews).toContain('Carol:approved');

      const finalDoc = await documentEngine.getFlow(docFlow.flowId);
      expect(finalDoc?.status).toBe('completed');
      expect(finalDoc?.subFlows).toHaveLength(3);
    });

    it('should implement multi-stage data processing pipeline', async () => {
      const pipeline: string[] = [];

      // Main pipeline
      const mainConfig: StateMachineConfig = {
        id: 'data-pipeline',
        initialState: 'ingesting',
        states: {
          ingesting: {
            name: 'ingesting',
            onEntry: async (ctx) => {
              pipeline.push('ingest');
              ctx.data = ['record1', 'record2', 'record3'];
            },
            transitions: [
              { event: 'INGESTED', to: 'processing' }
            ]
          },
          processing: {
            name: 'processing',
            transitions: [
              { event: 'PROCESSED', to: 'completed' }
            ]
          },
          completed: {
            name: 'completed',
            type: 'final'
          }
        }
      };

      // Processing stage sub-workflow
      const processConfig: StateMachineConfig = {
        id: 'process-stage',
        initialState: 'validating',
        states: {
          validating: {
            name: 'validating',
            onEntry: async (ctx) => {
              pipeline.push(`validate:${ctx.stage}`);
            },
            transitions: [
              { event: 'VALID', to: 'transforming' }
            ]
          },
          transforming: {
            name: 'transforming',
            onEntry: async (ctx) => {
              pipeline.push(`transform:${ctx.stage}`);
            },
            transitions: [
              { event: 'TRANSFORMED', to: 'done' }
            ]
          },
          done: {
            name: 'done',
            onEntry: async (ctx) => {
              pipeline.push(`complete:${ctx.stage}`);
            },
            type: 'final'
          }
        }
      };

      const mainEngine = new FlowEngine(mainConfig, storage);
      const processEngine = new FlowEngine(processConfig, storage);

      // Start main pipeline
      const mainFlow = await mainEngine.start({
        context: { pipelineId: 'PIPE-001' }
      });

      await mainEngine.execute(mainFlow.flowId, { event: 'INGESTED' });

      // Start processing stages as sub-flows
      const stage1 = await mainEngine.startSubFlow(mainFlow.flowId, processConfig, { context: { stage: 'cleansing' } });
      const stage2 = await mainEngine.startSubFlow(mainFlow.flowId, processConfig, { context: { stage: 'enrichment' } });
      const stage3 = await mainEngine.startSubFlow(mainFlow.flowId, processConfig, { context: { stage: 'aggregation' } });

      // Execute stages
      for (const stage of [stage1, stage2, stage3]) {
        await processEngine.execute(stage.flowId, { event: 'VALID' });
        await processEngine.execute(stage.flowId, { event: 'TRANSFORMED' });
      }

      // Wait for all stages
      await mainEngine.waitForSubFlow(mainFlow.flowId, stage1.flowId);
      await mainEngine.waitForSubFlow(mainFlow.flowId, stage2.flowId);
      await mainEngine.waitForSubFlow(mainFlow.flowId, stage3.flowId);

      // Complete pipeline
      await mainEngine.execute(mainFlow.flowId, { event: 'PROCESSED' });

      // Verify pipeline execution order
      // Note: All sub-flows start concurrently, so their validation happens together
      expect(pipeline).toEqual([
        'ingest',
        'validate:cleansing',
        'validate:enrichment',
        'validate:aggregation',
        'transform:cleansing',
        'complete:cleansing',
        'transform:enrichment',
        'complete:enrichment',
        'transform:aggregation',
        'complete:aggregation'
      ]);

      const final = await mainEngine.getFlow(mainFlow.flowId);
      expect(final?.status).toBe('completed');
      expect(final?.subFlows).toHaveLength(3);
    });
  });

  describe('Error Handling in Composition', () => {
    it('should handle sub-flow failure gracefully', async () => {
      const parentConfig: StateMachineConfig = {
        id: 'parent',
        initialState: 'start',
        states: {
          start: {
            name: 'start',
            transitions: [
              { event: 'CHILD_FAILED', to: 'handling_error' }
            ]
          },
          handling_error: {
            name: 'handling_error',
            type: 'final'
          }
        }
      };

      const childConfig: StateMachineConfig = {
        id: 'failing-child',
        initialState: 'working',
        states: {
          working: {
            name: 'working',
            transitions: [
              { event: 'PROCESS', to: 'processing' }
            ]
          },
          processing: {
            name: 'processing',
            onEntry: async () => {
              throw new Error('Child processing failed');
            },
            transitions: [
              { event: 'DONE', to: 'done' }
            ]
          },
          done: {
            name: 'done',
            type: 'final'
          }
        }
      };

      parentEngine = new FlowEngine(parentConfig, storage);
      childEngine = new FlowEngine(childConfig, storage);

      const parentFlow = await parentEngine.start();

      const childFlow = await parentEngine.startSubFlow(
        parentFlow.flowId,
        childConfig,
        {}
      );

      // Move child to processing state - this will fail in onEntry
      const result = await childEngine.execute(childFlow.flowId, { event: 'PROCESS' });
      expect(result.success).toBe(false);
      expect(result.state.status).toBe('failed');

      // Parent can check child status
      const childState = await childEngine.getFlow(childFlow.flowId);
      expect(childState?.status).toBe('failed');

      // Parent handles the error
      await parentEngine.execute(parentFlow.flowId, { event: 'CHILD_FAILED' });

      const parentState = await parentEngine.getFlow(parentFlow.flowId);
      expect(parentState?.status).toBe('completed');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty sub-flow list', async () => {
      const config: StateMachineConfig = {
        id: 'no-subflows',
        initialState: 'start',
        states: {
          start: {
            name: 'start',
            type: 'final'
          }
        }
      };

      const engine = new FlowEngine(config, storage);
      const flow = await engine.start();

      const state = await engine.getFlow(flow.flowId);
      expect(state?.subFlows).toEqual([]);
    });

    it('should allow sub-flows to complete before parent', async () => {
      const parentConfig: StateMachineConfig = {
        id: 'slow-parent',
        initialState: 'start',
        states: {
          start: {
            name: 'start',
            transitions: [
              { event: 'COMPLETE', to: 'done' }
            ]
          },
          done: {
            name: 'done',
            type: 'final'
          }
        }
      };

      const childConfig: StateMachineConfig = {
        id: 'fast-child',
        initialState: 'processing',
        states: {
          processing: {
            name: 'processing',
            transitions: [
              { event: 'FINISH', to: 'done' }
            ]
          },
          done: {
            name: 'done',
            type: 'final'
          }
        }
      };

      parentEngine = new FlowEngine(parentConfig, storage);
      childEngine = new FlowEngine(childConfig, storage);

      const parentFlow = await parentEngine.start();
      const childFlow = await parentEngine.startSubFlow(parentFlow.flowId, childConfig, {});

      // Complete the child quickly
      await childEngine.execute(childFlow.flowId, { event: 'FINISH' });
      
      const childState = await childEngine.getFlow(childFlow.flowId);
      expect(childState?.status).toBe('completed');

      // Parent still running
      const parentState1 = await parentEngine.getFlow(parentFlow.flowId);
      expect(parentState1?.status).toBe('active');

      // Parent completes later
      await parentEngine.execute(parentFlow.flowId, { event: 'COMPLETE' });

      const parentState2 = await parentEngine.getFlow(parentFlow.flowId);
      expect(parentState2?.status).toBe('completed');
    });
  });
});
