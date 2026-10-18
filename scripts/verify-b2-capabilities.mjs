import { verifyB2SigningModes } from './verify-b2-signing-modes.mjs';
import { verifyB2TimerActions } from './verify-b2-timer-actions.mjs';
import { verifyB2WorkdayTimers } from './verify-b2-workday-timers.mjs';
import { verifyB2InstanceStates } from './verify-b2-instance-states.mjs';
import { verifyB2DesignerUi } from './verify-b2-designer-ui.mjs';
import { verifyB2HrVoting } from './verify-b2-hr-voting.mjs';
import { createB2MobileBrowser } from './b2-mobile-browser.mjs';

// The caller owns authentication, product/input snapshots, secret scanning and the final result.
// This module is deliberately not an executable or a second background scheduler.
export async function verifyB2Capabilities(harness) {
  if (process.env.CLOUDFLOW_B2_CAPABILITIES === 'hr') {
    await verifyB2HrVoting(harness);
    harness.evidence.b2HrOnly = true;
    return;
  }
  const uiOnly = process.env.CLOUDFLOW_B2_CAPABILITIES === 'ui';
  if (process.env.CLOUDFLOW_B2_CAPABILITIES === 'designer') {
    await verifyB2DesignerUi(harness);
    harness.evidence.b2DesignerOnly = true;
    console.log('B2_DESIGNER_ONLY_ACTUAL: fullCombinedRun=false; instanceStatesRun=false');
    return;
  }
  if (!uiOnly) {
    await verifyB2SigningModes(harness);
    await verifyB2HrVoting(harness);
    await verifyB2TimerActions(harness);
    await verifyB2WorkdayTimers(harness);
  }
  const mobile = await createB2MobileBrowser(harness);
  try {
    await verifyB2InstanceStates({ ...harness, mobilePage: mobile.page });
    await verifyB2DesignerUi(harness);
  } finally { await mobile.close(); }
  if (uiOnly) {
    harness.evidence.b2UiCapabilities = true;
    console.log('B2_UI_CAPABILITIES_ACTUAL: ' + JSON.stringify({ instanceActionsAndMonitor:true, stateBrowser:true,
      desktopDesignerSettings:true, signingAndTimerChecksRun:false, fullCombinedRun:false, mobileDesigner:false, mobileMonitor:true, mobileBrowserEmulated:true, complete35Prd:false }));
    return;
  }
  harness.evidence.b2Capabilities = true;
  console.log('B2_CAPABILITIES_ACTUAL: ' + JSON.stringify({ sequential: true, signing: true, timerManagement: true,
    workdayDates: true, instanceActionsAndMonitor: true, stateBrowser: true, actualHrOutage: true,
    desktopDesignerSettings: true, mobileDesigner: false, mobileMonitor:true, mobileBrowserEmulated: true, complete35Prd: false }));
}
