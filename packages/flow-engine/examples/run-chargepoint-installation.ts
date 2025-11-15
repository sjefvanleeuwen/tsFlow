import { FlowEngine, YamlFlowParser, InMemoryStateStorage } from '@tsflow/flow-engine';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ES module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Demo script to run the chargepoint installation flow
 */
async function runChargepointInstallation() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   CHARGEPOINT INSTALLATION FLOW DEMONSTRATION              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Load the simplified YAML flow definition
  const yamlPath = join(__dirname, 'chargepoint-simple.yaml');
  const yamlContent = readFileSync(yamlPath, 'utf-8');

  // Parse YAML to StateMachineConfig
  const config = YamlFlowParser.fromYaml(yamlContent);
  const storage = new InMemoryStateStorage();
  const engine = new FlowEngine(config, storage);

  // Create installation context
  const installationContext = {
    installationId: 'INST-2024-001',
    orderId: 'ORD-2024-123',
    customerId: 'CUST-456',
    address: {
      street: '123 Green Street',
      city: 'Amsterdam',
      postalCode: '1012 AB',
      country: 'Netherlands'
    },
    chargepointModel: 'FastCharge-Pro-22kW',
    quantity: 2,
    installerCompanyId: 'INSTALLER-789'
  };

  // Start the installation flow
  console.log('🚀 Starting installation flow...\n');
  const flow = await engine.start({ context: installationContext });
  console.log(`Flow ID: ${flow.flowId}`);
  console.log(`Initial state: ${flow.currentState}\n`);

  // Register saga compensations
  console.log('📝 Registering compensations for saga pattern...\n');
  
  await engine.recordCompensation(
    flow.flowId,
    async (ctx: any) => {
      if (ctx.payment?.depositPaid && !ctx.payment.refunded) {
        console.log(`   🔄 COMPENSATION: Refunding deposit €${ctx.payment.depositAmount}`);
        ctx.payment.refunded = true;
        ctx.payment.refundAmount = ctx.payment.depositAmount;
      }
    },
    'Refund deposit payment'
  );

  await engine.recordCompensation(
    flow.flowId,
    async (ctx: any) => {
      if (ctx.permits?.submitted) {
        console.log('   🔄 COMPENSATION: Cancelling permit application');
      }
    },
    'Cancel permit application'
  );

  await engine.recordCompensation(
    flow.flowId,
    async (ctx: any) => {
      if (ctx.schedule) {
        console.log('   🔄 COMPENSATION: Cancelling installation appointment');
      }
    },
    'Cancel installation appointment'
  );

  try {
    // Execute the workflow step by step
    console.log('▶️  Executing installation workflow...\n');

    // 1. Start assessment
    console.log('1️⃣  Site assessment...');
    await engine.execute(flow.flowId, { event: 'start_assessment' });
    await sleep(200);

    // 2. Complete assessment
    console.log('2️⃣  Assessment complete...');
    await engine.execute(flow.flowId, { event: 'assessment_done' });
    await sleep(200);

    // 3. Customer approval
    console.log('3️⃣  Customer approval...');
    await engine.execute(flow.flowId, { event: 'customer_approved' });
    await sleep(200);

    // 4. Collect deposit
    console.log('4️⃣  Payment processing...');
    await engine.execute(flow.flowId, { event: 'proceed' });
    await sleep(200);

    // 5. Permits
    console.log('5️⃣  Permit processing...');
    await engine.execute(flow.flowId, { event: 'permits_approved' });
    await sleep(200);

    // 6. Schedule
    console.log('6️⃣  Scheduling...');
    await engine.execute(flow.flowId, { event: 'begin_installation' });
    await sleep(200);

    // 7. Installation
    console.log('7️⃣  Physical installation...');
    await engine.execute(flow.flowId, { event: 'installation_done' });
    await sleep(300);

    // 8. Testing
    console.log('8️⃣  Testing...');
    await engine.execute(flow.flowId, { event: 'tests_passed' });
    await sleep(200);

    // 9. Customer walkthrough
    console.log('9️⃣  Customer acceptance...');
    await engine.execute(flow.flowId, { event: 'customer_accepts' });
    await sleep(200);

    // 10. Final payment
    console.log('🔟 Final payment...');
    await engine.execute(flow.flowId, { event: 'payment_received' });
    await sleep(200);

    // 11. Complete
    console.log('1️⃣1️⃣ Completing...');
    await engine.execute(flow.flowId, { event: 'docs_complete' });
    await sleep(200);

    // Get final state
    const finalState = await engine.getFlow(flow.flowId);
    
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    FLOW COMPLETED!                         ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('\n📊 Final Flow Summary:');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(`   Flow ID:        ${finalState?.flowId}`);
    console.log(`   Status:         ${finalState?.status}`);
    console.log(`   Final State:    ${finalState?.currentState}`);
    console.log(`   Transitions:    ${finalState?.history.length}`);
    console.log(`   Compensations:  ${finalState?.compensations?.length || 0} registered`);
    console.log('─────────────────────────────────────────────────────────────');
    
    console.log('\n📋 Context Summary:');
    console.log('─────────────────────────────────────────────────────────────');
    if (finalState?.context) {
      console.log(`   Installation ID:     ${finalState.context.installationId}`);
      console.log(`   Customer:            ${finalState.context.customerId}`);
      console.log(`   Chargepoint Model:   ${finalState.context.chargepointModel}`);
      console.log(`   Quantity:            ${finalState.context.quantity}`);
      console.log(`   Site Survey:         ${finalState.context.siteSurvey?.completed ? '✅ Completed' : '❌ Pending'}`);
      console.log(`   Electrical Check:    ${finalState.context.electricalAssessment?.completed ? '✅ Completed' : '❌ Pending'}`);
      console.log(`   Permits:             ${finalState.context.permits?.approved ? '✅ Approved' : '❌ Pending'}`);
      console.log(`   Installation:        ${finalState.context.installation?.status || 'pending'}`);
      console.log(`   Testing:             ${finalState.context.commissioning?.allTestsPassed ? '✅ Passed' : '❌ Pending'}`);
      console.log(`   Deposit Paid:        ${finalState.context.payment?.depositPaid ? '✅ Yes' : '❌ No'}`);
      console.log(`   Final Payment:       ${finalState.context.payment?.finalPaymentPaid ? '✅ Yes' : '❌ No'}`);
    }
    console.log('─────────────────────────────────────────────────────────────');

    console.log('\n📜 State History (last 10 transitions):');
    console.log('─────────────────────────────────────────────────────────────');
    const recentHistory = finalState?.history.slice(-10) || [];
    recentHistory.forEach((h, i) => {
      console.log(`   ${i + 1}. ${h.from} → ${h.to} (${h.event})`);
    });
    console.log('─────────────────────────────────────────────────────────────');

  } catch (error) {
    console.error('\n❌ Error during installation:', error);
    const errorState = await engine.getFlow(flow.flowId);
    console.log('\n📊 Flow Status at Error:');
    console.log(`   Status:         ${errorState?.status}`);
    console.log(`   Current State:  ${errorState?.currentState}`);
    console.log(`   Error Message:  ${errorState?.error?.message}`);
    if (errorState?.compensations && errorState.compensations.length > 0) {
      console.log(`\n🔄 Compensations would be triggered (${errorState.compensations.length} registered)`);
    }
  }
}

/**
 * Helper function to simulate delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the demo
runChargepointInstallation()
  .then(() => {
    console.log('\n✅ Demo completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Demo failed:', error);
    process.exit(1);
  });

export { runChargepointInstallation };
