/**
 * Compensation action for saga pattern
 */
export type CompensationAction = (context: Record<string, any>) => void | Promise<void>;

/**
 * Compensation record for rollback
 */
export interface CompensationRecord {
  /** State where compensation was recorded */
  state: string;
  /** Compensation action to execute */
  action: CompensationAction;
  /** When this compensation was recorded */
  timestamp: Date;
  /** Optional description */
  description?: string;
}

/**
 * Sub-flow reference
 */
export interface SubFlowReference {
  /** ID of the sub-flow */
  subFlowId: string;
  /** Flow definition ID of the sub-flow */
  flowDefinitionId: string;
  /** State where sub-flow was started */
  startedInState: string;
  /** Status of the sub-flow */
  status: 'active' | 'completed' | 'failed';
  /** When the sub-flow was started */
  startedAt: Date;
  /** When the sub-flow completed (if applicable) */
  completedAt?: Date;
  /** Result data from completed sub-flow */
  result?: any;
}

/**
 * Represents the state of a flow execution at a point in time
 * Enhanced with support for parallel states, compensation, and sub-flows
 */
export interface FlowState {
  /** Unique identifier for the flow instance */
  flowId: string;
  
  /** Flow definition ID */
  flowDefinitionId: string;
  
  /** Version of the flow definition */
  version?: string;
  
  /** Current state name (for simple flows) or array of active states (for parallel flows) */
  currentState: string | string[];
  
  /** Context data that travels through the flow */
  context: Record<string, any>;
  
  /** Timestamp when the flow was created */
  createdAt: Date;
  
  /** Timestamp when the flow was last updated */
  updatedAt: Date;
  
  /** History of state transitions */
  history: Array<{
    from: string | string[];
    to: string | string[];
    timestamp: Date;
    event?: string;
  }>;
  
  /** Current status of the flow */
  status: 'active' | 'completed' | 'failed' | 'paused' | 'compensating';
  
  /** Error information if flow failed */
  error?: {
    message: string;
    state: string | string[];
    timestamp: Date;
  };
  
  /** Compensation stack for saga pattern */
  compensations?: CompensationRecord[];
  
  /** Active sub-flows */
  subFlows?: SubFlowReference[];
  
  /** Parent flow ID if this is a sub-flow */
  parentFlowId?: string;
  
  /** Template parameters if created from a template */
  templateParams?: Record<string, any>;
}

/**
 * Interface for state storage implementations
 * This allows different storage backends (in-memory, Redis, database, etc.)
 */
export interface IStateStorage {
  /**
   * Save or update a flow state
   */
  save(state: FlowState): Promise<void>;

  /**
   * Retrieve a flow state by ID
   */
  get(flowId: string): Promise<FlowState | null>;

  /**
   * Delete a flow state
   */
  delete(flowId: string): Promise<void>;

  /**
   * List all flow states (optionally filtered)
   */
  list(filter?: Partial<Pick<FlowState, 'status' | 'flowDefinitionId' | 'version' | 'parentFlowId' | 'currentState'>>): Promise<FlowState[]>;

  /**
   * Check if a flow exists
   */
  exists(flowId: string): Promise<boolean>;
  
  /**
   * Query flows by context values (for advanced filtering)
   */
  queryByContext?(contextQuery: Record<string, any>): Promise<FlowState[]>;

  /**
   * Check if an idempotency key has been used
   */
  hasIdempotencyKey(key: string): Promise<boolean>;

  /**
   * Save an idempotency key with associated flow ID
   */
  saveIdempotencyKey(key: string, flowId: string): Promise<void>;

  /**
   * Get flow ID associated with an idempotency key
   */
  getFlowIdByIdempotencyKey(key: string): Promise<string | null>;
}

/**
 * In-memory implementation of state storage
 * Suitable for development, testing, or single-instance deployments
 */
export class InMemoryStateStorage implements IStateStorage {
  private states: Map<string, FlowState> = new Map();
  private idempotencyKeys: Map<string, string> = new Map(); // key -> flowId

  async save(state: FlowState): Promise<void> {
    this.states.set(state.flowId, { ...state });
  }

  async get(flowId: string): Promise<FlowState | null> {
    const state = this.states.get(flowId);
    return state ? { ...state } : null;
  }

  async delete(flowId: string): Promise<void> {
    this.states.delete(flowId);
  }

  async list(filter?: Partial<Pick<FlowState, 'status' | 'flowDefinitionId' | 'version' | 'parentFlowId' | 'currentState'>>): Promise<FlowState[]> {
    let states = Array.from(this.states.values());

    if (filter) {
      if (filter.status) {
        states = states.filter(s => s.status === filter.status);
      }
      if (filter.flowDefinitionId) {
        states = states.filter(s => s.flowDefinitionId === filter.flowDefinitionId);
      }
      if (filter.version) {
        states = states.filter(s => s.version === filter.version);
      }
      if (filter.parentFlowId !== undefined) {
        states = states.filter(s => s.parentFlowId === filter.parentFlowId);
      }
      if (filter.currentState !== undefined) {
        const targetState = filter.currentState;
        states = states.filter(s => {
          if (Array.isArray(s.currentState)) {
            return Array.isArray(targetState)
              ? targetState.every(t => s.currentState.includes(t))
              : s.currentState.includes(targetState);
          } else {
            return Array.isArray(targetState)
              ? targetState.includes(s.currentState)
              : s.currentState === targetState;
          }
        });
      }
    }

    return states.map(s => ({ ...s }));
  }

  async exists(flowId: string): Promise<boolean> {
    return this.states.has(flowId);
  }
  
  async queryByContext(contextQuery: Record<string, any>): Promise<FlowState[]> {
    const states = Array.from(this.states.values());
    
    return states.filter(state => {
      for (const [key, value] of Object.entries(contextQuery)) {
        if (state.context[key] !== value) {
          return false;
        }
      }
      return true;
    }).map(s => ({ ...s }));
  }

  async hasIdempotencyKey(key: string): Promise<boolean> {
    return this.idempotencyKeys.has(key);
  }

  async saveIdempotencyKey(key: string, flowId: string): Promise<void> {
    this.idempotencyKeys.set(key, flowId);
  }

  async getFlowIdByIdempotencyKey(key: string): Promise<string | null> {
    return this.idempotencyKeys.get(key) || null;
  }

  /**
   * Clear all stored states (useful for testing)
   */
  clear(): void {
    this.states.clear();
    this.idempotencyKeys.clear();
  }

  /**
   * Get the number of stored states
   */
  size(): number {
    return this.states.size;
  }
}
