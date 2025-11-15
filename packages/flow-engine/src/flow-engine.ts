import { StateMachine, StateMachineConfig, TransitionResult, ParallelState, isParallelState } from './state-machine.js';
import { FlowState, IStateStorage, InMemoryStateStorage, CompensationAction } from './storage.js';

/**
 * Generate a simple UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Options for starting a new flow
 */
export interface FlowStartOptions {
  /** Optional custom flow ID */
  flowId?: string;
  /** Initial context data */
  context?: Record<string, any>;
  /** Parent flow ID if this is a sub-flow */
  parentFlowId?: string;
  /** Template parameters if creating from template */
  templateParams?: Record<string, any>;
  /** Idempotency key to prevent duplicate flow creation */
  idempotencyKey?: string;
}

/**
 * Options for executing a flow event
 */
export interface FlowExecuteOptions {
  /** Event to trigger */
  event: string;
  /** Optional additional context data to merge */
  data?: Record<string, any>;
  /** Target specific parallel region (optional) */
  targetRegion?: string;
  /** Idempotency key to prevent duplicate execution */
  idempotencyKey?: string;
}

/**
 * Result of a flow execution
 */
export interface FlowExecutionResult {
  /** Whether the execution was successful */
  success: boolean;
  /** Current flow state after execution */
  state: FlowState;
  /** Transition result */
  transition: TransitionResult;
  /** Whether compensation was triggered */
  compensated?: boolean;
}

/**
 * Middleware context passed to middleware functions
 */
export interface MiddlewareContext {
  flowId: string;
  event: string;
  flowState: FlowState;
  options: FlowExecuteOptions;
  startTime: number;
}

/**
 * Next function in middleware chain
 */
export type MiddlewareNext = () => Promise<FlowExecutionResult>;

/**
 * Middleware function signature
 */
export type Middleware = (
  context: MiddlewareContext,
  next: MiddlewareNext
) => Promise<FlowExecutionResult>;

/**
 * Flow engine supporting parallel states, compensation, sub-flows, and hierarchical state machines
 */
export class FlowEngine {
  private stateMachine: StateMachine;
  private storage: IStateStorage;
  private config: StateMachineConfig;
  private middlewares: Middleware[] = [];

  constructor(
    config: StateMachineConfig,
    storage: IStateStorage = new InMemoryStateStorage()
  ) {
    this.config = config;
    this.stateMachine = new StateMachine(config);
    this.storage = storage;
  }

  /**
   * Add middleware to the execution chain
   */
  use(middleware: Middleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Clear all middleware
   */
  clearMiddleware(): void {
    this.middlewares = [];
  }

  /**
   * Start a new flow instance
   */
  async start(options: FlowStartOptions = {}): Promise<FlowState> {
    // Check idempotency key first
    if (options.idempotencyKey) {
      const existingFlowId = await this.storage.getFlowIdByIdempotencyKey(options.idempotencyKey);
      if (existingFlowId) {
        const existingFlow = await this.storage.get(existingFlowId);
        if (existingFlow) {
          return existingFlow;
        }
      }
    }

    const flowId = options.flowId || generateUUID();
    const initialState = this.stateMachine.getInitialState();
    const now = new Date();

    // Check if flow already exists
    if (await this.storage.exists(flowId)) {
      throw new Error(`Flow with ID "${flowId}" already exists`);
    }

    // Save idempotency key if provided
    if (options.idempotencyKey) {
      await this.storage.saveIdempotencyKey(options.idempotencyKey, flowId);
    }

    // Determine if initial state is parallel
    const state = this.stateMachine.getState(initialState);
    const isParallel = state && isParallelState(state);

    // For parallel states, initialize all regions
    let currentState: string | string[];
    if (isParallel) {
      const parallelState = state as ParallelState;
      currentState = parallelState.regions.map(r => r.initialState);
    } else {
      currentState = initialState;
    }

    // Create initial flow state
    const flowState: FlowState = {
      flowId,
      flowDefinitionId: this.config.id,
      version: this.config.version || '1.0.0',
      currentState,
      context: options.context || {},
      createdAt: now,
      updatedAt: now,
      history: [],
      status: 'active',
      compensations: [],
      subFlows: [],
      parentFlowId: options.parentFlowId,
      templateParams: options.templateParams
    };

    // Execute entry action of initial state(s)
    try {
      if (Array.isArray(currentState)) {
        // Parallel entry actions
        await Promise.all(
          currentState.map(async (stateName) => {
            const s = this.stateMachine.getState(stateName);
            if (s?.onEntry) {
              await s.onEntry(flowState.context);
            }
          })
        );
      } else {
        // Single entry action
        if (state?.onEntry) {
          await state.onEntry(flowState.context);
        }
      }
    } catch (error) {
      flowState.status = 'failed';
      flowState.error = {
        message: error instanceof Error ? error.message : String(error),
        state: currentState,
        timestamp: new Date()
      };
    }

    // Check if initial state is final
    if (this.isFlowComplete(flowState)) {
      flowState.status = 'completed';
    }

    await this.storage.save(flowState);
    return flowState;
  }

  /**
   * Execute an event on a flow instance
   */
  async execute(flowId: string, options: FlowExecuteOptions): Promise<FlowExecutionResult> {
    // Check idempotency key
    if (options.idempotencyKey) {
      const existingFlowId = await this.storage.getFlowIdByIdempotencyKey(options.idempotencyKey);
      if (existingFlowId) {
        // Key already used - return current flow state
        const flowState = await this.storage.get(flowId);
        if (flowState) {
          return {
            success: true,
            state: flowState,
            transition: {
              success: true,
              fromState: flowState.currentState,
              toState: flowState.currentState,
              event: options.event
            }
          };
        }
      } else {
        // Save idempotency key
        await this.storage.saveIdempotencyKey(options.idempotencyKey, flowId);
      }
    }

    // If middleware exists, run through middleware chain
    if (this.middlewares.length > 0) {
      return this.executeWithMiddleware(flowId, options);
    }

    // Otherwise execute directly
    return this.executeCore(flowId, options);
  }

  /**
   * Execute with middleware chain
   */
  private async executeWithMiddleware(flowId: string, options: FlowExecuteOptions): Promise<FlowExecutionResult> {
    const flowState = await this.storage.get(flowId);
    if (!flowState) {
      throw new Error(`Flow with ID "${flowId}" not found`);
    }

    const context: MiddlewareContext = {
      flowId,
      event: options.event,
      flowState,
      options,
      startTime: Date.now()
    };

    // Build middleware chain
    let index = 0;
    const dispatch = async (): Promise<FlowExecutionResult> => {
      if (index >= this.middlewares.length) {
        // End of chain, execute core logic
        return this.executeCore(flowId, options);
      }

      const middleware = this.middlewares[index++];
      return middleware(context, dispatch);
    };

    return dispatch();
  }

  /**
   * Core execution logic (without middleware)
   */
  private async executeCore(flowId: string, options: FlowExecuteOptions): Promise<FlowExecutionResult> {
    // Get current flow state
    const flowState = await this.storage.get(flowId);
    if (!flowState) {
      throw new Error(`Flow with ID "${flowId}" not found`);
    }

    if (flowState.status !== 'active') {
      throw new Error(`Flow is not active. Current status: ${flowState.status}`);
    }

    // Merge any additional data into context
    if (options.data) {
      Object.assign(flowState.context, options.data);
    }

    let transition: TransitionResult;
    let compensated = false;

    try {
      // Handle parallel or simple state transitions
      if (Array.isArray(flowState.currentState)) {
        transition = await this.executeParallelTransition(flowState, options);
      } else {
        transition = await this.stateMachine.executeTransition(
          flowState.currentState,
          options.event,
          flowState.context
        );
      }

      // Update flow state
      const now = new Date();
      flowState.updatedAt = now;

      if (transition.success) {
        // Add to history
        flowState.history.push({
          from: transition.fromState,
          to: transition.toState,
          timestamp: now,
          event: options.event
        });

        // Update current state
        flowState.currentState = transition.toState;

        // Check if reached final state
        if (this.isFlowComplete(flowState)) {
          flowState.status = 'completed';
        }
      } else {
        throw new Error(transition.error?.message || 'Transition failed');
      }
    } catch (error) {
      // Trigger compensation on failure
      compensated = await this.compensate(flowState, error instanceof Error ? error.message : String(error));
      
      transition = {
        success: false,
        fromState: flowState.currentState,
        toState: flowState.currentState,
        event: options.event,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }

    await this.storage.save(flowState);

    return {
      success: transition.success,
      state: flowState,
      transition,
      compensated
    };
  }

  /**
   * Execute transition in parallel state
   */
  private async executeParallelTransition(
    flowState: FlowState,
    options: FlowExecuteOptions
  ): Promise<TransitionResult> {
    if (!Array.isArray(flowState.currentState)) {
      throw new Error('Expected parallel state');
    }

    // If target region specified, only transition that region
    if (options.targetRegion !== undefined) {
      const regionIndex = parseInt(options.targetRegion, 10);
      if (isNaN(regionIndex) || regionIndex < 0 || regionIndex >= flowState.currentState.length) {
        throw new Error(`Invalid region index: ${options.targetRegion}`);
      }

      const result = await this.stateMachine.executeTransition(
        flowState.currentState[regionIndex],
        options.event,
        flowState.context
      );

      if (result.success) {
        // Update only this region
        const newStates = [...flowState.currentState];
        if (Array.isArray(result.toState)) {
          throw new Error('Nested parallel states not yet supported');
        }
        newStates[regionIndex] = result.toState;
        result.fromState = flowState.currentState;
        result.toState = newStates;
      }

      return result;
    }

    // Try to transition all regions that accept this event
    const transitions = await Promise.all(
      flowState.currentState.map((state) =>
        this.stateMachine.executeTransition(state, options.event, flowState.context)
          .catch(() => null)
      )
    );

    // Check if at least one transition succeeded
    const successfulTransitions = transitions.filter(t => t?.success);
    if (successfulTransitions.length === 0) {
      return {
        success: false,
        fromState: flowState.currentState,
        toState: flowState.currentState,
        event: options.event,
        error: new Error('No region accepted the event')
      };
    }

    // Update states for successful transitions
    const newStates: string[] = flowState.currentState.map((state, i) => {
      const trans = transitions[i];
      if (trans?.success) {
        // Ensure we're not dealing with nested parallel states
        if (Array.isArray(trans.toState)) {
          throw new Error('Nested parallel states not yet supported');
        }
        return trans.toState;
      }
      return state;
    });

    return {
      success: true,
      fromState: flowState.currentState,
      toState: newStates,
      event: options.event
    };
  }

  /**
   * Check if all parallel regions or main state are in final states
   */
  private isFlowComplete(flowState: FlowState): boolean {
    if (Array.isArray(flowState.currentState)) {
      // All parallel regions must be complete
      return flowState.currentState.every(state =>
        this.stateMachine.isFinalState(state)
      );
    } else {
      return this.stateMachine.isFinalState(flowState.currentState);
    }
  }

  /**
   * Record a compensation action for saga pattern
   */
  async recordCompensation(
    flowId: string,
    action: CompensationAction,
    description?: string
  ): Promise<void> {
    const flowState = await this.storage.get(flowId);
    if (!flowState) {
      throw new Error(`Flow with ID "${flowId}" not found`);
    }

    if (!flowState.compensations) {
      flowState.compensations = [];
    }

    flowState.compensations.push({
      state: Array.isArray(flowState.currentState)
        ? flowState.currentState.join(',')
        : flowState.currentState,
      action,
      timestamp: new Date(),
      description
    });

    await this.storage.save(flowState);
  }

  /**
   * Execute compensation actions (rollback)
   */
  private async compensate(flowState: FlowState, errorMessage: string): Promise<boolean> {
    if (!flowState.compensations || flowState.compensations.length === 0) {
      // No compensations to execute, just mark as failed
      flowState.status = 'failed';
      flowState.error = {
        message: errorMessage,
        state: flowState.currentState,
        timestamp: new Date()
      };
      return false;
    }

    flowState.status = 'compensating';
    await this.storage.save(flowState);

    try {
      // Execute compensations in reverse order (LIFO)
      const compensations = [...flowState.compensations].reverse();
      
      for (const comp of compensations) {
        try {
          await comp.action(flowState.context);
        } catch (compError) {
          // Log compensation error but continue
          console.error(`Compensation failed for state ${comp.state}:`, compError);
        }
      }

      // Mark as failed with compensation completed
      flowState.status = 'failed';
      flowState.error = {
        message: `${errorMessage} (compensated)`,
        state: flowState.currentState,
        timestamp: new Date()
      };
      
      return true;
    } catch (error) {
      flowState.status = 'failed';
      flowState.error = {
        message: `Compensation failed: ${error instanceof Error ? error.message : String(error)}`,
        state: flowState.currentState,
        timestamp: new Date()
      };
      return false;
    }
  }

  /**
   * Start a sub-flow
   */
  async startSubFlow(
    parentFlowId: string,
    subFlowConfig: StateMachineConfig,
    options: FlowStartOptions = {}
  ): Promise<FlowState> {
    const parentFlow = await this.storage.get(parentFlowId);
    if (!parentFlow) {
      throw new Error(`Parent flow with ID "${parentFlowId}" not found`);
    }

    // Create sub-flow engine
    const subEngine = new FlowEngine(subFlowConfig, this.storage);
    
    // Start sub-flow
    const subFlow = await subEngine.start({
      ...options,
      parentFlowId,
      context: options.context || parentFlow.context
    });

    // Record sub-flow reference in parent
    if (!parentFlow.subFlows) {
      parentFlow.subFlows = [];
    }

    parentFlow.subFlows.push({
      subFlowId: subFlow.flowId,
      flowDefinitionId: subFlowConfig.id,
      startedInState: Array.isArray(parentFlow.currentState)
        ? parentFlow.currentState.join(',')
        : parentFlow.currentState,
      status: 'active',
      startedAt: new Date()
    });

    await this.storage.save(parentFlow);

    return subFlow;
  }

  /**
   * Wait for a sub-flow to complete
   */
  async waitForSubFlow(parentFlowId: string, subFlowId: string, timeoutMs?: number): Promise<FlowState> {
    const startTime = Date.now();
    
    while (true) {
      const subFlow = await this.storage.get(subFlowId);
      if (!subFlow) {
        throw new Error(`Sub-flow with ID "${subFlowId}" not found`);
      }

      if (subFlow.status === 'completed' || subFlow.status === 'failed') {
        // Update parent flow's sub-flow reference
        const parentFlow = await this.storage.get(parentFlowId);
        if (parentFlow && parentFlow.subFlows) {
          const subFlowRef = parentFlow.subFlows.find(sf => sf.subFlowId === subFlowId);
          if (subFlowRef) {
            subFlowRef.status = subFlow.status === 'completed' ? 'completed' : 'failed';
            subFlowRef.completedAt = new Date();
            if (subFlow.status === 'completed') {
              subFlowRef.result = subFlow.context;
            }
            await this.storage.save(parentFlow);
          }
        }

        return subFlow;
      }

      if (timeoutMs && (Date.now() - startTime) > timeoutMs) {
        throw new Error(`Timeout waiting for sub-flow ${subFlowId}`);
      }

      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Get a flow state by ID
   */
  async getFlow(flowId: string): Promise<FlowState | null> {
    return this.storage.get(flowId);
  }

  /**
   * Pause a flow
   */
  async pause(flowId: string): Promise<FlowState> {
    const flowState = await this.storage.get(flowId);
    if (!flowState) {
      throw new Error(`Flow with ID "${flowId}" not found`);
    }

    if (flowState.status !== 'active') {
      throw new Error(`Cannot pause flow. Current status: ${flowState.status}`);
    }

    flowState.status = 'paused';
    flowState.updatedAt = new Date();
    await this.storage.save(flowState);

    return flowState;
  }

  /**
   * Resume a paused flow
   */
  async resume(flowId: string): Promise<FlowState> {
    const flowState = await this.storage.get(flowId);
    if (!flowState) {
      throw new Error(`Flow with ID "${flowId}" not found`);
    }

    if (flowState.status !== 'paused') {
      throw new Error(`Cannot resume flow. Current status: ${flowState.status}`);
    }

    flowState.status = 'active';
    flowState.updatedAt = new Date();
    await this.storage.save(flowState);

    return flowState;
  }

  /**
   * Cancel/abort a flow
   */
  async cancel(flowId: string, triggerCompensation: boolean = false): Promise<FlowState> {
    const flowState = await this.storage.get(flowId);
    if (!flowState) {
      throw new Error(`Flow with ID "${flowId}" not found`);
    }

    if (flowState.status === 'completed') {
      throw new Error('Cannot cancel completed flow');
    }

    if (triggerCompensation) {
      await this.compensate(flowState, 'Flow cancelled by user');
    } else {
      flowState.status = 'failed';
      flowState.error = {
        message: 'Flow cancelled by user',
        state: flowState.currentState,
        timestamp: new Date()
      };
    }

    flowState.updatedAt = new Date();
    await this.storage.save(flowState);

    return flowState;
  }

  /**
   * Delete a flow
   */
  async delete(flowId: string): Promise<void> {
    // Also delete any sub-flows
    const flow = await this.storage.get(flowId);
    if (flow?.subFlows) {
      for (const subFlow of flow.subFlows) {
        await this.delete(subFlow.subFlowId).catch(() => {
          // Ignore errors if sub-flow already deleted
        });
      }
    }

    await this.storage.delete(flowId);
  }

  /**
   * List all flows (optionally filtered)
   */
  async listFlows(filter?: Partial<Pick<FlowState, 'status' | 'flowDefinitionId' | 'version' | 'parentFlowId' | 'currentState'>>): Promise<FlowState[]> {
    return this.storage.list(filter);
  }

  /**
   * Get possible transitions from current state
   */
  async getPossibleTransitions(flowId: string): Promise<string[]> {
    const flowState = await this.storage.get(flowId);
    if (!flowState) {
      throw new Error(`Flow with ID "${flowId}" not found`);
    }

    if (Array.isArray(flowState.currentState)) {
      // For parallel states, return unique events from all regions
      const allEvents = new Set<string>();
      for (const state of flowState.currentState) {
        const transitions = this.stateMachine.getTransitions(state);
        transitions.forEach(t => allEvents.add(t.event));
      }
      return Array.from(allEvents);
    } else {
      const transitions = this.stateMachine.getTransitions(flowState.currentState);
      return transitions.map(t => t.event);
    }
  }

  /**
   * Get the state machine configuration
   */
  getConfig(): StateMachineConfig {
    return this.config;
  }

  /**
   * Get the state machine instance
   */
  getStateMachine(): StateMachine {
    return this.stateMachine;
  }

  /**
   * Get the machine ID
   */
  getMachineId(): string {
    return this.stateMachine.getId();
  }

  /**
   * Get the storage instance
   */
  getStorage(): IStateStorage {
    return this.storage;
  }
}
