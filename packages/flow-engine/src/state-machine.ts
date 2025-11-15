/**
 * Parallel state configuration
 * Allows multiple child states to be active simultaneously
 */
export interface ParallelState {
  /** Unique name of the parallel state */
  name: string;
  /** Type identifier for parallel states */
  type: 'parallel';
  /** Child states that run in parallel */
  regions: ParallelRegion[];
  /** Action to execute when entering this parallel state */
  onEntry?: TransitionAction;
  /** Action to execute when exiting this parallel state */
  onExit?: TransitionAction;
  /** Transitions that apply when all regions reach final states */
  transitions?: Transition[];
}

/**
 * A region within a parallel state
 */
export interface ParallelRegion {
  /** Unique name of this region */
  name: string;
  /** Initial state for this region */
  initialState: string;
  /** State names within this region */
  states: string[];
}

/**
 * Compound/hierarchical state configuration
 * A state that contains a nested state machine
 */
export interface CompoundState {
  /** Unique name of the compound state */
  name: string;
  /** Type identifier for compound states */
  type: 'compound';
  /** Initial state of the nested machine */
  initialState: string;
  /** Child state names */
  states: string[];
  /** Action to execute when entering this compound state */
  onEntry?: TransitionAction;
  /** Action to execute when exiting this compound state */
  onExit?: TransitionAction;
  /** Whether this is a final state */
  isFinal?: boolean;
}

/**
 * Extended state type that can be simple, parallel, or compound
 */
export type StateNode = State | ParallelState | CompoundState;

/**
 * Represents a transition guard/condition
 */
export type TransitionGuard = (context: Record<string, any>) => boolean | Promise<boolean>;

/**
 * Represents an action to execute during a transition
 */
export type TransitionAction = (context: Record<string, any>) => void | Promise<void>;

/**
 * Validation function for context data
 */
export type ValidationFunction = (context: Record<string, any>) => boolean | string | Promise<boolean | string>;

/**
 * Validation configuration for a state
 */
export interface ValidationConfig {
  /** Validation function - return true for valid, false or error message for invalid */
  validate: ValidationFunction;
  /** Custom error message if validation fails */
  errorMessage?: string;
}

/**
 * Backoff strategy for retry logic
 */
export type BackoffStrategy = 'linear' | 'exponential';

/**
 * Retry configuration for transitions
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 0 - no retry) */
  maxAttempts?: number;
  /** Backoff strategy (default: 'linear') */
  backoff?: BackoffStrategy;
  /** Base delay in milliseconds between retries (default: 1000ms) */
  delayMs?: number;
}

/**
 * Represents a state transition
 */
export interface Transition {
  /** Source state (only used in global transitions array) */
  from?: string;
  /** Event that triggers this transition */
  event: string;
  /** Target state to transition to */
  to: string;
  /** Optional guard condition that must be true for transition to occur */
  guard?: TransitionGuard;
  /** Optional action to execute during transition */
  action?: TransitionAction;
  /** Optional retry configuration for handling transient failures */
  retry?: RetryConfig;
}

/**
 * Represents a simple atomic state
 */
export interface State {
  /** Unique name of the state */
  name: string;
  /** Type identifier for simple states */
  type?: 'atomic' | 'final';
  /** Possible transitions from this state (can be empty for leaf states in parallel/compound) */
  transitions?: Transition[];
  /** Action to execute when entering this state */
  onEntry?: TransitionAction;
  /** Action to execute when exiting this state */
  onExit?: TransitionAction;
  /** Whether this is a final/terminal state */
  isFinal?: boolean;
  /** Optional validation configuration for context when entering this state */
  validation?: ValidationConfig;
}

/**
 * Configuration for the state machine
 */
export interface StateMachineConfig {
  /** Unique identifier for this state machine definition */
  id: string;
  /** Version of this flow definition */
  version?: string;
  /** Initial state name */
  initialState: string;
  /** All states in the machine (keyed by state name) */
  states: Record<string, StateNode>;
  /** All transitions between states */
  transitions?: Transition[];
  /** Global error handler */
  onError?: (error: Error, context: Record<string, any>) => void | Promise<void>;
}

/**
 * Result of a transition attempt
 */
export interface TransitionResult {
  /** Whether the transition was successful */
  success: boolean;
  /** The state(s) before transition */
  fromState: string | string[];
  /** The state(s) after transition (if successful) */
  toState: string | string[];
  /** Event that triggered the transition */
  event: string;
  /** Error if transition failed */
  error?: Error;
}

/**
 * Helper to check if a state is a parallel state
 */
export function isParallelState(state: StateNode): state is ParallelState {
  return 'type' in state && state.type === 'parallel';
}

/**
 * Helper to check if a state is a compound state
 */
export function isCompoundState(state: StateNode): state is CompoundState {
  return 'type' in state && state.type === 'compound';
}

/**
 * Helper to check if a state is an atomic state
 */
export function isAtomicState(state: StateNode): state is State {
  return !('type' in state) || state.type === 'atomic';
}

/**
 * Core state machine implementation with support for:
 * - Atomic states (simple states)
 * - Parallel states (multiple active states)
 * - Compound states (hierarchical nested machines)
 */
export class StateMachine {
  private config: StateMachineConfig;
  private stateMap: Map<string, StateNode>;

  constructor(config: StateMachineConfig) {
    this.config = config;
    this.stateMap = new Map();

    // Build state lookup map (flattened)
    this.buildStateMap(config.states);

    // Validate configuration
    this.validate();
  }

  private buildStateMap(states: Record<string, StateNode>): void {
    for (const [name, state] of Object.entries(states)) {
      this.stateMap.set(name, state);
    }
  }

  private validate(): void {
    // Check that initial state exists
    if (!this.stateMap.has(this.config.initialState)) {
      throw new Error(`Initial state "${this.config.initialState}" not found in states`);
    }

    // Validate transitions
    if (this.config.transitions) {
      for (const transition of this.config.transitions) {
        if (!this.stateMap.has(transition.to)) {
          throw new Error(`Transition target "${transition.to}" does not exist`);
        }
      }
    }

    // Validate parallel and compound states reference valid states
    for (const [name, state] of Object.entries(this.config.states)) {
      if (isCompoundState(state)) {
        if (!this.stateMap.has(state.initialState)) {
          throw new Error(`Initial state "${state.initialState}" not found in compound state "${name}"`);
        }
        for (const childStateName of state.states) {
          if (!this.stateMap.has(childStateName)) {
            throw new Error(`Child state "${childStateName}" not found in compound state "${name}"`);
          }
        }
      } else if (isParallelState(state)) {
        for (const region of state.regions) {
          if (!this.stateMap.has(region.initialState)) {
            throw new Error(
              `Initial state "${region.initialState}" not found in parallel region "${region.name}"`
            );
          }
          for (const childStateName of region.states) {
            if (!this.stateMap.has(childStateName)) {
              throw new Error(`State "${childStateName}" not found in parallel region "${region.name}"`);
            }
          }
        }
      } else if (isAtomicState(state)) {
        if (state.transitions) {
          for (const transition of state.transitions) {
            if (!this.stateMap.has(transition.to)) {
              throw new Error(`Transition target "${transition.to}" from state "${name}" does not exist`);
            }
          }
        }
      }
    }
  }

  /**
   * Get the initial state
   */
  getInitialState(): string {
    return this.config.initialState;
  }

  /**
   * Get a state by name
   */
  getState(name: string): StateNode | undefined {
    return this.stateMap.get(name);
  }

  /**
   * Get all possible transitions from a state
   */
  getTransitions(stateName: string): Transition[] {
    const transitions: Transition[] = [];
    const state = this.stateMap.get(stateName);
    
    if (!state) return transitions;
    
    // Get state-level transitions
    if (isAtomicState(state) && state.transitions) {
      transitions.push(...state.transitions);
    } else if (isParallelState(state) && state.transitions) {
      transitions.push(...state.transitions);
    }
    
    // Get global transitions that start from this state
    if (this.config.transitions) {
      const globalTransitions = this.config.transitions.filter(t => {
        // Check if transition applies to this state
        // For now, we look in the stateMap for matching names
        return stateName === t.from || stateName.endsWith(`.${t.from}`);
      });
      transitions.push(...globalTransitions);
    }
    
    return transitions;
  }

  /**
   * Find a valid transition for the given state and event
   */
  async findTransition(
    currentState: string,
    event: string,
    context: Record<string, any>
  ): Promise<Transition | null> {
    const state = this.stateMap.get(currentState);
    if (!state) {
      return null;
    }

    const transitions = this.getTransitions(currentState);

    // Find matching transition by event
    for (const transition of transitions) {
      if (transition.event === event) {
        // Check guard condition if present
        if (transition.guard) {
          try {
            const allowed = await transition.guard(context);
            if (allowed) {
              return transition;
            }
          } catch (error) {
            // Guard evaluation failed, try next transition
            continue;
          }
        } else {
          return transition;
        }
      }
    }

    return null;
  }

  /**
   * Execute a transition
   */
  async executeTransition(
    currentState: string,
    event: string,
    context: Record<string, any>
  ): Promise<TransitionResult> {
    const state = this.stateMap.get(currentState);
    if (!state) {
      return {
        success: false,
        fromState: currentState,
        toState: currentState,
        event,
        error: new Error(`State "${currentState}" not found`)
      };
    }

    // Find valid transition
    const transition = await this.findTransition(currentState, event, context);
    if (!transition) {
      return {
        success: false,
        fromState: currentState,
        toState: currentState,
        event,
        error: new Error(`No valid transition for event "${event}" from state "${currentState}"`)
      };
    }

    // Retry logic wrapper
    const retryConfig = transition.retry || {};
    const maxAttempts = retryConfig.maxAttempts || 0;
    const backoff = retryConfig.backoff || 'linear';
    const delayMs = retryConfig.delayMs || 1000;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
      try {
        // Execute exit action of current state
        if ('onExit' in state && state.onExit) {
          await state.onExit(context);
        }

        // Execute transition action
        if (transition.action) {
          await transition.action(context);
        }

        // Get target state
        const targetState = this.stateMap.get(transition.to);
        if (!targetState) {
          throw new Error(`Target state "${transition.to}" not found`);
        }

        // Validate context before entering target state
        if ('validation' in targetState && targetState.validation) {
          const validationResult = await targetState.validation.validate(context);
          if (validationResult !== true) {
            const errorMessage = typeof validationResult === 'string'
              ? validationResult
              : (targetState.validation.errorMessage || `Validation failed for state "${transition.to}"`);
            throw new Error(errorMessage);
          }
        }

        // Execute entry action of target state
        if ('onEntry' in targetState && targetState.onEntry) {
          await targetState.onEntry(context);
        }

        return {
          success: true,
          fromState: currentState,
          toState: transition.to,
          event
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // If this is not the last attempt, apply backoff delay
        if (attempt < maxAttempts) {
          const delay = backoff === 'exponential' 
            ? delayMs * Math.pow(2, attempt)
            : delayMs * (attempt + 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries exhausted, handle error
    const err = lastError || new Error('Unknown error during transition');
    
    // Call error handler if present
    if (this.config.onError) {
      try {
        await this.config.onError(err, context);
      } catch (handlerError) {
        // Error handler itself failed
      }
    }

    return {
      success: false,
      fromState: currentState,
      toState: currentState,
      event,
      error: err
    };
  }

  /**
   * Check if a state is a final state
   */
  isFinalState(stateName: string): boolean {
    const state = this.stateMap.get(stateName);
    if (!state) return false;
    
    // Check type property first (for 'final' type)
    if ('type' in state && state.type === 'final') {
      return true;
    }
    
    // Check isFinal property (for explicit marking)
    if (isAtomicState(state) || isCompoundState(state)) {
      return state.isFinal === true;
    }
    
    return false;
  }

  /**
   * Get all state names (flattened)
   */
  getAllStates(): string[] {
    return Array.from(this.stateMap.keys());
  }

  /**
   * Get the state machine configuration ID
   */
  getId(): string {
    return this.config.id;
  }

  /**
   * Get the version of this state machine
   */
  getVersion(): string {
    return this.config.version || '1.0.0';
  }
}
