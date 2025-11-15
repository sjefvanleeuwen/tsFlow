import { describe, it, expect, beforeEach } from 'vitest';
import { FlowEngine } from '../flow-engine.js';
import { InMemoryStateStorage } from '../storage.js';
import type { StateMachineConfig } from '../state-machine.js';

describe('FlowEngine - Saga Pattern', () => {
  let storage: InMemoryStateStorage;
  let engine: FlowEngine;

  beforeEach(() => {
    storage = new InMemoryStateStorage();
  });

  describe('Basic Compensation', () => {
    it('should execute compensations in reverse order on failure', async () => {
      const compensations: string[] = [];

      const config: StateMachineConfig = {
        id: 'booking-saga',
        initialState: 'idle',
        states: {
          idle: {
            name: 'idle',
            transitions: [
              { event: 'START', to: 'booking_flight' }
            ]
          },
          booking_flight: {
            name: 'booking_flight',
            onEntry: async (ctx) => {
              ctx.flightId = 'FLIGHT-123';
            },
            transitions: [
              { event: 'FLIGHT_BOOKED', to: 'booking_hotel' }
            ]
          },
          booking_hotel: {
            name: 'booking_hotel',
            onEntry: async (ctx) => {
              ctx.hotelId = 'HOTEL-456';
            },
            transitions: [
              { event: 'HOTEL_BOOKED', to: 'booking_car' }
            ]
          },
          booking_car: {
            name: 'booking_car',
            onEntry: async () => {
              // This will fail and trigger compensations
              throw new Error('Car booking failed');
            },
            transitions: [
              { event: 'CAR_BOOKED', to: 'confirmed' }
            ]
          },
          confirmed: {
            name: 'confirmed',
            type: 'final'
          }
        }
      };

      engine = new FlowEngine(config, storage);
      const flow = await engine.start();

      // Book flight
      await engine.execute(flow.flowId, { event: 'START' });
      await engine.recordCompensation(
        flow.flowId,
        async () => { compensations.push('cancel_flight'); },
        'Cancel flight booking'
      );

      // Book hotel
      await engine.execute(flow.flowId, { event: 'FLIGHT_BOOKED' });
      await engine.recordCompensation(
        flow.flowId,
        async () => { compensations.push('cancel_hotel'); },
        'Cancel hotel booking'
      );

      // Try to book car - this will fail and trigger automatic compensations
      const result = await engine.execute(flow.flowId, { event: 'HOTEL_BOOKED' });

      // Verify failure
      expect(result.success).toBe(false);
      expect(result.compensated).toBe(true);

      // Compensations should execute in reverse order (LIFO)
      expect(compensations).toEqual(['cancel_hotel', 'cancel_flight']);

      // Flow should be marked as failed
      const finalState = await engine.getFlow(flow.flowId);
      expect(finalState?.status).toBe('failed');
      expect(finalState?.error?.message).toContain('compensated');
    });

    it('should not execute compensations on success', async () => {
      const compensations: string[] = [];

      const config: StateMachineConfig = {
        id: 'simple-saga',
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

      engine = new FlowEngine(config, storage);
      const flow = await engine.start();

      await engine.recordCompensation(
        flow.flowId,
        async () => { compensations.push('cleanup'); },
        'Cleanup'
      );

      const result = await engine.execute(flow.flowId, { event: 'COMPLETE' });

      // Compensations should NOT have run on success
      expect(compensations).toEqual([]);
      expect(result.compensated).toBe(false);

      // Flow should be completed successfully
      const finalState = await engine.getFlow(flow.flowId);
      expect(finalState?.status).toBe('completed');
      expect(finalState?.currentState).toBe('done');
    });

    it('should track compensation records with metadata', async () => {
      const config: StateMachineConfig = {
        id: 'tracking-saga',
        initialState: 'start',
        states: {
          start: {
            name: 'start',
            transitions: [
              { event: 'NEXT', to: 'step1' }
            ]
          },
          step1: {
            name: 'step1',
            transitions: [
              { event: 'NEXT', to: 'step2' }
            ]
          },
          step2: {
            name: 'step2',
            type: 'final'
          }
        }
      };

      engine = new FlowEngine(config, storage);
      const flow = await engine.start();

      await engine.execute(flow.flowId, { event: 'NEXT' });
      await engine.recordCompensation(
        flow.flowId,
        async () => {},
        'Undo step 1'
      );

      await engine.execute(flow.flowId, { event: 'NEXT' });
      await engine.recordCompensation(
        flow.flowId,
        async () => {},
        'Undo step 2'
      );

      const state = await engine.getFlow(flow.flowId);
      expect(state?.compensations).toHaveLength(2);
      expect(state?.compensations?.[0].description).toBe('Undo step 1');
      expect(state?.compensations?.[1].description).toBe('Undo step 2');
      expect(state?.compensations?.[0].state).toBe('step1');
      expect(state?.compensations?.[1].state).toBe('step2');
    });

    it('should handle compensation failures gracefully', async () => {
      const executed: string[] = [];

      const config: StateMachineConfig = {
        id: 'failing-compensation',
        initialState: 'start',
        states: {
          start: {
            name: 'start',
            transitions: [
              { event: 'NEXT', to: 'processing' }
            ]
          },
          processing: {
            name: 'processing',
            onEntry: async () => {
              throw new Error('Processing failed');
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

      engine = new FlowEngine(config, storage);
      const flow = await engine.start();

      // Register compensations BEFORE triggering failure
      await engine.recordCompensation(
        flow.flowId,
        async () => { executed.push('comp1'); },
        'Compensation 1'
      );

      await engine.recordCompensation(
        flow.flowId,
        async () => {
          executed.push('comp2');
          throw new Error('Compensation 2 failed');
        },
        'Compensation 2'
      );

      await engine.recordCompensation(
        flow.flowId,
        async () => { executed.push('comp3'); },
        'Compensation 3'
      );

      // Trigger failure - compensation happens automatically
      const result = await engine.execute(flow.flowId, { event: 'NEXT' });
      expect(result.success).toBe(false);
      expect(result.compensated).toBe(true);

      // All compensations attempted in reverse order despite one failing
      expect(executed).toEqual(['comp3', 'comp2', 'comp1']);
    });
  });

  describe('Real-World Saga Patterns', () => {
    it('should implement travel booking saga with full rollback', async () => {
      const bookings: string[] = [];
      const cancellations: string[] = [];

      const travelConfig: StateMachineConfig = {
        id: 'travel-booking-saga',
        initialState: 'selecting',
        states: {
          selecting: {
            name: 'selecting',
            transitions: [
              { event: 'BOOK_FLIGHT', to: 'flight_booked' }
            ]
          },
          flight_booked: {
            name: 'flight_booked',
            onEntry: async (ctx) => {
              const flightId = `FL-${Date.now()}`;
              bookings.push(`flight:${flightId}`);
              ctx.flightId = flightId;
            },
            transitions: [
              { event: 'BOOK_HOTEL', to: 'hotel_booked' }
            ]
          },
          hotel_booked: {
            name: 'hotel_booked',
            onEntry: async (ctx) => {
              const hotelId = `HT-${Date.now()}`;
              bookings.push(`hotel:${hotelId}`);
              ctx.hotelId = hotelId;
            },
            transitions: [
              { event: 'BOOK_CAR', to: 'car_booked' }
            ]
          },
          car_booked: {
            name: 'car_booked',
            onEntry: async (ctx) => {
              const carId = `CR-${Date.now()}`;
              bookings.push(`car:${carId}`);
              ctx.carId = carId;
              // Simulate payment failure
              throw new Error('Payment processing failed');
            },
            transitions: [
              { event: 'CONFIRM', to: 'confirmed' }
            ]
          },
          confirmed: {
            name: 'confirmed',
            type: 'final'
          }
        }
      };

      engine = new FlowEngine(travelConfig, storage);
      const flow = await engine.start({
        context: { userId: 'USER-123', budget: 5000 }
      });

      // Book flight
      await engine.execute(flow.flowId, { event: 'BOOK_FLIGHT' });
      await engine.recordCompensation(
        flow.flowId,
        async (ctx: Record<string, unknown>) => { 
          cancellations.push(`cancel_flight:${ctx.flightId}`); 
        },
        'Cancel flight'
      );

      // Book hotel
      await engine.execute(flow.flowId, { event: 'BOOK_HOTEL' });
      await engine.recordCompensation(
        flow.flowId,
        async (ctx: Record<string, unknown>) => { 
          cancellations.push(`cancel_hotel:${ctx.hotelId}`); 
        },
        'Cancel hotel'
      );

      // Book car - will fail during car booking
      const result = await engine.execute(flow.flowId, { event: 'BOOK_CAR' });

      // Verify failure and compensation
      expect(result.success).toBe(false);
      expect(result.compensated).toBe(true);

      // Verify all bookings were attempted
      expect(bookings).toHaveLength(3);
      expect(bookings[0]).toMatch(/^flight:FL-/);
      expect(bookings[1]).toMatch(/^hotel:HT-/);
      expect(bookings[2]).toMatch(/^car:CR-/);

      // Verify cancellations in reverse order (note: car compensation not registered before failure)
      expect(cancellations).toHaveLength(2);
      expect(cancellations[0]).toMatch(/^cancel_hotel:HT-/);
      expect(cancellations[1]).toMatch(/^cancel_flight:FL-/);
    });

    it('should implement order processing saga with inventory rollback', async () => {
      const operations: string[] = [];

      const orderConfig: StateMachineConfig = {
        id: 'order-processing-saga',
        initialState: 'pending',
        states: {
          pending: {
            name: 'pending',
            transitions: [
              { event: 'PROCESS', to: 'reserving_inventory' }
            ]
          },
          reserving_inventory: {
            name: 'reserving_inventory',
            onEntry: async (ctx) => {
              operations.push('reserve_inventory');
              ctx.inventoryReserved = true;
            },
            transitions: [
              { event: 'RESERVED', to: 'processing_payment' }
            ]
          },
          processing_payment: {
            name: 'processing_payment',
            onEntry: async (ctx) => {
              operations.push('process_payment');
              ctx.paymentProcessed = true;
              // Payment fails
              throw new Error('Payment gateway timeout');
            },
            transitions: [
              { event: 'PAID', to: 'shipping' }
            ]
          },
          shipping: {
            name: 'shipping',
            onEntry: async (ctx) => {
              operations.push('create_shipment');
              ctx.shipmentCreated = true;
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

      engine = new FlowEngine(orderConfig, storage);
      const flow = await engine.start({
        context: { orderId: 'ORD-999', items: ['ITEM-1', 'ITEM-2'] }
      });

      // Reserve inventory
      await engine.execute(flow.flowId, { event: 'PROCESS' });
      await engine.recordCompensation(
        flow.flowId,
        async () => { operations.push('release_inventory'); },
        'Release inventory'
      );

      // Try to process payment - will fail
      const result = await engine.execute(flow.flowId, { event: 'RESERVED' });

      // Verify failure and automatic compensation
      expect(result.success).toBe(false);
      expect(result.compensated).toBe(true);

      // Verify operations and compensations
      expect(operations).toEqual([
        'reserve_inventory',
        'process_payment',
        'release_inventory'
      ]);

      const finalState = await engine.getFlow(flow.flowId);
      expect(finalState?.status).toBe('failed');
      expect(finalState?.error?.message).toContain('compensated');
    });

    it('should implement distributed transaction saga', async () => {
      const transactions: Array<{ service: string; action: string }> = [];

      const distributedConfig: StateMachineConfig = {
        id: 'distributed-transaction',
        initialState: 'initiating',
        states: {
          initiating: {
            name: 'initiating',
            transitions: [
              { event: 'START', to: 'service_a' }
            ]
          },
          service_a: {
            name: 'service_a',
            onEntry: async (ctx) => {
              transactions.push({ service: 'A', action: 'execute' });
              ctx.serviceA = { status: 'success', data: 'A_DATA' };
            },
            transitions: [
              { event: 'SUCCESS', to: 'service_b' }
            ]
          },
          service_b: {
            name: 'service_b',
            onEntry: async (ctx) => {
              transactions.push({ service: 'B', action: 'execute' });
              ctx.serviceB = { status: 'success', data: 'B_DATA' };
            },
            transitions: [
              { event: 'SUCCESS', to: 'service_c' }
            ]
          },
          service_c: {
            name: 'service_c',
            onEntry: async (ctx) => {
              transactions.push({ service: 'C', action: 'execute' });
              // Simulate failure
              throw new Error('Service C failed');
            },
            transitions: [
              { event: 'SUCCESS', to: 'committed' }
            ]
          },
          committed: {
            name: 'committed',
            type: 'final'
          }
        }
      };

      engine = new FlowEngine(distributedConfig, storage);
      const flow = await engine.start({ context: { transactionId: 'TXN-001' } });

      // Execute service A
      await engine.execute(flow.flowId, { event: 'START' });
      await engine.recordCompensation(
        flow.flowId,
        async () => { transactions.push({ service: 'A', action: 'compensate' }); },
        'Compensate service A'
      );

      // Execute service B
      await engine.execute(flow.flowId, { event: 'SUCCESS' });
      await engine.recordCompensation(
        flow.flowId,
        async () => { transactions.push({ service: 'B', action: 'compensate' }); },
        'Compensate service B'
      );

      // Service C fails - automatic compensation
      const result = await engine.execute(flow.flowId, { event: 'SUCCESS' });
      expect(result.success).toBe(false);
      expect(result.compensated).toBe(true);

      // Verify transaction log
      expect(transactions).toHaveLength(5);
      expect(transactions[0]).toMatchObject({ service: 'A', action: 'execute' });
      expect(transactions[1]).toMatchObject({ service: 'B', action: 'execute' });
      expect(transactions[2]).toMatchObject({ service: 'C', action: 'execute' });
      expect(transactions[3]).toMatchObject({ service: 'B', action: 'compensate' });
      expect(transactions[4]).toMatchObject({ service: 'A', action: 'compensate' });
    });

    it('should implement banking transfer saga', async () => {
      const accounts: Record<string, number> = {
        'ACC-001': 1000,
        'ACC-002': 500
      };
      const ledger: string[] = [];

      const transferConfig: StateMachineConfig = {
        id: 'money-transfer-saga',
        initialState: 'initiated',
        states: {
          initiated: {
            name: 'initiated',
            transitions: [
              { event: 'START', to: 'debiting' }
            ]
          },
          debiting: {
            name: 'debiting',
            onEntry: async (ctx) => {
              const amount = ctx.amount as number;
              const from = ctx.fromAccount as string;
              accounts[from] -= amount;
              ledger.push(`DEBIT:${from}:${amount}`);
            },
            transitions: [
              { event: 'DEBITED', to: 'crediting' }
            ]
          },
          crediting: {
            name: 'crediting',
            onEntry: async (ctx) => {
              const amount = ctx.amount as number;
              const to = ctx.toAccount as string;
              // Simulate credit failure
              throw new Error('Crediting account failed');
            },
            transitions: [
              { event: 'CREDITED', to: 'completed' }
            ]
          },
          completed: {
            name: 'completed',
            type: 'final'
          }
        }
      };

      engine = new FlowEngine(transferConfig, storage);
      const flow = await engine.start({
        context: { 
          fromAccount: 'ACC-001',
          toAccount: 'ACC-002',
          amount: 200
        }
      });

      // Start transfer
      await engine.execute(flow.flowId, { event: 'START' });
      await engine.recordCompensation(
        flow.flowId,
        async (ctx: Record<string, unknown>) => {
          const amount = ctx.amount as number;
          const from = ctx.fromAccount as string;
          accounts[from] += amount;
          ledger.push(`REFUND:${from}:${amount}`);
        },
        'Refund debit'
      );

      // Try to credit - will fail
      const result = await engine.execute(flow.flowId, { event: 'DEBITED' });

      // Verify rollback
      expect(result.success).toBe(false);
      expect(result.compensated).toBe(true);

      // Verify account balances restored
      expect(accounts['ACC-001']).toBe(1000); // Restored
      expect(accounts['ACC-002']).toBe(500);  // Never credited

      // Verify ledger
      expect(ledger).toEqual([
        'DEBIT:ACC-001:200',
        'REFUND:ACC-001:200'
      ]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle no compensations registered', async () => {
      const config: StateMachineConfig = {
        id: 'no-compensation',
        initialState: 'start',
        states: {
          start: {
            name: 'start',
            transitions: [
              { event: 'NEXT', to: 'processing' }
            ]
          },
          processing: {
            name: 'processing',
            onEntry: async () => {
              throw new Error('Processing failed');
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

      engine = new FlowEngine(config, storage);
      const flow = await engine.start();

      // Trigger failure without compensations registered - fails when transitioning to processing
      const result = await engine.execute(flow.flowId, { event: 'NEXT' });

      expect(result.success).toBe(false);
      expect(result.compensated).toBe(false); // No compensations to run

      const finalState = await engine.getFlow(flow.flowId);
      expect(finalState?.status).toBe('failed');
      expect(finalState?.error?.message).toContain('Processing failed');
    });

    it('should preserve compensation records after execution', async () => {
      const config: StateMachineConfig = {
        id: 'preservation-test',
        initialState: 'start',
        states: {
          start: {
            name: 'start',
            transitions: [
              { event: 'NEXT', to: 'done' }
            ]
          },
          done: {
            name: 'done',
            type: 'final'
          }
        }
      };

      engine = new FlowEngine(config, storage);
      const flow = await engine.start();

      await engine.recordCompensation(
        flow.flowId,
        async () => {},
        'Test compensation'
      );

      const beforeExec = await engine.getFlow(flow.flowId);
      expect(beforeExec?.compensations).toHaveLength(1);

      await engine.execute(flow.flowId, { event: 'NEXT' });

      const afterExec = await engine.getFlow(flow.flowId);
      expect(afterExec?.compensations).toHaveLength(1);
    });
  });
});
