import assert from 'node:assert/strict';
import { mapBackendFormDefinition } from '../src/utils/formDefinition';
import type { FormField, FormFieldType } from '../src/types';
import { createFormField, FIELD_GROUPS, FIELD_REGISTRY, getFieldTypeDefinition } from '../src/components/form-builder/fieldRegistry';
import { evaluateFormExpression, evaluateNumericExpression, validateFormExpression } from '../src/utils/formExpression';
import { formatDecimalAmount, groupAmountDigits, normalizeFormNumber } from '../src/utils/amountValue';
import { formDeclaredFields, formExpressionData, hasKnownFormDataShape, projectFormInput, validateFormInput, validateFormValue } from '../src/utils/formValueRuntime';
import { getFormFieldErrors } from '../src/utils/formFieldErrors';
import { decodeDraftResponse, WorkflowDraftError } from '../src/services/api/workflow/draftTypes';
import {
  calculateSubTableSummary, copyFormField, createFormDefaults, createSubTableRow, findFormField,
  getFormValueFields, insertFormField, listFormFields, moveFormField, newFieldForParent,
  removeFormFields, supportsImSummary, updateFormField, validateFormTree,
} from '../src/utils/formTree';

let checks = 0;
const check = (name: string, operation: () => void) => {
  try { operation(); checks += 1; }
  catch (cause) { throw new Error(name, { cause }); }
};

check('backend mapping preserves version and optimistic lock', () => {
  const form = mapBackendFormDefinition({ id: 900, formId: 'expense', formKey: 'expense-key', formName: '报销', version: 4, versionLock: 8,
    isLatest: 0, isRollback: 1, rollbackFromVersion: 2, checksum: 'hash', fieldsJson: '{"fields":[{"id":"reason","type":"TEXT"}]}' });
  assert.equal(form?.id, 'expense');
  assert.equal(form?.formKey, 'expense-key');
  assert.equal(form?.isLatest, false);
  assert.equal(form?.version, 4);
  assert.equal(form?.versionLock, 8);
  assert.equal(form?.isRollback, true);
  assert.equal(form?.rollbackFromVersion, 2);
  assert.equal(form?.fields[0].id, 'reason');
});
check('subtable qualified field identifiers fit permission and file storage', () => {
  const table: FormField = { id: 'a'.repeat(50), type: 'SUB_TABLE', label: 'Table', required: false, columns: [{ id: 'b'.repeat(50), type: 'TEXT', label: 'Column', required: false }] };
  assert.ok(validateFormTree([table]).some((issue) => issue.message.includes('完整字段标识')));
  (table.columns as FormField[])[0].id = 'b'.repeat(49);
  assert.equal(validateFormTree([table]).length, 0);
});
check('all explicitly named PRD types are registered', () => assert.equal(Object.keys(FIELD_REGISTRY).length, 30));
check('IM summary consent defaults off and survives designer edits and API mapping', () => {
  const field = createFormField('TEXT', 'summary');
  assert.notEqual(field.imSummaryAllowed, true);
  const allowed = updateFormField([field], 'summary', { imSummaryAllowed: true });
  assert.equal(allowed[0].imSummaryAllowed, true);
  const mapped = mapBackendFormDefinition({ formId: 'form', fieldsJson: JSON.stringify(allowed) });
  assert.equal(mapped?.fields[0].imSummaryAllowed, true);
  assert.deepEqual(validateFormTree(allowed), []);
});
check('IM summary rejects subtable columns, objects, and non-boolean consent', () => {
  const field = { ...createFormField('TEXT', 'summary'), imSummaryAllowed: true };
  assert.equal(supportsImSummary(field, 'table.summary'), false);
  const table = { ...createFormField('SUB_TABLE', 'table'), columns: [field] };
  assert.ok(validateFormTree([table]).some((issue) => issue.message.includes('企业微信')));
  for (const type of ['RICH_TEXT', 'UPLOAD_FILE', 'EMPLOYEE', 'GROUP', 'DICT_SELECT'] as const) {
    assert.equal(supportsImSummary(createFormField(type, 'value'), 'value'), false);
  }
  assert.ok(validateFormTree([{ ...field, imSummaryAllowed: 'true' } as unknown as FormField]).some((issue) => issue.message.includes('布尔值')));
});
check('palette groups cover every registered type exactly once', () => {
  const grouped = FIELD_GROUPS.flatMap((group) => group.types);
  assert.equal(new Set(grouped).size, grouped.length);
  assert.deepEqual([...grouped].sort(), Object.keys(FIELD_REGISTRY).sort());
});
check('exactly ten column types are allowed', () => assert.deepEqual(
  Object.values(FIELD_REGISTRY).filter((field) => field.allowedInSubTable).map((field) => field.type).sort(),
  ['TEXT', 'NUMBER', 'AMOUNT', 'DATE', 'SELECT', 'DICT_SELECT', 'SWITCH', 'EMPLOYEE', 'DEPT', 'UPLOAD_FILE'].sort(),
));
for (const registered of Object.values(FIELD_REGISTRY)) {
  check(`independent defaults for ${registered.type}`, () => {
    const first = createFormField(registered.type, 'first');
    const second = createFormField(registered.type, 'second');
    assert.equal(first.type, registered.type);
    assert.equal(first.id, 'first');
    assert.ok(first.label);
    if (first.options) { first.options.push('changed'); assert.ok(!second.options!.includes('changed')); }
    if (first.children) { first.children.push(createFormField('TEXT', 'child')); assert.equal(second.children!.length, 0); }
    if (first.fillMappings) { first.fillMappings[0].targetFieldId = 'changed'; assert.notEqual(second.fillMappings![0].targetFieldId, 'changed'); }
  });
}
for (const invalidType of ['__proto__', 'constructor', 'prototype', 'UNKNOWN']) {
  check(`unknown field type ${invalidType} fails closed`, () => assert.equal(getFieldTypeDefinition(invalidType), null));
}

const text = createFormField('TEXT', 'reason');
const amount = createFormField('AMOUNT', 'cost');
const table: FormField = { ...createFormField('SUB_TABLE', 'items'), columns: [amount], summaryColumns: [{ columnId: 'cost', aggregation: 'SUM' }] };
const group: FormField = { ...createFormField('GROUP', 'section'), children: [text, table] };
const fields = [group, createFormField('TEXT', 'other')];

check('layout and column addresses remain unambiguous', () => assert.deepEqual(listFormFields(fields).map((location) => location.path), ['section', 'reason', 'items', 'items.cost', 'other']));
check('only data fields appear in values', () => assert.deepEqual(getFormValueFields(fields).map((field) => field.id), ['reason', 'items', 'other']));
check('ordinary definitions are valid', () => assert.deepEqual(validateFormTree(fields), []));
check('update preserves untouched field identity', () => {
  const updated = updateFormField(fields, 'items.cost', { label: '费用' });
  assert.equal(updated[1], fields[1]);
  assert.equal(findFormField(updated, 'reason')!.field, text);
  assert.equal(findFormField(updated, 'items.cost')!.field.label, '费用');
  assert.equal(amount.label, '金额');
});
check('nested removal is immutable', () => {
  const updated = removeFormFields(fields, ['reason']);
  assert.equal(findFormField(updated, 'reason'), undefined);
  assert.ok(findFormField(fields, 'reason'));
});
check('moving between containers does not duplicate the field', () => {
  const updated = moveFormField(fields, 'reason', null, 1);
  assert.equal(updated[1], text);
  assert.equal(listFormFields(updated).filter((location) => location.path === 'reason').length, 1);
});
check('moving a container into its descendant is rejected', () => assert.throws(() => moveFormField(fields, 'section', 'items', 0)));
check('moving a container into itself is rejected', () => assert.throws(() => moveFormField(fields, 'section', 'section', 0)));
check('inserting duplicate global field IDs is rejected', () => assert.throws(() => insertFormField(fields, null, 1, { ...text })));
check('copying a subtree creates distinct IDs but retains column names', () => {
  const updated = copyFormField(fields, 'section');
  assert.equal(updated.length, 3);
  assert.ok(findFormField(updated, 'section2'));
  assert.ok(findFormField(updated, 'reason2'));
  assert.ok(findFormField(updated, 'items2.cost'));
  assert.deepEqual(validateFormTree(updated), []);
});
check('copying a table column assigns a unique local ID', () => assert.ok(findFormField(copyFormField(fields, 'items.cost'), 'items.cost2')));
check('copied expressions follow renamed internal fields', () => {
  const source: FormField = { ...group, children: [text, { ...amount, visibleExpr: "${reason} == 'yes'" }] };
  const updated = copyFormField([source], 'section');
  assert.equal(findFormField(updated, 'cost2')!.field.visibleExpr, "${reason2} == 'yes'");
});
check('copied sibling table column names are allowed', () => assert.deepEqual(validateFormTree([table, { ...table, id: 'secondItems' }]), []));
check('duplicate local column IDs are rejected', () => assert.ok(validateFormTree([{ ...table, columns: [amount, { ...amount }] }]).length));

for (const invalidId of ['__proto__', 'constructor', 'prototype', '_rowId', 'bad.id', '1bad', 'field'.repeat(26)]) {
  check(`invalid identifier ${invalidId} is rejected`, () => assert.ok(validateFormTree([{ ...text, id: invalidId }]).length));
}
for (const type of ['GROUP', 'GRID', 'TABS', 'COLLAPSE'] as FormFieldType[]) {
  check(`empty ${type} remains editable but cannot be saved`, () => {
    const field = createFormField(type, 'container');
    assert.ok(validateFormTree([field]).length);
    assert.deepEqual(validateFormTree([field], true), []);
  });
}
check('three layout levels are allowed and fourth is refused', () => {
  const wrap = (child: FormField, id: string): FormField => ({ ...createFormField('GROUP', id), children: [child] });
  const third = wrap(wrap(wrap(text, 'inner'), 'middle'), 'outer');
  assert.deepEqual(validateFormTree([third]), []);
  assert.ok(validateFormTree([wrap(third, 'fourth')]).length);
});
check('cyclic definitions fail without unbounded recursion', () => {
  const cyclic = createFormField('GROUP', 'cyclic');
  cyclic.children = [cyclic];
  assert.ok(validateFormTree([cyclic]).length);
  assert.throws(() => listFormFields([cyclic]));
});
for (const maximum of [0, -1, 501, 1.5]) {
  check(`row cap ${maximum} is rejected`, () => assert.ok(validateFormTree([{ ...table, maxRows: maximum }]).length));
}
check('500 rows is allowed', () => assert.deepEqual(validateFormTree([{ ...table, maxRows: 500 }]), []));
check('dictionary type is required at save', () => assert.ok(validateFormTree([createFormField('DICT_SELECT', 'dict')]).length));
check('new subtable file columns enforce one attachment', () => assert.equal(newFieldForParent(fields, 'UPLOAD_FILE', 'items').maxCount, 1));
check('unsupported table columns are refused', () => assert.throws(() => insertFormField(fields, 'items', 0, createFormField('TEXTAREA', 'notes'))));
check('summary cannot reference text columns', () => assert.ok(validateFormTree([{ ...table, columns: [text], summaryColumns: [{ columnId: 'reason', aggregation: 'SUM' }] }]).length));
check('decimal addition is exact', () => assert.deepEqual(calculateSubTableSummary(table, [{ cost: '0.1' }, { cost: '0.2' }]), { cost: '0.30' }));
check('large amounts retain all integer digits', () => assert.deepEqual(calculateSubTableSummary(table, [{ cost: '9999999999999999.99' }, { cost: '0.01' }]), { cost: '10000000000000000.00' }));
check('average uses half-up decimal rounding', () => assert.deepEqual(calculateSubTableSummary({ ...table, summaryColumns: [{ columnId: 'cost', aggregation: 'AVG' }] }, [{ cost: '1.00' }, { cost: '1.01' }]), { cost: '1.01' }));
check('count includes zero and excludes empty values', () => assert.deepEqual(calculateSubTableSummary({ ...table, summaryColumns: [{ columnId: 'cost', aggregation: 'COUNT' }] }, [{ cost: 0 }, { cost: '' }, { cost: null }, { cost: '2' }]), { cost: '2' }));
check('invalid numbers do not become misleading zero totals', () => assert.throws(() => calculateSubTableSummary(table, [{ cost: 'invalid' }])));
check('non-finite amounts are rejected', () => assert.throws(() => calculateSubTableSummary(table, [{ cost: Infinity }])));
check('row identity is explicit and defaults are independent', () => {
  const row = createSubTableRow(table, 'row-1');
  assert.deepEqual(row, { _rowId: 'row-1', cost: '' });
});
check('minimum rows and static defaults are handled', () => {
  const defaults = createFormDefaults([{ ...table, minRows: 2 }, createFormField('SWITCH', 'enabled'), createFormField('DESCRIPTION', 'description')]);
  assert.equal((defaults.items as unknown[]).length, 2);
  assert.equal(defaults.enabled, false);
  assert.equal(Object.hasOwn(defaults, 'description'), false);
  assert.notEqual((defaults.items as Array<Record<string, unknown>>)[0]._rowId, (defaults.items as Array<Record<string, unknown>>)[1]._rowId);
});

const expressionFields = new Set(['amount', 'type', 'enabled', 'missing', 'first', 'second']);
const expressionValues = { amount: '10000.01', type: 'SPECIAL', enabled: true, first: '0.1', second: '0.2' };
for (const expression of ["${amount} > 10000 && ${type} == 'SPECIAL'", '!false', '${enabled}', 'true || false && false', '(true || false) && true', '${missing} == null', '${amount} != 10000', '-1 < 0', "'001' != '1'", "'中文' == '中文'", "'it\\'s' == 'it\\'s'", '(((((true)))))']) {
  check(`valid true predicate ${expression}`, () => assert.deepEqual(evaluateFormExpression(expression, expressionValues, expressionFields), { valid: true, value: true }));
}
for (const expression of ['${amount} < 10000', "${type} == 'NORMAL'", '${missing} != null', 'true && false', 'false || false', '!${enabled}']) {
  check(`valid false predicate ${expression}`, () => assert.deepEqual(evaluateFormExpression(expression, expressionValues, expressionFields), { valid: true, value: false }));
}
for (const expression of ['', '${unknown} == 1', '${amount}.getClass()', 'T(java.lang.Runtime).getRuntime()', "eval('true')", "new Function('true')", '${type.length} > 0', '${constructor} == null', '${__proto__} == null', 'true;false', 'true ? 1 : 0', '${amount} + 1 > 0', '- ${amount} < 0', '((((((true))))))', '!!!!!!true', 'true &&', '(true', 'true)', '01 == 1', "'bad\\n' == 'bad'", 'true && ${unknown} == 1', 'false && ${unknown} == 1', 'true'.repeat(126), '\u00a0true']) {
  check(`invalid predicate fails closed ${expression}`, () => {
    assert.deepEqual(evaluateFormExpression(expression, expressionValues, expressionFields), { valid: false, value: false });
    assert.ok(validateFormExpression(expression, expressionFields));
  });
}
for (const expression of ['${amount}', '${missing} > 1', 'true < false', '${enabled} == 1', '!${missing}']) {
  check(`runtime predicate type mismatch ${expression}`, () => assert.deepEqual(evaluateFormExpression(expression, expressionValues, expressionFields), { valid: false, value: false }));
}
check('numeric expressions preserve decimal precision', () => assert.equal(evaluateNumericExpression('${first} + ${second}', expressionValues, expressionFields), '0.3'));
check('numeric expressions preserve precedence', () => assert.equal(evaluateNumericExpression('(2 + 3) * 4 - 1', expressionValues, expressionFields), '19'));
check('numeric division is exact', () => assert.equal(evaluateNumericExpression('1 / 8', expressionValues, expressionFields), '0.125'));
check('numeric mode permits variable negation', () => assert.equal(evaluateNumericExpression('-${amount}', expressionValues, expressionFields), '-10000.01'));
check('division by zero is rejected', () => assert.throws(() => evaluateNumericExpression('1 / 0', expressionValues, expressionFields)));
check('arrays cannot be inspected by expressions', () => assert.equal(evaluateFormExpression('${amount} > 0', { amount: [1] }, expressionFields).valid, false));
check('objects cannot be inspected by expressions', () => assert.equal(evaluateFormExpression('${amount} > 0', { amount: { secret: 1 } }, expressionFields).valid, false));

check('amount grouping preserves all integer digits', () => assert.equal(groupAmountDigits('10000000000000001'), '10,000,000,000,000,001'));
check('amount display preserves significant cents', () => assert.equal(formatDecimalAmount('10000000000000001.01', 2), '10,000,000,000,000,001.01'));
check('legacy numeric inputs keep representable values', () => assert.equal(normalizeFormNumber('12.5'), 12.5));
check('numeric inputs keep unsafe integers as strings', () => assert.equal(normalizeFormNumber('9007199254740993'), '9007199254740993'));
check('numeric inputs keep extra decimal precision as strings', () => assert.equal(normalizeFormNumber('0.123456789012345678'), '0.123456789012345678'));
const runtimeField = (type: FormFieldType, id: string, extra: Partial<FormField> = {}): FormField => ({ id, type, label: id, required: false, ...extra });
for (const [type, value] of [['SWITCH', false], ['NUMBER', 0], ['AMOUNT', '0.00']] as const) {
  check(`${type} zero or false is not empty`, () => assert.equal(validateFormValue(runtimeField(type, 'value'), value, true), null));
}
for (const type of ['TEXT', 'NUMBER', 'AMOUNT', 'DATE', 'SWITCH'] as const) {
  check(`${type} does not accept an empty array`, () => assert.notEqual(validateFormValue(runtimeField(type, 'value'), [], false), null));
}
check('boolean does not accept empty text', () => assert.notEqual(validateFormValue(runtimeField('SWITCH', 'enabled'), '', false), null));
check('date validation rejects invalid leap date', () => assert.notEqual(validateFormValue(runtimeField('DATE', 'date'), '2026-02-29', false), null));
check('date time rejects trailing date fragments', () => assert.notEqual(validateFormValue(runtimeField('DATETIME', 'date'), '2026-09-15extraT12:30', false), null));
check('date time accepts seconds', () => assert.equal(validateFormValue(runtimeField('DATETIME', 'date'), '2026-09-15T12:30:45', false), null));
check('time rejects twenty four hours', () => assert.notEqual(validateFormValue(runtimeField('TIME', 'time'), '24:00', false), null));
check('reference IDs reject values above signed long maximum', () => assert.notEqual(validateFormValue(runtimeField('EMPLOYEE', 'employee'), '9223372036854775808', false), null));
check('row attachments default to one file', () => assert.notEqual(validateFormValue(runtimeField('UPLOAD_FILE', 'files'), ['11', '12'], false, true), null));
check('top attachments default to five files', () => assert.equal(validateFormValue(runtimeField('UPLOAD_FILE', 'files'), ['11', '12'], false), null));
check('dangerous patterns fail closed before browser regex execution', () => assert.notEqual(validateFormValue(runtimeField('TEXT', 'text', { regex: '^(a+)+$' }), 'a'.repeat(10000), false), null));

const runtimeFields = [runtimeField('AMOUNT', 'amount'), runtimeField('AMOUNT', 'limit'), runtimeField('TEXT', 'note', { required: true, visibleExpr: '${amount} > ${limit}' })];
check('two amount fields compare numerically', () => assert.deepEqual(validateFormInput(runtimeFields, { amount: '10', limit: '2' }), { note: '此项必填' }));
check('scientific numeric input and plain amounts compare consistently', () => assert.deepEqual(validateFormInput(runtimeFields, { amount: '1e2', limit: '99', note: '说明' }), {}));
check('hidden required values are skipped', () => assert.deepEqual(validateFormInput(runtimeFields, { amount: '1', limit: '2' }), {}));
check('hidden submitted values are projected away', () => assert.deepEqual(projectFormInput(runtimeFields, { amount: '1', limit: '2', note: '隐藏内容' }), { amount: '1', limit: '2' }));
check('explicit clears of original fields survive projection instead of restoring defaults', () => {
  const fields = (['TEXT', 'NUMBER', 'DATE', 'SELECT', 'TEXTAREA', 'EMPLOYEE', 'DEPT', 'POST', 'POSITION'] as const).map(type => runtimeField(type, type.toLowerCase(), { defaultValue: 'default' }));
  for (const empty of ['', null]) {
    const values = Object.fromEntries(fields.map(field => [field.id, empty]));
    assert.deepEqual(projectFormInput(fields, values), values);
  }
});
check('clears keep permission filtering and absent values remain absent', () => {
  const fields = [runtimeField('TEXT', 'editable'), runtimeField('TEXT', 'readonly', { readonly: true }), runtimeField('TEXT', 'hidden')];
  assert.deepEqual(projectFormInput(fields, { editable: '', readonly: '', hidden: '' }, { permissions: [{ nodeKey: '__START__', fieldId: 'hidden', visibleFlag: false, editableFlag: false }] }), { editable: '' });
  assert.deepEqual(projectFormInput(fields, {}), {});
});
check('nested clear values preserve row identity without reintroducing defaults', () => {
  const table = runtimeField('SUB_TABLE', 'items', { columns: [runtimeField('TEXT', 'text', { defaultValue: 'default' }), runtimeField('NUMBER', 'number', { defaultValue: 3 })] });
  const values = { items: [{ _rowId: 'clear-row', text: '', number: null }] };
  assert.deepEqual(projectFormInput([table], values), values);
});
check('numeric field values retain exact expression types', () => assert.deepEqual(evaluateFormExpression('${amount} > ${limit}', formExpressionData(runtimeFields, { amount: '10000000000000001', limit: '10000000000000000' }), formDeclaredFields(runtimeFields)), { valid: true, value: true }));
const nestedRuntime = [runtimeField('AMOUNT', 'amount'), runtimeField('GROUP', 'group', { children: [runtimeField('AMOUNT', 'limit'), runtimeField('TEXT', 'note', { required: true, visibleExpr: '${amount} > ${limit}' })] })];
check('layout expressions preserve numeric sibling types', () => assert.deepEqual(validateFormInput(nestedRuntime, { amount: '10', limit: '2' }), { note: '此项必填' }));
const hiddenPermissions = [{ nodeKey: '__START__', fieldId: 'group', visibleFlag: false, editableFlag: false }];
check('container node permissions apply to descendant input', () => assert.deepEqual(projectFormInput(nestedRuntime, { amount: '10', limit: '2', note: '隐藏' }, { permissions: hiddenPermissions }), { amount: '10' }));
check('container node permissions apply to descendant validation', () => assert.deepEqual(validateFormInput(nestedRuntime, { amount: '10' }, { permissions: hiddenPermissions }), {}));
const runtimeTable = runtimeField('SUB_TABLE', 'items', { minRows: 1, maxRows: 2, columns: [runtimeField('AMOUNT', 'cost', { required: true }), runtimeField('TEXT', 'secret', { required: true }), runtimeField('UPLOAD_FILE', 'files')] });
const tablePermissions = [{ nodeKey: '__START__', fieldId: 'items.secret', visibleFlag: false, editableFlag: false }];
check('subtable projections preserve row identity and remove hidden columns', () => assert.deepEqual(projectFormInput([runtimeTable], { items: [{ _rowId: 'row-one', cost: '0.1', secret: '隐藏' }] }, { permissions: tablePermissions }), { items: [{ _rowId: 'row-one', cost: '0.1' }] }));
check('subtable hidden required columns do not block visible rows', () => assert.deepEqual(validateFormInput([runtimeTable], { items: [{ _rowId: 'row-one', cost: '0.1' }] }, { permissions: tablePermissions }), {}));
check('subtable errors include the row index and column ID', () => assert.deepEqual(validateFormInput([runtimeTable], { items: [{ cost: 'invalid' }] }, { permissions: tablePermissions }), { 'items[0].cost': '请输入有效数字' }));
check('subtable duplicate row IDs are rejected', () => assert.ok(validateFormInput([runtimeTable], { items: [{ _rowId: 'same', cost: '1' }, { _rowId: 'same', cost: '2' }] }, { permissions: tablePermissions })['items[1]._rowId']));
check('subtable row attachments use their single-file limit', () => assert.ok(validateFormInput([runtimeTable], { items: [{ cost: '1', files: ['11', '12'] }] }, { permissions: tablePermissions })['items[0].files']));
check('restored data accepts declared nested values', () => assert.equal(hasKnownFormDataShape(nestedRuntime, { amount: '10', limit: '2', note: '说明' }), true));
check('restored data rejects unknown row columns', () => assert.equal(hasKnownFormDataShape([runtimeTable], { items: [{ injected: true }] }), false));
check('restored data rejects malformed rows', () => assert.equal(hasKnownFormDataShape([runtimeTable], { items: ['invalid'] }), false));
check('definition validation rejects unknown expression variables', () => assert.ok(validateFormTree([runtimeField('TEXT', 'note', { visibleExpr: '${missing} == 1' })]).length));
check('definition validation rejects object expression values', () => assert.ok(validateFormTree([runtimeField('TEXT', 'note', { visibleExpr: {} as string })]).length));

const serverError = { code: 'FORM_INVALID_DATA', message: '表单字段校验失败', errors: [
  { field: 'items[87].amount', message: '必须为有效数字', rejectedValue: 'PRIVATE_VALUE' },
  { field: 'note', message: '此项必填' }, null, { field: 'ignored', message: 42 },
] };
const expectedErrors = { 'items[87].amount': '必须为有效数字', note: '此项必填' };
check('actual backend errors array is decoded without rejected values', () => assert.deepEqual(getFormFieldErrors(serverError), expectedErrors));
check('Axios errors preserve the same field paths', () => assert.deepEqual(getFormFieldErrors({ response: { data: serverError } }), expectedErrors));
check('normalized request errors preserve field messages', () => assert.deepEqual(getFormFieldErrors(Object.assign(new Error('invalid'), { fieldErrors: expectedErrors })), expectedErrors));
check('existing field error arrays remain readable', () => assert.deepEqual(getFormFieldErrors({ fieldErrors: serverError.errors }), expectedErrors));
check('draft decoding preserves authoritative field errors', () => assert.throws(() => decodeDraftResponse(JSON.stringify(serverError), 400), error =>
  error instanceof WorkflowDraftError && error.code === 'FORM_INVALID_DATA' && !error.uncertain && JSON.stringify(error.fieldErrors) === JSON.stringify(expectedErrors)));
check('unrelated invalid error payloads do not become field messages', () => {
  for (const value of [null, 1, 'error', [], { errors: 'private' }, { errors: [null, 1, { field: '', message: 'no field' }] }]) assert.deepEqual(getFormFieldErrors(value), {});
});

console.log(`Batch C form foundation checks passed: ${checks}; field types=30; subtable column types=10`);
