import { parse } from 'yaml';
import { StateMachineConfig, State, Transition } from './state-machine.js';

/**
 * YAML DSL schema for defining flows
 * 
 * Minimal syntax example:
 * ```yaml
 * id: order-flow
 * initial: pending
 * states:
 *   pending:
 *     on:
 *       approve: approved
 *       reject: rejected
 *   approved:
 *     final: true
 *   rejected:
 *     final: true
 * ```
 */

/**
 * YAML transition definition
 */
interface YamlTransition {
  /** Target state (simple string) or object with guard/action */
  to?: string;
  /** Guard condition expression */
  guard?: string;
  /** Action expression */
  action?: string;
}

/**
 * YAML state definition
 */
interface YamlState {
  /** Transitions map: event -> target or config */
  on?: Record<string, string | YamlTransition>;
  /** Entry action */
  entry?: string;
  /** Exit action */
  exit?: string;
  /** Whether this is a final state */
  final?: boolean;
}

/**
 * YAML flow definition
 */
interface YamlFlowDefinition {
  /** Flow ID */
  id: string;
  /** Initial state name */
  initial: string;
  /** States definition */
  states: Record<string, YamlState>;
}

/**
 * Context for evaluating action and guard expressions
 */
export interface ExpressionContext {
  /** Custom functions that can be used in expressions */
  functions?: Record<string, (...args: any[]) => any>;
}

/**
 * Parse and build a state machine from YAML definition
 */
export class YamlFlowParser {
  private context: ExpressionContext;

  constructor(context: ExpressionContext = {}) {
    this.context = context;
  }

  /**
   * Parse YAML string into StateMachineConfig
   */
  parse(yamlContent: string): StateMachineConfig {
    const definition = parse(yamlContent) as YamlFlowDefinition;
    return this.buildConfig(definition);
  }

  /**
   * Build StateMachineConfig from parsed YAML
   */
  private buildConfig(definition: YamlFlowDefinition): StateMachineConfig {
    if (!definition.id) {
      throw new Error('Flow definition must have an "id" field');
    }

    if (!definition.initial) {
      throw new Error('Flow definition must have an "initial" state');
    }

    if (!definition.states) {
      throw new Error('Flow definition must have a "states" field');
    }

    // Check that initial state exists
    if (!definition.states[definition.initial]) {
      throw new Error(`Initial state "${definition.initial}" not found in states`);
    }

    const states: Record<string, State> = {};

    // Convert each YAML state to State
    for (const [stateName, yamlState] of Object.entries(definition.states)) {
      const state = this.buildState(stateName, yamlState);
      states[stateName] = state;
    }

    return {
      id: definition.id,
      initialState: definition.initial,
      states
    };
  }

  /**
   * Build a State from YAML state definition
   */
  private buildState(name: string, yamlState: YamlState): State {
    const transitions: Transition[] = [];

    // Parse transitions
    if (yamlState.on) {
      for (const [event, transitionDef] of Object.entries(yamlState.on)) {
        const transition = this.buildTransition(event, transitionDef);
        transitions.push(transition);
      }
    }

    const state: State = {
      name,
      transitions,
      isFinal: yamlState.final === true
    };

    // Parse entry action
    if (yamlState.entry) {
      state.onEntry = this.buildAction(yamlState.entry);
    }

    // Parse exit action
    if (yamlState.exit) {
      state.onExit = this.buildAction(yamlState.exit);
    }

    return state;
  }

  /**
   * Build a Transition from YAML transition definition
   */
  private buildTransition(event: string, def: string | YamlTransition): Transition {
    // Simple string: just target state
    if (typeof def === 'string') {
      return {
        event,
        to: def
      };
    }

    // Object with target and optional guard/action
    if (!def.to) {
      throw new Error(`Transition for event "${event}" must have a "to" field`);
    }

    const transition: Transition = {
      event,
      to: def.to
    };

    if (def.guard) {
      transition.guard = this.buildGuard(def.guard);
    }

    if (def.action) {
      transition.action = this.buildAction(def.action);
    }

    return transition;
  }

  /**
   * Build a guard function from expression string
   * Supports basic JavaScript expressions and custom functions
   */
  private buildGuard(expression: string): (context: Record<string, any>) => boolean {
    return (context: Record<string, any>) => {
      try {
        // Create a safe evaluation context
        const evalContext = {
          ...context,
          ...this.context.functions
        };

        // Use Function constructor for safe evaluation
        // This allows access to context variables and custom functions
        const func = new Function(
          ...Object.keys(evalContext),
          `return ${expression};`
        );

        const result = func(...Object.values(evalContext));
        return Boolean(result);
      } catch (error) {
        console.error(`Guard evaluation failed: ${expression}`, error);
        return false;
      }
    };
  }

  /**
   * Build an action function from expression string
   * Supports basic JavaScript statements and custom functions
   */
  private buildAction(expression: string): (context: Record<string, any>) => void {
    return (context: Record<string, any>) => {
      try {
        // Create a safe evaluation context
        const evalContext = {
          context,
          ...this.context.functions
        };

        // Use Function constructor for safe evaluation
        const func = new Function(
          ...Object.keys(evalContext),
          expression
        );

        func(...Object.values(evalContext));
      } catch (error) {
        console.error(`Action execution failed: ${expression}`, error);
        throw error;
      }
    };
  }

  /**
   * Parse YAML file from string and create a flow engine config
   */
  static fromYaml(yamlContent: string, context?: ExpressionContext): StateMachineConfig {
    const parser = new YamlFlowParser(context);
    return parser.parse(yamlContent);
  }
}
