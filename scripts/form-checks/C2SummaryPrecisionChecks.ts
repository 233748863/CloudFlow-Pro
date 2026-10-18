import fs from 'node:fs';
import { calculateSubTableSummary } from '../../cloudflow-frontend/src/utils/formTree';
import { validateFormValue } from '../../cloudflow-frontend/src/utils/formValueRuntime';
import type { FormField } from '../../cloudflow-frontend/src/types';

const [output, mode] = process.argv.slice(2);
if (!output || !['observe', 'verify'].includes(mode)) throw new Error('Precision evidence path and mode required');
const checks: Array<{ label: string; passed: boolean; acceptedInputs: boolean }> = [];
// Independent integer oracle: these fixtures contain plain decimals with at most 18 fractional digits.
const units = (value: string): bigint => {
  const [integer, fraction = ''] = value.replace(/^-/, '').split('.');
  const magnitude = BigInt(integer) * 10n ** 18n + BigInt(fraction.padEnd(18, '0'));
  return value.startsWith('-') ? -magnitude : magnitude;
};
const expected = (values: string[], precision: number, average = false): string => {
  const sum = values.reduce((total, value) => total + units(value), 0n);
  const divisor = 10n ** BigInt(18 - precision) * BigInt(average ? values.length : 1);
  const absolute = sum < 0n ? -sum : sum;
  const rounded = absolute / divisor + (absolute % divisor * 2n >= divisor ? 1n : 0n);
  const digits = rounded.toString().padStart(precision + 1, '0');
  return (sum < 0n && rounded !== 0n ? '-' : '') + (precision ? digits.slice(0, -precision) + '.' + digits.slice(-precision) : digits);
};
const whole = '1' + '0'.repeat(89);
const high = '9'.repeat(100);
const scenarios: Array<{ label: string; values: string[]; precision: number; average?: boolean }> = [
  { label: 'ninety_digit_amount_retains_cents', values: [whole + '.01', '0.02'], precision: 2 },
  { label: 'large_cancellation_retains_small_difference', values: [whole + '.01', '-' + whole + '.00'], precision: 2 },
  { label: 'large_cancellation_after_small_addend', values: [whole + '.01', '0.02', '-' + whole + '.00'], precision: 2 },
  { label: 'reordered_addends_have_same_exact_total', values: ['-' + whole + '.00', whole + '.01', '0.02'], precision: 2 },
  { label: 'five_hundred_rows_keep_all_cents', values: Array.from({ length: 500 }, () => whole + '.01'), precision: 2 },
  { label: 'large_average_rounds_half_up', values: [whole + '.00', whole + '.01'], precision: 2, average: true },
  { label: 'negative_large_average_rounds_away_from_zero', values: ['-' + whole + '.00', '-' + whole + '.01'], precision: 2, average: true },
  { label: 'eighteen_decimal_places_after_large_integer', values: [high + '.000000000000000001', '0.000000000000000002'], precision: 18 },
  { label: 'eighteen_place_average_at_half_unit', values: [high + '.000000000000000000', high + '.000000000000000001'], precision: 18, average: true },
  { label: 'large_carry_retains_fraction', values: [high + '.99', '0.02'], precision: 2 },
  { label: 'ordinary_amount_keeps_exact_cents', values: ['0.10', '0.20', '0.30'], precision: 2 },
  { label: 'ordinary_average_keeps_rounding', values: ['1.00', '1.01'], precision: 2, average: true },
];
for (const scenario of scenarios) {
  const column: FormField = { id: 'value', type: scenario.precision === 2 ? 'AMOUNT' : 'NUMBER', label: '明细金额', precision: scenario.precision };
  const table: FormField = { id: 'items', type: 'SUB_TABLE', label: '明细', maxRows: 500, columns: [column],
    summaryColumns: [{ columnId: 'value', aggregation: scenario.average ? 'AVG' : 'SUM' }] };
  const acceptedInputs = scenario.values.every(value => value.length <= 128 && validateFormValue(column, value, false, true) === null);
  let passed = false;
  try { passed = acceptedInputs && calculateSubTableSummary(table, scenario.values.map(value => ({ value }))).value === expected(scenario.values, scenario.precision, scenario.average); } catch { passed = false; }
  checks.push({ label: scenario.label, passed, acceptedInputs });
}
fs.writeFileSync(output, JSON.stringify({ mode, checks, passed: checks.every(check => check.passed), independentIntegerOracle: true, businessRequests: 0 }, null, 2));
console.log(`C2_SUMMARY_PRECISION: mode=${mode}; cases=${checks.length}; failed=${checks.filter(check => !check.passed).length}; accepted_inputs=${checks.every(check => check.acceptedInputs)}; business_requests=0`);
if (mode === 'verify' && checks.some(check => !check.passed)) process.exitCode = 1;
