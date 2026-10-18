export function hundredths(value) {
  const text = String(value ?? '');
  if (!/^\d{1,16}(?:\.\d{1,2})?$/.test(text)) throw new Error('H_HR_DECIMAL_INVALID');
  const [integer, fraction = ''] = text.split('.');
  return BigInt(integer) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export function decimal(value) {
  if (typeof value !== 'bigint' || value < 0n) throw new Error('H_HR_DECIMAL_INVALID');
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
}

export function weightedMinutes(entries) {
  return entries.reduce((total, entry) => {
    if (!Number.isSafeInteger(entry.minutes) || entry.minutes <= 0 || hundredths(entry.ratio) <= 0n) {
      throw new Error('H_HR_COMPENSATORY_EVIDENCE_INVALID');
    }
    return total + BigInt(entry.minutes) * hundredths(entry.ratio);
  }, 0n);
}

export function creditDelta(previousWeighted, minutes, ratio) {
  if (typeof previousWeighted !== 'bigint' || previousWeighted < 0n) throw new Error('H_HR_COMPENSATORY_EVIDENCE_INVALID');
  const next = previousWeighted + weightedMinutes([{ minutes, ratio }]);
  return next / 60n - previousWeighted / 60n;
}

export function payAmount(minutes, hourlyRate, multiplier) {
  if (!Number.isSafeInteger(minutes) || minutes <= 0) throw new Error('H_HR_PAY_EVIDENCE_INVALID');
  const rate = hundredths(hourlyRate);
  const factor = hundredths(multiplier);
  if (rate <= 0n || factor <= 0n) throw new Error('H_HR_PAY_EVIDENCE_INVALID');
  return decimal((BigInt(minutes) * rate * factor + 3000n) / 6000n);
}

export function restorationPending(fixture) {
  return Boolean(fixture?.restorationRequired || fixture?.payroll?.restorationRequired || fixture?.financialIdentity?.restorationRequired
    || fixture?.compLeave?.restorationRequired || fixture?.limits?.restorationRequired || fixture?.payCorrection?.restorationRequired
    || fixture?.periodResolution?.restorationRequired);
}

export function acceptanceCoverage(completed = {}) {
  return Object.fromEntries([
    ['calendarAndMinutes', 'attendance'],
    ['dualApprovalAndComp', 'overtime-minimal'],
    ['compCumulative', 'overtime-comp-cumulative'],
    ['compZeroDifference', 'overtime-comp-zero'],
    ['compLeaveConsumption', 'comp-leave-consumption'],
    ['cancelReleasesMinutes', 'overtime-comp-cancel'],
    ['paySettlement', 'pay-settlement'],
    ['payrollCalculation', 'payroll-calculation'],
    ['singleApplication', 'shift-single-minimal'],
    ['swapApplication', 'shift-swap-minimal'],
    ['accessAndReplay', 'security'],
    ['atomicFailureRollback', 'shift-atomic-failure'],
    ['payCorrection', 'pay-correction'],
    ['periodResolution', 'period-resolution'],
    ['limitsAndConcurrency', 'limits'],
    ['logPrivacy', ['pay-log-privacy', 'pay-correction-log-privacy']],
  ].map(([label, stages]) => [label, [stages].flat().every(stage => completed[stage] === true)]));
}
