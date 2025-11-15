import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStateStorage, FlowState } from '../storage.js';

describe('InMemoryStateStorage', () => {
  let storage: InMemoryStateStorage;

  beforeEach(() => {
    storage = new InMemoryStateStorage();
  });

  describe('save and get', () => {
    it('should save and retrieve a flow state', async () => {
      const state: FlowState = {
        flowId: 'test-1',
        flowDefinitionId: 'order-flow',
        currentState: 'pending',
        status: 'active',
        context: { orderId: '123' },
        history: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        compensations: [],
        subFlows: []
      };

      await storage.save(state);
      const retrieved = await storage.get('test-1');

      expect(retrieved).toEqual(state);
    });

    it('should return null for non-existent flow', async () => {
      const retrieved = await storage.get('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should update existing flow state', async () => {
      const state: FlowState = {
        flowId: 'test-1',
        flowDefinitionId: 'order-flow',
        currentState: 'pending',
        status: 'active',
        context: { orderId: '123' },
        history: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        compensations: [],
        subFlows: []
      };

      await storage.save(state);
      state.currentState = 'approved';
      await storage.save(state);

      const retrieved = await storage.get('test-1');
      expect(retrieved?.currentState).toBe('approved');
    });
  });

  describe('delete', () => {
    it('should delete a flow state', async () => {
      const state: FlowState = {
        flowId: 'test-1',
        flowDefinitionId: 'order-flow',
        currentState: 'pending',
        status: 'active',
        context: {},
        history: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        compensations: [],
        subFlows: []
      };

      await storage.save(state);
      await storage.delete('test-1');

      const retrieved = await storage.get('test-1');
      expect(retrieved).toBeNull();
    });

    it('should not throw when deleting non-existent flow', async () => {
      await expect(storage.delete('non-existent')).resolves.not.toThrow();
    });
  });

  describe('exists', () => {
    it('should return true for existing flow', async () => {
      const state: FlowState = {
        flowId: 'test-1',
        flowDefinitionId: 'order-flow',
        currentState: 'pending',
        status: 'active',
        context: {},
        history: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        compensations: [],
        subFlows: []
      };

      await storage.save(state);
      const exists = await storage.exists('test-1');
      expect(exists).toBe(true);
    });

    it('should return false for non-existent flow', async () => {
      const exists = await storage.exists('non-existent');
      expect(exists).toBe(false);
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      await storage.save({
        flowId: 'flow-1',
        flowDefinitionId: 'order-flow',
        currentState: 'pending',
        status: 'active',
        context: {},
        history: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        compensations: [],
        subFlows: []
      });

      await storage.save({
        flowId: 'flow-2',
        flowDefinitionId: 'order-flow',
        currentState: 'approved',
        status: 'active',
        context: {},
        history: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        compensations: [],
        subFlows: []
      });

      await storage.save({
        flowId: 'flow-3',
        flowDefinitionId: 'user-flow',
        currentState: 'pending',
        status: 'completed',
        context: {},
        history: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        compensations: [],
        subFlows: []
      });
    });

    it('should list all flows without filter', async () => {
      const flows = await storage.list();
      expect(flows).toHaveLength(3);
    });

    it('should filter by status', async () => {
      const active = await storage.list({ status: 'active' });
      expect(active).toHaveLength(2);
      expect(active.every(f => f.status === 'active')).toBe(true);
    });

    it('should filter by currentState', async () => {
      const pendingFlows = await storage.list({ currentState: 'pending' });
      expect(pendingFlows).toHaveLength(2);
      expect(pendingFlows.every(f => f.currentState === 'pending')).toBe(true);
    });

    it('should filter by both status and currentState', async () => {
      const filtered = await storage.list({ 
        status: 'active',
        currentState: 'pending' 
      });
      expect(filtered).toHaveLength(1);
      expect(filtered.every(f => f.status === 'active' && f.currentState === 'pending')).toBe(true);
    });
  });

  describe('clear and size', () => {
    it('should clear all states', async () => {
      await storage.save({
        flowId: 'flow-1',
        flowDefinitionId: 'test',
        currentState: 'pending',
        status: 'active',
        context: {},
        history: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        compensations: [],
        subFlows: []
      });

      await storage.save({
        flowId: 'flow-2',
        flowDefinitionId: 'test',
        currentState: 'pending',
        status: 'active',
        context: {},
        history: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        compensations: [],
        subFlows: []
      });

      await storage.clear();
      const size = await storage.size();
      expect(size).toBe(0);
    });

    it('should return correct size', async () => {
      expect(await storage.size()).toBe(0);

      await storage.save({
        flowId: 'flow-1',
        flowDefinitionId: 'test',
        currentState: 'pending',
        status: 'active',
        context: {},
        history: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        compensations: [],
        subFlows: []
      });

      expect(await storage.size()).toBe(1);
    });
  });
});
