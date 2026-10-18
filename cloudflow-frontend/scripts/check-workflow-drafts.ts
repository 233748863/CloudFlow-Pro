import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import type { FormDefinition, FormField } from '../src/types';
import { WorkflowDraftSession, DRAFT_DEBOUNCE_MS, DRAFT_MAX_WAIT_MS, createInitialDraftState, draftContentFingerprint, projectDraftContent, validateDraftContext, type DraftClock, type WorkflowDraftApi } from '../src/hooks/workflowDraftSession';
import * as draftTypes from '../src/services/api/workflow/draftTypes';
import * as businessEntry from '../src/services/api/workflow/businessEntry';
import * as formTree from '../src/utils/formTree';
import * as formValues from '../src/utils/formValueRuntime';
import * as amountValues from '../src/utils/amountValue';
import * as formErrorFocus from '../src/utils/formErrorFocus';
import * as formFieldErrors from '../src/utils/formFieldErrors';
import { WorkflowDraftError, decodeDraftResponse, isDraftExpired, type DraftContent, type DraftDetailVO, type DraftLaunchContextVO, type DraftSaveRequest, type DraftStartRequest, type DraftSummaryVO } from '../src/services/api/workflow/draftTypes';

const businessCases = [
  { key: 'overtime_request', path: '/hr/ess/overtime', permission: 'hr:overtime:mine' },
  { key: 'hr_shift_request', path: '/hr/ess/shift-requests', permission: 'hr:shift-request:mine' },
  { key: 'oa_consumable_request', path: '/admin/consumable-request', permission: 'oa:consumable-request:list' },
];

let checks = 0;
const check = async (name: string, operation: () => unknown | Promise<unknown>) => {
  try { await operation(); checks += 1; }
  catch (cause) { throw new Error(name, { cause }); }
};
const settle = async () => { for (let turn = 0; turn < 30; turn += 1) await Promise.resolve(); };
const deferred = <Value,>() => {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((accept, refuse) => { resolve = accept; reject = refuse; });
  return { promise, resolve, reject };
};
const dateText = (timestamp: number) => {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

class TestClock implements DraftClock {
  private timestamp = new Date('2026-09-14T09:00:00').getTime();
  private sequence = 0;
  private timers = new Map<number, { at: number; callback: () => void }>();
  now = () => this.timestamp;
  setTimeout = (callback: () => void, milliseconds: number) => {
    this.sequence += 1;
    this.timers.set(this.sequence, { at: this.timestamp + milliseconds, callback });
    return this.sequence;
  };
  clearTimeout = (handle: unknown) => { this.timers.delete(handle as number); };
  advance(milliseconds: number) {
    const target = this.timestamp + milliseconds;
    while (true) {
      const pending = [...this.timers.entries()].filter(([, timer]) => timer.at <= target).sort((left, right) => left[1].at - right[1].at)[0];
      if (!pending) break;
      this.timestamp = pending[1].at;
      this.timers.delete(pending[0]);
      pending[1].callback();
    }
    this.timestamp = target;
  }
}

const form: FormDefinition = {
  id: 'form-test', name: '验证表单', fields: (['TEXT', 'NUMBER', 'DATE', 'SELECT', 'TEXTAREA', 'EMPLOYEE', 'DEPT', 'POST', 'POSITION'] as const).map((type) => ({ id: type.toLowerCase(), type, label: type, required: true, ...(type === 'SELECT' ? { options: ['选项一', '选项二'] } : {}) })),
};
const content: DraftContent = {
  title: '验证标题',
  formData: { text: '验证内容', number: 0, date: '2026-09-14', select: '选项二', textarea: '第一行\n第二行', employee: '9007199254740993', dept: '200', post: '300', position: '400' },
  nodeAssignees: { approval: ['9007199254740995', '9007199254740993'] },
};
const makeContext = (): DraftLaunchContextVO => ({
  definitionId: 'definition-test', processDefKey: 'process-test', definitionName: '验证流程', formId: form.id, formDefinition: structuredClone(form), contextHash: 'a'.repeat(64), fieldPermissions: [],
  assigneeNodes: [{ nodeKey: 'approval', nodeName: '审批节点', selectableScope: {}, multiple: true, candidates: [{ userId: '9007199254740993', userName: '候选甲' }, { userId: '9007199254740995', userName: '候选乙' }] }],
});
const summary = (detail: DraftDetailVO): DraftSummaryVO => ({ draftId: detail.draftId, definitionId: detail.definitionId, definitionName: detail.definitionName, title: detail.title, lastSaveTime: detail.lastSaveTime, expireTime: detail.expireTime, lockVersion: detail.lockVersion, availability: detail.availability, unavailableReason: detail.unavailableReason });

function fixture() {
  const clock = new TestClock();
  const context = makeContext();
  const calls = { saves: [] as DraftSaveRequest[], starts: [] as DraftStartRequest[], removes: [] as Array<{ draftId: string; version: number }>, lookups: 0, contexts: 0, changed: 0, submitted: 0 };
  let stored: DraftDetailVO | null = null;
  let consumedId: string | null = null;
  const result = { instanceId: 'instance-test', processInstanceId: 'engine-test', processNo: 'PROCESS-TEST' };
  const api: WorkflowDraftApi = {
    context: async () => { calls.contexts += 1; return structuredClone(context); },
    byDefinition: async () => { calls.lookups += 1; return stored ? summary(stored) : null; },
    detail: async (draftId) => { if (!stored || stored.draftId !== draftId) throw new WorkflowDraftError('DRAFT_NOT_FOUND'); return structuredClone(stored); },
    save: async (request) => {
      calls.saves.push(structuredClone(request));
      if (request.loadedContextHash !== context.contextHash) throw new WorkflowDraftError('DRAFT_STALE');
      if (stored && (request.draftId !== stored.draftId || request.expectedVersion !== stored.lockVersion)) throw new WorkflowDraftError('DRAFT_CONFLICT');
      if (!stored && request.draftId) throw new WorkflowDraftError('DRAFT_NOT_FOUND');
      const changed = !stored || draftContentFingerprint({ title: stored.title || '', formData: stored.formData, nodeAssignees: stored.nodeAssignees || {} }) !== draftContentFingerprint({ title: request.title, formData: request.formData, nodeAssignees: request.nodeAssignees });
      const saved = { draftId: stored?.draftId || 'draft-test', definitionId: context.definitionId, lockVersion: (stored?.lockVersion || 0) + (changed ? 1 : 0), lastSaveTime: changed ? dateText(clock.now()) : stored!.lastSaveTime, expireTime: changed ? dateText(clock.now() + 30 * 24 * 60 * 60 * 1000) : stored!.expireTime, changed };
      stored = { ...saved, definitionName: context.definitionName, formId: context.formId, availability: 'AVAILABLE', unavailableReason: null, contextHash: context.contextHash, title: request.title, formData: structuredClone(request.formData), nodeAssignees: structuredClone(request.nodeAssignees) };
      return saved;
    },
    remove: async (draftId, version) => {
      calls.removes.push({ draftId, version });
      if (!stored || stored.draftId !== draftId) throw new WorkflowDraftError('DRAFT_NOT_FOUND');
      if (stored.lockVersion !== version) throw new WorkflowDraftError('DRAFT_CONFLICT');
      stored = null;
    },
    start: async (request) => {
      calls.starts.push({ ...request });
      if (consumedId === request.draftId) return result;
      if (!stored) throw new WorkflowDraftError('DRAFT_NOT_FOUND');
      if (stored.draftId !== request.draftId || stored.lockVersion !== request.expectedVersion) throw new WorkflowDraftError('DRAFT_CONFLICT');
      consumedId = stored.draftId;
      stored = null;
      return result;
    },
  };
  const session = (overrides: Partial<ConstructorParameters<typeof WorkflowDraftSession>[0]> = {}) => new WorkflowDraftSession({ definitionId: context.definitionId, access: { view: true, save: true, submit: true, remove: true }, api, clock, onChanged: () => { calls.changed += 1; }, onSubmitted: () => { calls.submitted += 1; }, ...overrides });
  const put = (patch: Partial<DraftDetailVO> = {}) => {
    stored = { draftId: 'draft-test', definitionId: context.definitionId, definitionName: context.definitionName, formId: context.formId, title: content.title, formData: structuredClone(content.formData), nodeAssignees: structuredClone(content.nodeAssignees), contextHash: context.contextHash, lockVersion: 3, availability: 'AVAILABLE', unavailableReason: null, lastSaveTime: dateText(clock.now()), expireTime: dateText(clock.now() + 30 * 24 * 60 * 60 * 1000), ...patch };
    return stored;
  };
  return { api, clock, calls, context, session, put, stored: () => stored, result };
}

await check('context and hash are loaded together; opening without changes never saves', async () => {
  const test = fixture(); const session = test.session(); await session.initialize(); test.clock.advance(60_000); await settle();
  assert.equal(test.calls.contexts, 1); assert.equal(session.getState().context?.contextHash, test.context.contextHash); assert.equal(test.calls.saves.length, 0); session.dispose();
});

await check('all nine fields, title, selected approver order and large IDs restore without a write', async () => {
  const test = fixture(); test.put(); const session = test.session(); await session.initialize(); assert.ok(session.getState().pendingDraft); await session.restore();
  assert.deepEqual(session.getState().content, content); assert.equal(session.getState().saved?.lockVersion, 3); test.clock.advance(30_000); await settle(); assert.equal(test.calls.saves.length, 0); session.dispose();
});

await check('manual empty save skips required validation and uses version zero', async () => {
  const test = fixture(); const session = test.session(); await session.initialize(); await session.save();
  assert.deepEqual(test.calls.saves[0].formData, {}); assert.deepEqual(test.calls.saves[0].nodeAssignees, {}); assert.equal(test.calls.saves[0].expectedVersion, 0); assert.equal(session.getState().saved?.lockVersion, 1); session.dispose();
});

await check('autosave waits exactly 5 seconds after a change', async () => {
  const test = fixture(); const session = test.session(); await session.initialize(); session.change({ title: '改动' }); test.clock.advance(DRAFT_DEBOUNCE_MS - 1); await settle(); assert.equal(test.calls.saves.length, 0);
  test.clock.advance(1); await settle(); assert.equal(test.calls.saves.length, 1); assert.equal(session.getState().dirty, false); session.dispose();
});

await check('continuous changes save by the 30-second maxWait', async () => {
  const test = fixture(); const session = test.session(); await session.initialize(); session.change({ title: '初始改动' });
  for (let second = 1; second < 30; second += 1) { test.clock.advance(1000); session.change({ title: `改动${second}` }); await settle(); assert.equal(test.calls.saves.length, 0); }
  test.clock.advance(1000); await settle(); assert.equal(test.calls.saves.length, 1); assert.equal(DRAFT_MAX_WAIT_MS, 30_000); test.clock.advance(60_000); await settle(); assert.equal(test.calls.saves.length, 1); session.dispose();
});

await check('reverted changes and repeated manual save never write or renew expiry', async () => {
  const test = fixture(); const session = test.session(); await session.initialize(); session.change({ formData: { text: '修改' } }); session.change({ formData: { text: '' } }); test.clock.advance(30_000); await settle(); assert.equal(test.calls.saves.length, 0);
  session.change({ title: '草稿' }); await session.save(); const expiry = session.getState().saved?.expireTime; test.clock.advance(30_000); await session.save(); assert.equal(test.calls.saves.length, 1); assert.equal(session.getState().saved?.expireTime, expiry); session.dispose();
});

await check('hidden, readonly and auxiliary fields are displayed but never freely written', () => {
  const context = makeContext();
  context.formDefinition!.fields.push({ id: 'derivedName', type: 'TEXT', label: '派生姓名', required: true, readonly: true });
  context.formDefinition!.fields.push({ id: 'mappedNumber', type: 'NUMBER', label: '派生数值', required: false });
  context.formDefinition!.fields[5].displayFieldId = 'derivedName';
  context.formDefinition!.fields[5].fillMappings = [{ targetFieldId: 'helper', source: 'name' }, { targetFieldId: 'mappedNumber', source: 'number' }];
  context.fieldPermissions = [{ nodeKey: '__START__', fieldId: 'text', visibleFlag: false, editableFlag: true }, { nodeKey: '__START__', fieldId: 'number', visibleFlag: true, editableFlag: false }];
  const original = { ...content, formData: { ...content.formData, derivedName: '展示姓名', helper: '辅助展示', mappedNumber: 999 } };
  const projected = projectDraftContent(context, original);
  for (const fieldId of ['text', 'number', 'derivedName', 'helper', 'mappedNumber']) assert.equal(Object.hasOwn(projected.formData, fieldId), false);
  assert.equal(original.formData.derivedName, '展示姓名'); assert.equal(projected.formData.employee, '9007199254740993');
});

await check('clearing a configured default is saved once and repeated saves do not renew expiry', async () => {
  for (const empty of ['', null]) {
    const test = fixture(); test.context.formDefinition!.fields.find(field => field.id === 'text')!.defaultValue = '默认文字';
    const session = test.session(); await session.initialize(); session.change({ formData: { text: empty } });
    assert.equal(session.getState().dirty, true); await session.save();
    assert.equal(test.calls.saves.length, 1); assert.equal(test.calls.saves[0].formData.text, empty);
    const expiry = session.getState().saved?.expireTime; test.clock.advance(30_000); await session.save();
    assert.equal(test.calls.saves.length, 1); assert.equal(session.getState().saved?.expireTime, expiry); session.dispose();
  }
});

await check('draft row clears distinguish configured defaults from unchanged empty columns', () => {
  const context = makeContext();
  context.formDefinition!.fields = [{ id: 'items', type: 'SUB_TABLE', label: '明细', required: false, columns: [
    { id: 'defaulted', type: 'TEXT', label: '有默认值', required: false, defaultValue: '默认' }, { id: 'blank', type: 'TEXT', label: '无默认值', required: false },
  ] }];
  const original = { title: '', formData: { items: [{ _rowId: 'row', defaulted: null, blank: '' }] }, nodeAssignees: {} };
  assert.deepEqual(projectDraftContent(context, original).formData, { items: [{ _rowId: 'row', defaulted: null }] });
  assert.equal(original.formData.items[0].blank, '');
});

await check('saves are serialized and submitting waits for the newest edits to save', async () => {
  const test = fixture(); const gate = deferred<void>(); const originalSave = test.api.save;
  test.api.save = async (request, signal) => { const result = await originalSave(request, signal); if (test.calls.saves.length === 1) await gate.promise; return result; };
  const session = test.session(); await session.initialize(); session.change(content); test.clock.advance(5000); await settle(); assert.equal(test.calls.saves.length, 1);
  session.change({ title: '最新标题' }); const submission = session.submit(); await settle(); session.change({ title: '提交期间禁止修改' }); assert.equal(test.calls.starts.length, 0); assert.equal(test.calls.saves.length, 1);
  gate.resolve(); await submission; assert.equal(test.calls.saves.length, 2); assert.equal(test.calls.saves[1].title, '最新标题'); assert.equal(test.calls.saves[1].expectedVersion, 1);
  assert.deepEqual(test.calls.starts, [{ draftId: 'draft-test', expectedVersion: 2 }]); assert.equal(session.getState().submitted, true); test.clock.advance(60_000); await settle(); assert.equal(test.calls.saves.length, 2); session.dispose();
});

await check('a failed final save retains the values and prevents start', async () => {
  const test = fixture(); test.api.save = async () => { throw new WorkflowDraftError('DRAFT_TOO_LARGE'); }; const session = test.session(); await session.initialize(); session.change(content); await session.submit();
  assert.deepEqual(session.getState().content, content); assert.equal(session.getState().dirty, true); assert.equal(test.calls.starts.length, 0); assert.equal(session.getState().error?.code, 'DRAFT_TOO_LARGE'); session.dispose();
});

await check('first save with a lost response reconciles by definition before retrying', async () => {
  const test = fixture(); const originalSave = test.api.save;
  test.api.save = async (request, signal) => { await originalSave(request, signal); throw new Error('transport unavailable'); };
  const session = test.session(); await session.initialize(); session.change(content); await session.save(); assert.equal(session.getState().confirmingSave, true); assert.equal(session.getState().saved, null);
  test.clock.advance(30_000); await settle(); assert.equal(test.calls.saves.length, 1); test.api.save = originalSave; await session.save();
  assert.equal(test.calls.lookups, 2); assert.equal(test.calls.saves.length, 1); assert.equal(session.getState().saved?.draftId, 'draft-test'); assert.equal(session.getState().confirmingSave, false); assert.equal(session.getState().dirty, false); session.dispose();
});

await check('unknown first save cannot blindly recreate without view permission', async () => {
  const test = fixture(); const originalSave = test.api.save;
  test.api.save = async (request, signal) => { await originalSave(request, signal); throw new Error('transport unavailable'); };
  const session = test.session({ access: { view: false, save: true, submit: true, remove: false } }); await session.initialize(); session.change(content); await session.save(); await session.save();
  assert.equal(test.calls.saves.length, 1); assert.equal(test.calls.lookups, 0); assert.equal(session.getState().confirmingSave, true); session.dispose();
});

for (const code of ['DRAFT_CONFLICT', 'DRAFT_STALE', 'DRAFT_UNAVAILABLE', 'DRAFT_NOT_FOUND', 'DRAFT_EXPIRED']) {
  await check(`${code} retains local data and blocks all overwrite retries`, async () => {
    const test = fixture(); let attempts = 0; test.api.save = async () => { attempts += 1; throw new WorkflowDraftError(code); };
    const session = test.session(); await session.initialize(); session.change(content); await session.save(); session.change({ title: '冲突后内容' }); test.clock.advance(60_000); await settle(); await session.save(); await session.submit();
    assert.equal(session.getState().blocked, true); assert.deepEqual(session.getState().content.formData, content.formData); assert.equal(attempts, 1); assert.equal(test.calls.starts.length, 0); session.dispose();
  });
}

await check('definition changes never replace the loaded context hash or original structure', async () => {
  const test = fixture(); const session = test.session(); await session.initialize(); test.context.contextHash = 'b'.repeat(64); test.context.formDefinition!.fields = []; session.change(content); await session.save();
  assert.equal(test.calls.saves[0].loadedContextHash, 'a'.repeat(64)); assert.equal(session.getState().context?.formDefinition?.fields.length, 9); assert.equal(test.calls.contexts, 1); assert.equal(session.getState().error?.code, 'DRAFT_STALE'); session.dispose();
});

for (const patch of [{ contextHash: 'b'.repeat(64) }, { nodeAssignees: { approval: ['999'] } }, { formData: { unknownField: '不允许静默丢弃' } }]) {
  await check('restoring a stale snapshot, candidate or unknown field never auto-saves', async () => {
    const test = fixture(); test.put(patch); const session = test.session(); await session.initialize(); await session.restore(); test.clock.advance(30_000); await settle();
    assert.equal(session.getState().error?.code, 'DRAFT_STALE'); assert.equal(session.getState().saved, null); assert.equal(test.calls.saves.length, 0); session.dispose();
  });
}

await check('expiry disables editing and submission at the exact expiry time', async () => {
  const test = fixture(); test.put({ expireTime: dateText(test.clock.now() + 1000) }); const session = test.session(); await session.initialize(); await session.restore(); test.clock.advance(999); assert.equal(session.getState().blocked, false);
  test.clock.advance(1); assert.equal(session.getState().error?.code, 'DRAFT_EXPIRED'); assert.equal(isDraftExpired(test.stored()!, test.clock.now()), true); await session.submit(); assert.equal(test.calls.starts.length, 0); session.dispose();
});

await check('processes without forms can save and submit title and approvers', async () => {
  const test = fixture(); test.context.formId = null; test.context.formDefinition = null; const session = test.session(); await session.initialize(); session.change({ title: '无表单申请', nodeAssignees: content.nodeAssignees }); await session.submit();
  assert.deepEqual(test.calls.saves[0].formData, {}); assert.equal(test.calls.starts.length, 1); session.dispose();
});

await check('unknown field types fail explicitly', async () => {
  const test = fixture(); test.context.formDefinition!.fields[0].type = 'SUBTABLE' as FormField['type']; const session = test.session(); await session.initialize();
  assert.equal(session.getState().phase, 'failed'); assert.equal(session.getState().error?.code, 'FORM_UNSUPPORTED_FIELD_TYPE'); await session.save(); assert.equal(test.calls.saves.length, 0); session.dispose();
});

for (const entry of businessCases) {
  await check(`${entry.key} cannot load or save through the general draft session`, async () => {
    assert.equal(businessEntry.getWorkflowBusinessEntry(entry.key)?.path, entry.path);
    assert.equal(businessEntry.getWorkflowBusinessEntry(entry.key)?.permission, entry.permission);
    const test = fixture(); test.context.processDefKey = entry.key;
    let fallback = false;
    const session = test.session({ onPermissionUnavailable: () => { fallback = true; } });
    await session.initialize(); session.change(content); await session.save(); await session.submit();
    assert.equal(session.getState().error?.code, 'BUSINESS_ENTRY_REQUIRED');
    assert.equal(session.getState().blocked, true); assert.equal(fallback, false);
    assert.equal(test.calls.saves.length, 0); assert.equal(test.calls.starts.length, 0); session.dispose();
  });
}

await check('closing during context loading ignores the old response', async () => {
  const test = fixture(); const gate = deferred<DraftLaunchContextVO>(); test.api.context = () => gate.promise; const session = test.session(); const loading = session.initialize(); session.dispose(); gate.resolve(test.context); await loading;
  assert.equal(session.getState().context, null); assert.equal(test.calls.changed, 0);
});

await check('closing during save never changes a newly opened dialog', async () => {
  const test = fixture(); const gate = deferred<void>(); const originalSave = test.api.save; test.api.save = async (request, signal) => { const result = await originalSave(request, signal); await gate.promise; return result; };
  const oldSession = test.session(); await oldSession.initialize(); oldSession.change(content); const saving = oldSession.save(); await settle(); oldSession.dispose(); const nextSession = test.session(); await nextSession.initialize(); gate.resolve(); await saving;
  assert.equal(oldSession.getState().saved, null); assert.equal(test.calls.changed, 0); assert.equal(nextSession.getState().content.title, ''); assert.ok(nextSession.getState().pendingDraft); nextSession.dispose();
});

await check('identity change invalidates in-flight writes and all following callbacks', async () => {
  const test = fixture(); const gate = deferred<void>(); const originalSave = test.api.save; let sameIdentity = true;
  test.api.save = async (request, signal) => { const result = await originalSave(request, signal); await gate.promise; return result; };
  const session = test.session({ isCurrent: () => sameIdentity }); await session.initialize(); session.change(content); const saving = session.save(); await settle(); sameIdentity = false; gate.resolve(); await saving; test.clock.advance(60_000); await settle();
  assert.equal(session.getState().saved, null); assert.equal(test.calls.changed, 0); assert.equal(test.calls.saves.length, 1); session.dispose();
});

await check('lost submit response retries only the same draft ID and version without saving', async () => {
  const test = fixture(); const originalStart = test.api.start; test.api.start = async (request, signal) => { const result = await originalStart(request, signal); if (test.calls.starts.length === 1) throw new Error('lost response'); return result; };
  const session = test.session(); await session.initialize(); session.change(content); await session.submit(); assert.equal(test.stored(), null); assert.equal(session.getState().confirmingSubmission, true); assert.deepEqual(session.getState().content, content);
  session.change({ title: '不应改动' }); test.clock.advance(60_000); await settle(); assert.equal(session.getState().content.title, content.title); assert.equal(test.calls.saves.length, 1); const result = await session.submit();
  assert.deepEqual(result, test.result); assert.deepEqual(test.calls.starts[0], test.calls.starts[1]); assert.equal(test.calls.saves.length, 1); assert.equal(test.calls.submitted, 1); session.dispose();
});

await check('a rejected submit keeps the saved draft and allows a corrected save', async () => {
  const test = fixture(); test.api.start = async () => { throw new WorkflowDraftError('REQUEST_REJECTED'); }; const session = test.session(); await session.initialize(); session.change(content); await session.submit();
  assert.ok(test.stored()); assert.equal(session.getState().submitting, false); assert.equal(session.getState().confirmingSubmission, false); session.change({ title: '更正标题' }); await session.save(); assert.equal(test.calls.saves.length, 2); session.dispose();
});

await check('existing drafts require an explicit restore or versioned delete', async () => {
  const test = fixture(); test.put(); const session = test.session(); await session.initialize(); session.change(content); await session.save(); assert.equal(test.calls.saves.length, 0); await session.deletePending();
  assert.deepEqual(test.calls.removes, [{ draftId: 'draft-test', version: 3 }]); assert.equal(session.getState().pendingDraft, null); session.change({ title: '重新填写' }); await session.save(); assert.equal(test.calls.saves[0].expectedVersion, 0); session.dispose();
});

await check('revoking save permission stops timers without resetting the entered values', async () => {
  const test = fixture(); const session = test.session(); await session.initialize(); session.change(content); session.updateAccess({ view: true, save: false, remove: false, submit: false }); test.clock.advance(60_000); await settle();
  assert.equal(test.calls.saves.length, 0); assert.deepEqual(session.getState().content, content); session.dispose();
});

await check('permission failures alone request the original non-draft launch flow', async () => {
  const test = fixture(); let fallback = 0; test.api.context = async () => { throw new WorkflowDraftError('PERMISSION_DENIED'); }; const session = test.session({ onPermissionUnavailable: () => { fallback += 1; } }); await session.initialize(); assert.equal(fallback, 1); session.dispose();
  const restoring = test.session({ draftId: 'draft-test', onPermissionUnavailable: () => { fallback += 1; } }); await restoring.initialize(); assert.equal(fallback, 1); restoring.dispose();
});

const plain = <Value,>(value: Value): Value => JSON.parse(JSON.stringify(value));
const loadSource = (relativePath: string, modules: Record<string, unknown>, globals: Record<string, unknown> = {}) => {
  const filename = fileURLToPath(new URL(relativePath, import.meta.url));
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const compiled = { exports: {} as Record<string, any> };
  vm.runInNewContext(code, { module: compiled, exports: compiled.exports, require: (name: string) => {
    if (!Object.hasOwn(modules, name)) throw new Error(`Unexpected dependency: ${name}`);
    return modules[name];
  }, ...globals }, { filename });
  return compiled.exports;
};

interface ElementShape {
  type: any;
  props: Record<string, any>;
}
const loadAttachmentHook = (react: Record<string, unknown>) => loadSource('../src/hooks/useWorkflowFormAttachments.tsx', {
  react: { __esModule: true, default: react, ...react },
  '@/components/workflow/WorkflowFormAttachment': { WorkflowFormAttachment: 'WorkflowFormAttachment' },
  '@/utils/authStorage': { getCurrentUserSnapshot: () => ({ id: 'user-test', tenantId: 'tenant-test' }) },
});
const elements = (node: unknown): ElementShape[] => {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  const element = node as ElementShape;
  return [element, ...elements(element.props?.children), ...elements(element.props?.footer), ...elements(element.props?.table), ...elements(element.props?.actions), ...elements(element.props?.filters)];
};

function rendererHarness() {
  const slots: any[] = [];
  let cursor = 0;
  const createElement = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): any => {
    const properties = { ...props, ...(children.length ? { children } : {}) };
    return typeof type === 'function' ? type(properties) : { type, props: properties };
  };
  const react = {
    createElement,
    forwardRef: (render: (...args: any[]) => unknown) => render,
    useMemo: (factory: () => unknown) => factory(),
    useEffect: () => undefined,
    useId: () => 'test-control',
    useRef: (initial: unknown) => { const slot = cursor++; if (!Object.hasOwn(slots, slot)) slots[slot] = { current: initial }; return slots[slot]; },
    useState: (initial: unknown) => {
      const slot = cursor++;
      if (!Object.hasOwn(slots, slot)) slots[slot] = typeof initial === 'function' ? initial() : initial;
      return [slots[slot], (next: any) => { slots[slot] = typeof next === 'function' ? next(slots[slot]) : next; }];
    },
    useImperativeHandle: (ref: { current: unknown }, factory: () => unknown) => { ref.current = factory(); },
  };
  const controls = Object.fromEntries(['BaseDialog', 'Button', 'DatePicker', 'DeptSelector', 'EmployeeSelector', 'Input', 'PositionSelector', 'PostSelector', 'Textarea', 'Select', 'SelectContent', 'SelectItem', 'SelectTrigger', 'SelectValue', 'SelectorShell', 'AmountInput', 'Switch', 'UserSelector', 'DateRangePicker', 'WorkspaceInlineState', 'AlertTriangle', 'FileText', 'Send'].map((name) => [name, { componentName: name }]));
  const runtime = loadSource('../src/utils/formFieldRuntime.ts', {});
  const shared = {
    react: { __esModule: true, default: react, ...react }, 'lucide-react': controls, '@/components/common': controls, './common/select': controls, '@/components/workspace/WorkspacePrimitives': controls,
    '@/utils/cn': { cn: (...values: unknown[]) => values.filter(Boolean).join(' ') }, '@/utils/formFieldRuntime': runtime,
    '@/utils/formTree': formTree, '@/utils/formValueRuntime': formValues, '@/utils/amountValue': amountValues,
    '@/utils/formErrorFocus': formErrorFocus,
    '@/components/common/SelectorShell': controls, '@/components/common/DateRangePicker': controls,
    '@/hooks/useDict': { useDict: () => { throw new Error('Legacy checks do not load dictionaries'); } },
  };
  const globals = { document: { getElementById: () => ({ scrollIntoView: () => undefined }) }, console: { error: () => { throw new Error('Form values must not be logged'); } } };
  const markdown = { FormRichText: 'FormRichText', renderFormMarkdown: (value: string) => value };
  const builtin = loadSource('../src/components/form-renderer/BuiltinFieldControl.tsx', { ...shared, './FormRichText': markdown }, globals);
  const scalar = { FormScalarControl: builtin.BuiltinFieldControl };
  const tree = loadSource('../src/components/form-renderer/FormFieldTree.tsx', { ...shared, './FormScalarControl': scalar, './FormSubTable': { FormSubTable: 'FormSubTable' }, './FormRichText': markdown }, globals);
  const module = loadSource('../src/components/FormRenderer.tsx', { ...shared, './form-renderer/FormFieldTree': tree }, globals);
  const ref = { current: null as { validate: () => boolean; submit: () => void; getData: () => Record<string, unknown> } | null };
  return { ref, render: (props: Record<string, unknown>) => { cursor = 0; return module.FormRenderer(props, ref) as ElementShape; } };
}

await check('controlled renderer displays, validates and submits the same restored nine values', () => {
  const harness = rendererHarness(); let submitted: unknown = null;
  const props = { formDef: form, data: content.formData, fieldPermissions: [], onSubmit: (data: unknown) => { submitted = data; } };
  const tree = harness.render(props);
  const expectedControls = ['Input', 'Input', 'DatePicker', 'SelectorShell', 'Textarea', 'EmployeeSelector', 'DeptSelector', 'PostSelector', 'PositionSelector'];
  for (const [index, field] of form.fields.entries()) {
    const container = elements(tree).find((entry) => entry.props?.id === `field-${field.id}`)!;
    const control = elements(container).find((entry) => entry.type?.componentName === expectedControls[index])!;
    assert.ok(control, field.type);
    if (field.type === 'SELECT') assert.deepEqual(plain(control.props.value), [content.formData[field.id]]);
    else assert.equal(control.props.value, field.type === 'NUMBER' ? String(content.formData[field.id]) : content.formData[field.id]);
  }
  assert.equal(harness.ref.current!.validate(), true); harness.ref.current!.submit(); assert.deepEqual(submitted, content.formData);
});

await check('uncontrolled renderer still owns input changes and submits its internal values', () => {
  const harness = rendererHarness(); let submitted: unknown = null; const props = { formDef: { ...form, fields: form.fields.slice(0, 2) }, onSubmit: (data: unknown) => { submitted = data; } };
  let tree = harness.render(props); let inputs = elements(tree).filter((entry) => entry.type?.componentName === 'Input'); inputs[0].props.onChange({ target: { value: '原方式填写' } });
  tree = harness.render(props); inputs = elements(tree).filter((entry) => entry.type?.componentName === 'Input'); inputs[1].props.onChange({ target: { value: '12.5' } }); harness.render(props); harness.ref.current!.submit();
  assert.deepEqual(plain(submitted), { text: '原方式填写', number: 12.5 });
});

await check('controlled validation errors appear inline and clear on change', () => {
  const harness = rendererHarness(); let data: Record<string, unknown> = { text: '' }; const props = () => ({ formDef: { ...form, fields: form.fields.slice(0, 1) }, data, onDataChange: (next: Record<string, unknown>) => { data = next; }, fieldPermissions: [], hideActions: true });
  harness.render(props()); assert.equal(harness.ref.current!.validate(), false); let tree = harness.render(props()); assert.ok(elements(tree).some((entry) => entry.props?.role === 'alert'));
  elements(tree).find((entry) => entry.type?.componentName === 'Input')!.props.onChange({ target: { value: '已经填写' } }); tree = harness.render(props()); assert.equal(harness.ref.current!.validate(), true); assert.equal(elements(tree).some((entry) => entry.props?.role === 'alert'), false);
});

await check('hidden required fields and readonly derived required fields do not block client submission', () => {
  const harness = rendererHarness(); const permissions = [{ nodeKey: '__START__', fieldId: 'text', visibleFlag: false, editableFlag: false }]; const testForm = { ...form, fields: [form.fields[0], { id: 'derived', type: 'TEXT', label: '服务端派生', required: true, readonly: true }] };
  const tree = harness.render({ formDef: testForm, data: {}, fieldPermissions: permissions, hideActions: true }); assert.equal(elements(tree).some((entry) => entry.props?.id === 'field-text'), false); assert.equal(harness.ref.current!.validate(), true);
});

await check('master-data selection uses the original string ID and atomically fills display data', () => {
  const harness = rendererHarness(); let changed: Record<string, unknown> = {}; const employee = { ...form.fields[5], displayFieldId: 'displayName', fillMappings: [{ targetFieldId: 'displayName', source: 'name' }] };
  const tree = harness.render({ formDef: { ...form, fields: [employee] }, data: {}, idValuesAsStrings: true, onDataChange: (data: Record<string, unknown>) => { changed = data; }, hideActions: true });
  elements(tree).find((entry) => entry.type?.componentName === 'EmployeeSelector')!.props.onChange(9007199254740992, { id: '9007199254740993', name: '服务端候选姓名' });
  assert.deepEqual(plain(changed), { employee: '9007199254740993', displayName: '服务端候选姓名' });
});

for (const [fieldId, value] of [['number', Infinity], ['date', '2026-02-30'], ['select', '已经移除的选项'], ['employee', 'invalid-id']]) {
  await check(`controlled ${fieldId} validation uses restored values`, () => {
    const harness = rendererHarness(); harness.render({ formDef: form, data: { ...content.formData, [fieldId]: value }, fieldPermissions: [] }); assert.equal(harness.ref.current!.validate(), false);
  });
}

await check('draft APIs preserve the exact endpoint, rows pagination and version-only start contracts', async () => {
  const calls: Array<{ method: string; url: string; data?: unknown; config?: any }> = [];
  const request = Object.fromEntries(['get', 'post', 'delete'].map((method) => [method, async (url: string, data: unknown, config?: unknown) => { calls.push(method === 'post' ? { method, url, data, config } : { method, url, config: data }); return { rows: [], total: 0, pageNum: 1, pageSize: 20 }; }]));
  const api = loadSource('../src/services/api/workflow/draft.ts', { '../request': { __esModule: true, default: request }, './draftTypes': draftTypes });
  await api.getDraftLaunchContext('definition/test'); await api.getWorkflowDraftByDefinition('definition/test'); await api.getWorkflowDraft('draft/test');
  const page = await api.getWorkflowDrafts({ pageNum: 2, pageSize: 10, keyword: '流程', definitionId: 'definition-test' }); assert.ok(Array.isArray(page.rows));
  await api.deleteWorkflowDraft('draft/test', 3); await api.startWorkflowDraft({ draftId: 'draft-test', expectedVersion: 4, variables: { secret: '不可混传' }, businessKey: '不可混传' });
  assert.equal(calls[0].url, '/workflow/wf/draft/context/definition%2Ftest'); assert.equal(calls[1].url, '/workflow/wf/draft/by-definition/definition%2Ftest'); assert.equal(calls[2].url, '/workflow/wf/draft/draft%2Ftest');
  assert.equal(calls[3].url, '/workflow/wf/draft/list'); assert.deepEqual(calls[3].config.params, { pageNum: 2, pageSize: 10, keyword: '流程', definitionId: 'definition-test' }); assert.equal(calls[4].config.params.expectedVersion, 3);
  assert.deepEqual(plain(calls[5].data), { draftId: 'draft-test', expectedVersion: 4 }); assert.ok(calls.every((call) => call.config.silent));
});

await check('ordinary start preserves variables and _title while logging only metadata', async () => {
  let payload: any; let logged: any;
  const api = loadSource('../src/services/api/workflow/instance.ts', { '../request': { __esModule: true, default: { post: async (_url: string, body: unknown) => { payload = body; } } }, './internals': { logApiCall: (_method: string, _url: string, data: unknown) => { logged = data; } }, './businessEntry': businessEntry });
  await api.startProcess({ processDefKey: 'process-test', title: '标题', variables: { secret: '不应写入日志' }, nodeAssignees: content.nodeAssignees });
  assert.equal(payload.variables.secret, '不应写入日志'); assert.equal(payload.variables._title, '标题'); assert.deepEqual(plain(logged), { processDefKey: 'process-test' });
});

await check('all three business keys reject general starts before posting or logging', async () => {
  let posted = 0; let logged = 0;
  const api = loadSource('../src/services/api/workflow/instance.ts', { '../request': { __esModule: true, default: { post: async () => { posted += 1; } } }, './internals': { logApiCall: () => { logged += 1; } }, './businessEntry': businessEntry });
  for (const entry of businessCases) await assert.rejects(api.startProcess({ processDefKey: entry.key, variables: { private: '不可提交' } }));
  assert.equal(posted, 0); assert.equal(logged, 0); assert.equal(businessEntry.getWorkflowBusinessEntry('process-test'), null);
});

function workplaceHarness(initialPermissions: string[]) {
  const slots: any[] = []; let cursor = 0; let collectEffects = true;
  const effects: Array<() => void> = [];
  let permissions = new Set(initialPermissions);
  const navigations: string[] = []; const starts: unknown[] = []; const queries: any[] = []; const notices: string[] = [];
  const definitions = [...businessCases.map((entry) => ({ key: entry.key })), { key: 'process-test' }].map((entry) => ({ definitionId: `definition-${entry.key}`, processKey: entry.key, processName: entry.key, version: 1, modelValid: true }));
  const user = { id: 'user-test', tenantId: 'tenant-test', name: '验证用户', role: 'EMPLOYEE' };
  const hasPermission = (permission: string | string[], requireAll = false) => {
    const values = Array.isArray(permission) ? permission : [permission];
    return requireAll ? values.every((value) => permissions.has(value)) : values.some((value) => permissions.has(value));
  };
  const react = {
    createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => ({ type, props: { ...props, children } }),
    useState: (initial: unknown) => {
      const slot = cursor++; if (!Object.hasOwn(slots, slot)) slots[slot] = typeof initial === 'function' ? initial() : initial;
      return [slots[slot], (next: any) => { slots[slot] = typeof next === 'function' ? next(slots[slot]) : next; }];
    },
    useRef: (initial: unknown) => { const slot = cursor++; if (!Object.hasOwn(slots, slot)) slots[slot] = { current: initial }; return slots[slot]; },
    useMemo: (factory: () => unknown) => factory(),
    useEffect: (effect: () => void) => { if (collectEffects) effects.push(effect); },
  };
  const components = new Proxy({}, { get: (_target, name) => name });
  const module = loadSource('../src/pages/Workplace.tsx', {
    react: { __esModule: true, default: react, ...react }, 'lucide-react': components,
    'react-router-dom': { useNavigate: () => (path: string) => { navigations.push(path); } },
    sonner: { toast: { success: (text: string) => notices.push(text), error: (text: string) => notices.push(text) } },
    '@/types': { Role: { ADMIN: 'ADMIN' } }, '@/context/AuthContext': { useAuth: () => ({ user, hasPermission }) },
    '@/hooks/useWorkflowDraftList': { useWorkflowDraftList: () => ({ allowed: false, loading: false, error: null, total: 0, reload: () => undefined }) },
    '@/hooks/useWorkflowDraft': { workflowDraftIdentity: () => 'tenant-test:user-test' },
    '@/services/api/workflow/businessEntry': businessEntry,
    '@/components/workflow/catalog': { WorkflowCatalogGrid: 'WorkflowCatalogGrid', WorkflowLaunchDialog: 'WorkflowLaunchDialog', normalizeWorkflowTags: () => [], mapWorkflowBackendForm: (value: unknown) => value },
    '@/services/api/workflow': { getStartableProcessDefinitions: async () => { queries.push('startable'); return definitions; }, startProcess: async (request: unknown) => { starts.push(request); } },
    '@/utils/workflowGraph': { parseWorkflowGraphDefinition: (json: string) => JSON.parse(json) },
    '@/utils/workflowCategory': { WORKFLOW_CATEGORY_OPTIONS: [], getWorkflowCategoryLabel: (value: string) => value, normalizeWorkflowCategory: () => 'OTHER' },
    '@/components/common': components, '@/components/layout/TablePageLayout': components,
  });
  const render = () => { cursor = 0; return module.Workplace(); };
  const load = async () => { render(); collectEffects = false; effects.forEach((effect) => effect()); await settle(); return render(); };
  const grid = (tree: unknown) => elements(tree).find((element) => element.type === 'WorkflowCatalogGrid')!;
  const dialog = (tree: unknown) => elements(tree).find((element) => element.type === 'WorkflowLaunchDialog')!;
  return { definitions, navigations, starts, queries, notices, render, load, grid, dialog, setPermissions: (values: string[]) => { permissions = new Set(values); } };
}

await check('workplace hides unauthorized business cards and rechecks permission on clicks', async () => {
  const test = workplaceHarness([]); const tree = await test.load(); const grid = test.grid(tree);
  assert.deepEqual(plain(grid.props.workflows.map((workflow: any) => workflow.key)), ['process-test']);
  for (const entry of businessCases) grid.props.onStart({ id: `definition-${entry.key}`, key: entry.key });
  assert.equal(test.navigations.length, 0); assert.equal(test.starts.length, 0); assert.equal(test.notices.length, 3);
  assert.equal(test.dialog(test.render()).props.open, false);
});

await check('authorized business cards route to their pages while regular launch remains unchanged', async () => {
  const test = workplaceHarness(businessCases.map((entry) => entry.permission)); const tree = await test.load(); const grid = test.grid(tree);
  assert.equal(grid.props.workflows.length, 4);
  for (const entry of businessCases) {
    grid.props.onStart(grid.props.workflows.find((workflow: any) => workflow.key === entry.key));
    assert.equal(test.navigations.at(-1), entry.path); assert.equal(test.dialog(test.render()).props.open, false);
  }
  const regular = grid.props.workflows.find((workflow: any) => workflow.key === 'process-test'); grid.props.onStart(regular);
  const dialog = test.dialog(test.render()); assert.equal(dialog.props.open, true);
  await dialog.props.onSubmit({ text: '验证申请' }); assert.equal(test.starts.length, 1); assert.equal(test.navigations.at(-1), '/my-apps');
});

await check('business permission revocation and stale open targets never reach general start', async () => {
  const test = workplaceHarness(businessCases.map((entry) => entry.permission)); const grid = test.grid(await test.load());
  const regular = grid.props.workflows.find((workflow: any) => workflow.key === 'process-test'); grid.props.onStart(regular);
  regular.key = 'oa_consumable_request'; test.setPermissions([]);
  await test.dialog(test.render()).props.onSubmit({ text: '不可提交' });
  assert.equal(test.starts.length, 0); assert.equal(test.navigations.length, 0); assert.equal(test.dialog(test.render()).props.open, false);
  assert.ok(test.grid(test.render()) === undefined);
});

await check('workplace uses authorized published catalog and does not invent missing HR definitions', async () => {
  const test = workplaceHarness(businessCases.map((entry) => entry.permission)); test.definitions.splice(0, 1);
  const grid = test.grid(await test.load()); assert.equal(test.queries[0], 'startable');
  assert.equal(grid.props.workflows.some((workflow: any) => workflow.key === 'overtime_request'), false);
  assert.equal(grid.props.workflows.some((workflow: any) => workflow.key === 'oa_consumable_request'), true);
  assert.equal(test.definitions.length, 3);
});

await check('launch dialog refuses business form and draft entry and only offers permitted destinations', () => {
  let permission = ''; let closed = 0; const navigations: string[] = [];
  const react = { createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => ({ type, props: { ...props, children } }) };
  const components = new Proxy({}, { get: (_target, name) => name });
  const module = loadSource('../src/components/workflow/catalog/WorkflowLaunchDialog.tsx', {
    react: { __esModule: true, default: react }, 'lucide-react': components, '@/components/common': components,
    'react-router-dom': { useNavigate: () => (path: string) => navigations.push(path) },
    '@/components/FormRenderer': { FormRenderer: 'FormRenderer' }, '@/components/common/SelectorShell': { SelectorShell: 'SelectorShell' },
    '@/services/api/workflow': {}, '@/utils/errorMessage': {},
    '@/utils/formFieldErrors': formFieldErrors,
    '@/hooks/useWorkflowFormAttachments': loadAttachmentHook(react),
    '@/context/AuthContext': { useAuth: () => ({ user: { id: 'user-test' }, hasPermission: (value: string) => value === permission }) },
    '@/hooks/useWorkflowDraft': { workflowDraftIdentity: () => 'tenant-test:user-test' },
    '@/components/workflow/drafts/WorkflowDraftEditor': { WorkflowDraftEditor: 'WorkflowDraftEditor' }, '@/services/api/workflow/businessEntry': businessEntry,
  });
  for (const entry of businessCases) {
    const props = { open: true, workflow: { id: `definition-${entry.key}`, key: entry.key, name: entry.key }, onClose: () => { closed += 1; } };
    permission = '';
    assert.equal(elements(module.WorkflowLaunchDialog(props)).filter((element) => element.type === 'Button').length, 1);
    permission = entry.permission; const tree = module.WorkflowLaunchDialog(props);
    assert.equal(tree.type, 'BaseDialog'); assert.equal(elements(tree).some((element) => element.type === 'WorkflowDraftEditor' || element.type === 'FormRenderer'), false);
    elements(tree).find((element) => element.type === 'Button' && element.props.variant !== 'outline')!.props.onClick();
    assert.equal(navigations.at(-1), entry.path);
  }
  assert.equal(closed, 3);
});

function editorHarness() {
  const slots: any[] = []; let cursor = 0; let identity = 'tenant-test:user-test';
  let shouldBlock: (navigation: any) => boolean = () => false; let submitted: (result: unknown) => void = () => undefined;
  const calls = { closed: 0, disposed: 0, saved: 0, submitted: 0, proceeded: 0, reset: 0 };
  const blocker = { state: 'unblocked', proceed: () => { calls.proceeded += 1; }, reset: () => { calls.reset += 1; blocker.state = 'unblocked'; } };
  const draft = {
    state: { ...createInitialDraftState(), phase: 'ready' as const, context: makeContext(), content: structuredClone(content), dirty: true },
    hasUnsavedChanges: true, dispose: () => { calls.disposed += 1; }, save: () => { calls.saved += 1; }, submit: () => undefined,
  };
  const react = {
    useCallback: (callback: unknown) => callback,
    createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => ({ type, props: { ...props, children } }),
    useRef: (initial: unknown) => { const slot = cursor++; if (!Object.hasOwn(slots, slot)) slots[slot] = { current: initial }; return slots[slot]; },
    useState: (initial: unknown) => { const slot = cursor++; if (!Object.hasOwn(slots, slot)) slots[slot] = initial; return [slots[slot], (value: unknown) => { slots[slot] = value; }]; },
    useLayoutEffect: () => undefined,
  };
  const components = new Proxy({}, { get: (_target, name) => name });
  const module = loadSource('../src/components/workflow/drafts/WorkflowDraftEditor.tsx', {
    react: { __esModule: true, default: react, ...react }, 'lucide-react': components, '@/components/common': components,
    'react-router-dom': { useBlocker: (callback: typeof shouldBlock) => { shouldBlock = callback; return blocker; } },
    '@/components/common/SelectorShell': { SelectorShell: 'SelectorShell' }, '@/components/common/selectorCache': {}, '@/components/FormRenderer': { FormRenderer: 'FormRenderer' },
    '@/hooks/useWorkflowDraft': { useWorkflowDraft: (options: any) => { submitted = options.onSubmitted; return draft; }, workflowDraftIdentity: () => identity },
    '@/utils/authStorage': { getCurrentUserSnapshot: () => ({}) }, '@/services/api/workflow/draftTypes': draftTypes,
    './WorkflowDraftReferenceField': { WorkflowDraftReferenceField: 'WorkflowDraftReferenceField' },
    '@/hooks/useWorkflowFormAttachments': loadAttachmentHook(react),
  });
  const props = { identity: 'tenant-test:user-test', definitionId: 'definition-test', definitionName: '验证流程', access: { view: true, save: true, submit: true, remove: true }, onClose: () => { calls.closed += 1; }, onSubmitted: () => { calls.submitted += 1; } };
  const render = () => { cursor = 0; return module.WorkflowDraftEditor(props); };
  const confirmation = (tree: unknown) => elements(tree).find((element) => element.type === 'ConfirmDialog' && element.props.title === '确认离开申请')!;
  const navigation = { currentLocation: { pathname: '/workplace', search: '' }, nextLocation: { pathname: '/workflow/drafts', search: '' } };
  return { render, confirmation, calls, draft, blocker, blocks: () => shouldBlock(navigation), switchIdentity: () => { identity = 'another:user'; }, finishSubmission: () => submitted({ instanceId: 'instance-test', processInstanceId: 'engine-test', processNo: 'PROCESS-TEST' }) };
}

await check('unsaved close prompts without silently discarding or saving in the background', () => {
  const test = editorHarness(); let tree = test.render();
  elements(tree).find((element) => element.type === 'BaseDialog')!.props.onClose();
  tree = test.render(); assert.equal(test.confirmation(tree).props.open, true); assert.equal(test.calls.closed, 0);
  test.confirmation(tree).props.onCancel(); assert.equal(test.confirmation(test.render()).props.open, false);
  assert.deepEqual(test.draft.state.content, content);
  elements(test.render()).find((element) => element.type === 'BaseDialog')!.props.onClose();
  test.confirmation(test.render()).props.onConfirm(); assert.equal(test.calls.closed, 1); assert.equal(test.calls.disposed, 1); assert.equal(test.calls.saved, 0);
});

await check('route changes prompt while dirty and successful submit or identity change can leave', () => {
  const test = editorHarness(); test.render(); assert.equal(test.blocks(), true);
  test.blocker.state = 'blocked'; let tree = test.render(); assert.equal(test.confirmation(tree).props.open, true);
  test.confirmation(tree).props.onCancel(); assert.equal(test.calls.reset, 1);
  test.blocker.state = 'blocked'; tree = test.render(); test.confirmation(tree).props.onConfirm(); assert.equal(test.calls.proceeded, 1); assert.equal(test.blocks(), false);
  const submitted = editorHarness(); submitted.render(); submitted.finishSubmission(); assert.equal(submitted.calls.submitted, 1); assert.equal(submitted.blocks(), false);
  const switched = editorHarness(); switched.render(); switched.switchIdentity(); assert.equal(switched.blocks(), false);
});

await check('business error codes survive existing request handling without retaining response contents', () => {
  for (const code of ['DRAFT_NOT_FOUND', 'DRAFT_CONFLICT', 'DRAFT_EXPIRED', 'DRAFT_STALE', 'DRAFT_UNAVAILABLE', 'DRAFT_TOO_LARGE', 'FORM_UNSUPPORTED_FIELD_TYPE']) {
    for (const response of [{ code, message: '私密正文' }, { code: 500, msg: `${code}: 私密正文` }]) {
      assert.throws(() => decodeDraftResponse(JSON.stringify(response), 200), (error: WorkflowDraftError) => error.code === code && !error.message.includes('私密正文'));
    }
  }
  assert.throws(() => decodeDraftResponse('{invalid: 私密正文', 400), (error: WorkflowDraftError) => !error.message.includes('私密正文'));
  assert.throws(() => decodeDraftResponse({ code: 403 }, 403), (error: WorkflowDraftError) => error.code === 'PERMISSION_DENIED');
  assert.deepEqual(decodeDraftResponse({ code: 401 }, 401), { code: 401, msg: '登录已过期，请重新登录' });
});

await check('contexts cannot silently combine a mismatched form and a new hash', () => {
  const context = makeContext(); context.formDefinition!.id = 'different-form'; assert.throws(() => validateDraftContext(context, context.definitionId), WorkflowDraftError);
});

await check('numeric approver IDs from a mismatched detail contract cannot silently restore or overwrite', async () => {
  const test = fixture();
  test.put({ nodeAssignees: { approval: [Number(test.context.assigneeNodes[0].candidates[0].userId) as unknown as string] } });
  const session = test.session({ draftId: 'draft-test' }); await session.initialize(); await session.save(); await session.submit();
  assert.equal(session.getState().error?.code, 'DRAFT_STALE'); assert.equal(session.getState().blocked, true);
  assert.equal(test.calls.saves.length, 0); assert.equal(test.calls.starts.length, 0); session.dispose();
});

await check('draft implementation does not persist or log form contents in the browser', () => {
  for (const filename of ['../src/hooks/workflowDraftSession.ts', '../src/hooks/useWorkflowDraft.ts', '../src/hooks/useWorkflowDraftList.ts', '../src/components/workflow/drafts/WorkflowDraftEditor.tsx', '../src/pages/WorkflowDraftPage.tsx', '../src/services/api/workflow/draft.ts']) {
    const source = readFileSync(new URL(filename, import.meta.url), 'utf8'); assert.equal(/localStorage|sessionStorage|console\.(log|warn|error)|logApiCall\(/.test(source), false, filename);
  }
});

console.log(`草稿前端独立验证通过：${checks} 项；未启动服务，未写入业务数据。`);
