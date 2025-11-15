import { describe, it, expect, vi } from 'vitest';
import { StateMachine, StateMachineConfig } from '../state-machine.js';
import type { TransitionAction, ValidationFunction } from '../state-machine.js';

describe('StateMachine - Validation', () => {
  describe('Basic Validation', () => {
    it('should pass validation when context is valid', async () => {
      const validate: ValidationFunction = (ctx) => {
        return ctx.age >= 18;
      };

      const config: StateMachineConfig = {
        id: 'age-check',
        initialState: 'input',
        states: {
          input: {
            name: 'input',
            transitions: [
              { event: 'SUBMIT', to: 'verified' }
            ]
          },
          verified: {
            name: 'verified',
            type: 'final',
            validation: { validate }
          }
        }
      };

      const machine = new StateMachine(config);
      const result = await machine.executeTransition('input', 'SUBMIT', { age: 21 });

      expect(result.success).toBe(true);
      expect(result.toState).toBe('verified');
    });

    it('should fail validation when context is invalid', async () => {
      const validate: ValidationFunction = (ctx) => {
        return ctx.age >= 18;
      };

      const config: StateMachineConfig = {
        id: 'age-check-fail',
        initialState: 'input',
        states: {
          input: {
            name: 'input',
            transitions: [
              { event: 'SUBMIT', to: 'verified' }
            ]
          },
          verified: {
            name: 'verified',
            type: 'final',
            validation: { validate, errorMessage: 'Must be 18 or older' }
          }
        }
      };

      const machine = new StateMachine(config);
      const result = await machine.executeTransition('input', 'SUBMIT', { age: 16 });

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Must be 18 or older');
      expect(result.toState).toBe('input'); // Should stay in current state
    });

    it('should use custom error message from validation function', async () => {
      const validate: ValidationFunction = (ctx) => {
        if (!ctx.email) return 'Email is required';
        if (!ctx.email.includes('@')) return 'Email must be valid';
        return true;
      };

      const config: StateMachineConfig = {
        id: 'email-validation',
        initialState: 'draft',
        states: {
          draft: {
            name: 'draft',
            transitions: [
              { event: 'SUBMIT', to: 'submitted' }
            ]
          },
          submitted: {
            name: 'submitted',
            type: 'final',
            validation: { validate }
          }
        }
      };

      const machine = new StateMachine(config);
      
      const result1 = await machine.executeTransition('draft', 'SUBMIT', {});
      expect(result1.success).toBe(false);
      expect(result1.error?.message).toBe('Email is required');

      const result2 = await machine.executeTransition('draft', 'SUBMIT', { email: 'invalid' });
      expect(result2.success).toBe(false);
      expect(result2.error?.message).toBe('Email must be valid');

      const result3 = await machine.executeTransition('draft', 'SUBMIT', { email: 'test@example.com' });
      expect(result3.success).toBe(true);
    });

    it('should handle async validation', async () => {
      const validate: ValidationFunction = async (ctx) => {
        // Simulate async check (e.g., database lookup)
        await new Promise(resolve => setTimeout(resolve, 10));
        return ctx.username.length >= 3;
      };

      const config: StateMachineConfig = {
        id: 'async-validation',
        initialState: 'input',
        states: {
          input: {
            name: 'input',
            transitions: [
              { event: 'REGISTER', to: 'registered' }
            ]
          },
          registered: {
            name: 'registered',
            type: 'final',
            validation: {
              validate,
              errorMessage: 'Username must be at least 3 characters'
            }
          }
        }
      };

      const machine = new StateMachine(config);

      const result1 = await machine.executeTransition('input', 'REGISTER', { username: 'ab' });
      expect(result1.success).toBe(false);
      expect(result1.error?.message).toBe('Username must be at least 3 characters');

      const result2 = await machine.executeTransition('input', 'REGISTER', { username: 'alice' });
      expect(result2.success).toBe(true);
    });
  });

  describe('Validation with State Actions', () => {
    it('should validate before onEntry action', async () => {
      const onEntry: TransitionAction = vi.fn().mockResolvedValue(undefined);
      const validate: ValidationFunction = (ctx) => ctx.isValid === true;

      const config: StateMachineConfig = {
        id: 'validate-before-entry',
        initialState: 'idle',
        states: {
          idle: {
            name: 'idle',
            transitions: [
              { event: 'START', to: 'processing' }
            ]
          },
          processing: {
            name: 'processing',
            type: 'final',
            validation: { validate, errorMessage: 'Invalid context' },
            onEntry
          }
        }
      };

      const machine = new StateMachine(config);

      // Invalid context - onEntry should not be called
      const result1 = await machine.executeTransition('idle', 'START', { isValid: false });
      expect(result1.success).toBe(false);
      expect(onEntry).not.toHaveBeenCalled();

      // Valid context - onEntry should be called
      const result2 = await machine.executeTransition('idle', 'START', { isValid: true });
      expect(result2.success).toBe(true);
      expect(onEntry).toHaveBeenCalledTimes(1);
    });

    it('should execute transition action before validation', async () => {
      const transitionAction: TransitionAction = vi.fn((ctx) => {
        ctx.prepared = true;
      });

      const validate: ValidationFunction = (ctx) => {
        return ctx.prepared === true;
      };

      const config: StateMachineConfig = {
        id: 'action-then-validate',
        initialState: 'idle',
        states: {
          idle: {
            name: 'idle',
            transitions: [
              {
                event: 'PROCESS',
                to: 'complete',
                action: transitionAction
              }
            ]
          },
          complete: {
            name: 'complete',
            type: 'final',
            validation: { validate, errorMessage: 'Context not prepared' }
          }
        }
      };

      const machine = new StateMachine(config);
      const result = await machine.executeTransition('idle', 'PROCESS', {});

      expect(result.success).toBe(true);
      expect(transitionAction).toHaveBeenCalledTimes(1);
    });
  });

  describe('Validation with Retry', () => {
    it('should retry validation failures', async () => {
      let attemptCount = 0;
      const validate: ValidationFunction = () => {
        attemptCount++;
        return attemptCount >= 3;
      };

      const config: StateMachineConfig = {
        id: 'retry-validation',
        initialState: 'idle',
        states: {
          idle: {
            name: 'idle',
            transitions: [
              {
                event: 'TRY',
                to: 'success',
                retry: { maxAttempts: 3, delayMs: 10 }
              }
            ]
          },
          success: {
            name: 'success',
            type: 'final',
            validation: { validate, errorMessage: 'Validation failed' }
          }
        }
      };

      const machine = new StateMachine(config);
      const result = await machine.executeTransition('idle', 'TRY', {});

      expect(result.success).toBe(true);
      expect(attemptCount).toBe(3);
    });

    it('should fail after retrying validation failures', async () => {
      const validate: ValidationFunction = () => false;

      const config: StateMachineConfig = {
        id: 'retry-fail-validation',
        initialState: 'idle',
        states: {
          idle: {
            name: 'idle',
            transitions: [
              {
                event: 'TRY',
                to: 'success',
                retry: { maxAttempts: 2, delayMs: 10 }
              }
            ]
          },
          success: {
            name: 'success',
            type: 'final',
            validation: { validate, errorMessage: 'Always invalid' }
          }
        }
      };

      const machine = new StateMachine(config);
      const result = await machine.executeTransition('idle', 'TRY', {});

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Always invalid');
    });
  });

  describe('Complex Validation Rules', () => {
    it('should validate multiple fields', async () => {
      const validate: ValidationFunction = (ctx) => {
        if (!ctx.name) return 'Name is required';
        if (!ctx.email) return 'Email is required';
        if (!ctx.age) return 'Age is required';
        if (ctx.age < 18) return 'Must be 18 or older';
        if (!ctx.email.includes('@')) return 'Invalid email format';
        return true;
      };

      const config: StateMachineConfig = {
        id: 'multi-field-validation',
        initialState: 'input',
        states: {
          input: {
            name: 'input',
            transitions: [
              { event: 'SUBMIT', to: 'validated' }
            ]
          },
          validated: {
            name: 'validated',
            type: 'final',
            validation: { validate }
          }
        }
      };

      const machine = new StateMachine(config);

      const result1 = await machine.executeTransition('input', 'SUBMIT', {});
      expect(result1.success).toBe(false);
      expect(result1.error?.message).toBe('Name is required');

      const result2 = await machine.executeTransition('input', 'SUBMIT', { name: 'Alice' });
      expect(result2.success).toBe(false);
      expect(result2.error?.message).toBe('Email is required');

      const result3 = await machine.executeTransition('input', 'SUBMIT', {
        name: 'Alice',
        email: 'alice@example.com',
        age: 16
      });
      expect(result3.success).toBe(false);
      expect(result3.error?.message).toBe('Must be 18 or older');

      const result4 = await machine.executeTransition('input', 'SUBMIT', {
        name: 'Alice',
        email: 'alice@example.com',
        age: 25
      });
      expect(result4.success).toBe(true);
    });

    it('should validate nested objects', async () => {
      const validate: ValidationFunction = (ctx) => {
        if (!ctx.address?.street) return 'Street address is required';
        if (!ctx.address?.city) return 'City is required';
        if (!ctx.address?.zipCode) return 'Zip code is required';
        if (!/^\d{5}$/.test(ctx.address.zipCode)) return 'Invalid zip code format';
        return true;
      };

      const config: StateMachineConfig = {
        id: 'nested-validation',
        initialState: 'input',
        states: {
          input: {
            name: 'input',
            transitions: [
              { event: 'SUBMIT', to: 'validated' }
            ]
          },
          validated: {
            name: 'validated',
            type: 'final',
            validation: { validate }
          }
        }
      };

      const machine = new StateMachine(config);

      const result1 = await machine.executeTransition('input', 'SUBMIT', { address: {} });
      expect(result1.success).toBe(false);
      expect(result1.error?.message).toBe('Street address is required');

      const result2 = await machine.executeTransition('input', 'SUBMIT', {
        address: { street: '123 Main St', city: 'Boston', zipCode: 'invalid' }
      });
      expect(result2.success).toBe(false);
      expect(result2.error?.message).toBe('Invalid zip code format');

      const result3 = await machine.executeTransition('input', 'SUBMIT', {
        address: { street: '123 Main St', city: 'Boston', zipCode: '02101' }
      });
      expect(result3.success).toBe(true);
    });

    it('should validate array data', async () => {
      const validate: ValidationFunction = (ctx) => {
        if (!Array.isArray(ctx.items)) return 'Items must be an array';
        if (ctx.items.length === 0) return 'Cart cannot be empty';
        if (ctx.items.some((item: any) => !item.price || item.price <= 0)) {
          return 'All items must have valid prices';
        }
        return true;
      };

      const config: StateMachineConfig = {
        id: 'array-validation',
        initialState: 'cart',
        states: {
          cart: {
            name: 'cart',
            transitions: [
              { event: 'CHECKOUT', to: 'checkout' }
            ]
          },
          checkout: {
            name: 'checkout',
            type: 'final',
            validation: { validate }
          }
        }
      };

      const machine = new StateMachine(config);

      const result1 = await machine.executeTransition('cart', 'CHECKOUT', { items: [] });
      expect(result1.success).toBe(false);
      expect(result1.error?.message).toBe('Cart cannot be empty');

      const result2 = await machine.executeTransition('cart', 'CHECKOUT', {
        items: [{ name: 'Item1', price: 10 }, { name: 'Item2', price: -5 }]
      });
      expect(result2.success).toBe(false);
      expect(result2.error?.message).toBe('All items must have valid prices');

      const result3 = await machine.executeTransition('cart', 'CHECKOUT', {
        items: [{ name: 'Item1', price: 10 }, { name: 'Item2', price: 15 }]
      });
      expect(result3.success).toBe(true);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should validate payment processing', async () => {
      const validate: ValidationFunction = (ctx) => {
        if (!ctx.amount || ctx.amount <= 0) return 'Invalid amount';
        if (!ctx.cardNumber || ctx.cardNumber.length !== 16) return 'Invalid card number';
        if (!ctx.cvv || ctx.cvv.length !== 3) return 'Invalid CVV';
        return true;
      };

      const config: StateMachineConfig = {
        id: 'payment-validation',
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
            type: 'final',
            validation: { validate, errorMessage: 'Payment validation failed' }
          }
        }
      };

      const machine = new StateMachine(config);

      const result1 = await machine.executeTransition('pending', 'PROCESS', {
        amount: -10,
        cardNumber: '1234567890123456',
        cvv: '123'
      });
      expect(result1.success).toBe(false);
      expect(result1.error?.message).toBe('Invalid amount');

      const result2 = await machine.executeTransition('pending', 'PROCESS', {
        amount: 100,
        cardNumber: '1234567890123456',
        cvv: '123'
      });
      expect(result2.success).toBe(true);
    });

    it('should validate form submission workflow', async () => {
      const validateReview: ValidationFunction = (ctx) => {
        if (!ctx.title) return 'Title is required';
        if (ctx.title.length < 3) return 'Title must be at least 3 characters';
        return true;
      };

      const validateSubmitted: ValidationFunction = (ctx) => {
        if (!ctx.content) return 'Content is required';
        if (ctx.content.length < 10) return 'Content must be at least 10 characters';
        return true;
      };

      const config: StateMachineConfig = {
        id: 'form-validation',
        initialState: 'draft',
        states: {
          draft: {
            name: 'draft',
            transitions: [
              { event: 'SAVE_DRAFT', to: 'review' }
            ]
          },
          review: {
            name: 'review',
            transitions: [
              { event: 'SUBMIT', to: 'submitted' }
            ],
            validation: { validate: validateReview }
          },
          submitted: {
            name: 'submitted',
            type: 'final',
            validation: { validate: validateSubmitted }
          }
        }
      };

      const machine = new StateMachine(config);

      const result1 = await machine.executeTransition('draft', 'SAVE_DRAFT', { title: 'ab' });
      expect(result1.success).toBe(false);
      expect(result1.error?.message).toBe('Title must be at least 3 characters');

      const result2 = await machine.executeTransition('draft', 'SAVE_DRAFT', { title: 'Valid Title' });
      expect(result2.success).toBe(true);
      expect(result2.toState).toBe('review');

      const result3 = await machine.executeTransition('review', 'SUBMIT', { title: 'Valid Title', content: 'short' });
      expect(result3.success).toBe(false);
      expect(result3.error?.message).toBe('Content must be at least 10 characters');
    });

    it('should validate order fulfillment workflow', async () => {
      const validateShipping: ValidationFunction = async (ctx) => {
        // Simulate checking inventory availability
        await new Promise(resolve => setTimeout(resolve, 10));
        if (!ctx.shippingAddress) return 'Shipping address is required';
        if (!ctx.items || ctx.items.length === 0) return 'Order must have items';
        return true;
      };

      const config: StateMachineConfig = {
        id: 'order-fulfillment',
        initialState: 'pending',
        states: {
          pending: {
            name: 'pending',
            transitions: [
              { event: 'SHIP', to: 'shipped' }
            ]
          },
          shipped: {
            name: 'shipped',
            type: 'final',
            validation: { validate: validateShipping, errorMessage: 'Cannot ship order' }
          }
        }
      };

      const machine = new StateMachine(config);

      const result1 = await machine.executeTransition('pending', 'SHIP', { items: [] });
      expect(result1.success).toBe(false);
      expect(result1.error?.message).toBe('Shipping address is required');

      const result2 = await machine.executeTransition('pending', 'SHIP', {
        shippingAddress: '123 Main St',
        items: []
      });
      expect(result2.success).toBe(false);
      expect(result2.error?.message).toBe('Order must have items');

      const result3 = await machine.executeTransition('pending', 'SHIP', {
        shippingAddress: '123 Main St',
        items: [{ id: 1, name: 'Product' }]
      });
      expect(result3.success).toBe(true);
    });
  });
});
