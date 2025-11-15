import { FlowEngine, YamlFlowParser, InMemoryStateStorage } from '@tsflow/flow-engine';

// Example 1: Programmatic flow definition
async function programmaticExample() {
  console.log('\n=== Programmatic Flow Example ===\n');

  const engine = new FlowEngine({
    id: 'simple-flow',
    initialState: 'start',
    states: {
      start: {
        name: 'start',
        transitions: [
          {
            event: 'next',
            to: 'processing',
            action: (ctx) => {
              ctx.startTime = new Date().toISOString();
              console.log('→ Starting process...');
            }
          }
        ]
      },
      processing: {
        name: 'processing',
        transitions: [
          {
            event: 'complete',
            to: 'done',
            action: (ctx) => {
              ctx.completedTime = new Date().toISOString();
              console.log('→ Process completed!');
            }
          }
        ]
      },
      done: {
        name: 'done',
        transitions: [],
        isFinal: true
      }
    }
  }, new InMemoryStateStorage());

  // Start a flow
  const flow = await engine.start({ context: { taskId: '001' } });
  console.log(`Flow started: ${flow.flowId}`);
  console.log(`Current state: ${flow.currentState}\n`);

  // Execute transitions
  await engine.execute(flow.flowId, { event: 'next' });
  console.log('Transitioned to: processing\n');

  await engine.execute(flow.flowId, { event: 'complete' });
  console.log('Transitioned to: done\n');

  // Get final state
  const finalFlow = await engine.getFlow(flow.flowId);
  console.log('Final flow state:', {
    flowId: finalFlow?.flowId,
    currentState: finalFlow?.currentState,
    status: finalFlow?.status,
    context: finalFlow?.context,
    historyLength: finalFlow?.history.length
  });
}

// Example 2: YAML-based flow
async function yamlExample() {
  console.log('\n=== YAML Flow Example ===\n');

  const yamlFlow = `
id: order-processing
initial: pending

states:
  pending:
    entry: "context.receivedAt = new Date().toISOString()"
    on:
      approve:
        to: approved
        guard: "amount < 1000"
        action: "context.approvedBy = 'auto'"
      review:
        to: under-review
        guard: "amount >= 1000"

  under-review:
    on:
      approve:
        to: approved
        action: "context.approvedBy = 'manager'"
      reject:
        to: rejected
        action: "context.rejectedBy = 'manager'"

  approved:
    entry: "context.approvedAt = new Date().toISOString()"
    on:
      fulfill: completed

  rejected:
    entry: "context.rejectedAt = new Date().toISOString()"
    final: true

  completed:
    entry: "context.completedAt = new Date().toISOString()"
    final: true
`;

  const config = YamlFlowParser.fromYaml(yamlFlow);
  const engine = new FlowEngine(config, new InMemoryStateStorage());

  // Process a small order (auto-approved)
  console.log('Processing small order ($500)...');
  const order1 = await engine.start({
    context: { orderId: 'ORD-001', amount: 500 }
  });
  
  const result1 = await engine.execute(order1.flowId, { event: 'approve' });
  console.log(`→ Order ${result1.state.context.orderId} auto-approved`);
  console.log(`  Status: ${result1.state.status}`);
  console.log(`  State: ${result1.state.currentState}\n`);

  // Process a large order (needs review)
  console.log('Processing large order ($2000)...');
  const order2 = await engine.start({
    context: { orderId: 'ORD-002', amount: 2000 }
  });

  const result2 = await engine.execute(order2.flowId, { event: 'review' });
  console.log(`→ Order ${result2.state.context.orderId} sent for review`);
  console.log(`  State: ${result2.state.currentState}`);

  // Manager approves
  const result3 = await engine.execute(order2.flowId, { event: 'approve' });
  console.log(`→ Manager approved order ${result3.state.context.orderId}`);
  console.log(`  Approved by: ${result3.state.context.approvedBy}`);
  console.log(`  State: ${result3.state.currentState}\n`);

  // List all flows
  const allFlows = await engine.listFlows();
  console.log(`Total flows: ${allFlows.length}`);
  console.log('Flow statuses:', allFlows.map(f => ({
    id: f.context.orderId,
    state: f.currentState,
    status: f.status
  })));
}

// Example 3: Conditional flow with guards
async function conditionalExample() {
  console.log('\n=== Conditional Flow Example ===\n');

  const engine = new FlowEngine({
    id: 'user-access',
    initialState: 'checking',
    states: {
      checking: {
        name: 'checking',
        transitions: [
          {
            event: 'check',
            to: 'granted',
            guard: (ctx) => ctx.role === 'admin' || ctx.role === 'user',
            action: (ctx) => console.log(`✓ Access granted for ${ctx.username}`)
          },
          {
            event: 'check',
            to: 'denied',
            guard: (ctx) => ctx.role !== 'admin' && ctx.role !== 'user',
            action: (ctx) => console.log(`✗ Access denied for ${ctx.username}`)
          }
        ]
      },
      granted: {
        name: 'granted',
        transitions: [],
        isFinal: true
      },
      denied: {
        name: 'denied',
        transitions: [],
        isFinal: true
      }
    }
  }, new InMemoryStateStorage());

  // Test different users
  const users = [
    { username: 'alice', role: 'admin' },
    { username: 'bob', role: 'user' },
    { username: 'charlie', role: 'guest' }
  ];

  for (const user of users) {
    const flow = await engine.start({ context: user });
    const result = await engine.execute(flow.flowId, { event: 'check' });
    console.log(`  ${user.username} (${user.role}): ${result.state.currentState}\n`);
  }
}

// Run all examples
async function main() {
  try {
    await programmaticExample();
    await yamlExample();
    await conditionalExample();

    console.log('\n✓ All examples completed successfully!\n');
  } catch (error) {
    console.error('Error running examples:', error);
    process.exit(1);
  }
}

main();
