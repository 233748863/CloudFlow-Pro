import type { FormField } from '../types';
import { FIELD_REGISTRY } from '../components/form-builder/fieldRegistry';
import { findFormField, getFormValueFields, getSubTableColumns, listFormFields, validateFormTree } from '../utils/formTree';
import { formDerivedFields, hasKnownFormDataShape, projectFormInput } from '../utils/formValueRuntime';
import { getWorkflowBusinessEntry } from '../services/api/workflow/businessEntry';
import {
  WorkflowDraftError,
  draftExpireTimestamp,
  isDraftExpired,
  toWorkflowDraftError,
  type DraftContent,
  type DraftDetailVO,
  type DraftLaunchContextVO,
  type DraftSaveRequest,
  type DraftSaveResult,
  type DraftStartRequest,
  type DraftStartResult,
  type DraftSummaryVO,
} from '../services/api/workflow/draftTypes';

export const DRAFT_DEBOUNCE_MS = 5_000;
export const DRAFT_MAX_WAIT_MS = 30_000;

const supportedFields = new Set(Object.keys(FIELD_REGISTRY));
const blockingErrors = new Set(['DRAFT_NOT_FOUND', 'DRAFT_CONFLICT', 'DRAFT_EXPIRED', 'DRAFT_STALE', 'DRAFT_UNAVAILABLE', 'FORM_UNSUPPORTED_FIELD_TYPE', 'BUSINESS_ENTRY_REQUIRED', 'PERMISSION_DENIED', 'INVALID_RESPONSE']);

export interface WorkflowDraftAccess {
  view: boolean;
  save: boolean;
  submit: boolean;
  remove: boolean;
}

export interface WorkflowDraftApi {
  context: (definitionId: string, signal?: AbortSignal) => Promise<DraftLaunchContextVO>;
  byDefinition: (definitionId: string, signal?: AbortSignal) => Promise<DraftSummaryVO | null>;
  detail: (draftId: string, signal?: AbortSignal) => Promise<DraftDetailVO>;
  save: (request: DraftSaveRequest, signal?: AbortSignal) => Promise<DraftSaveResult>;
  remove: (draftId: string, expectedVersion: number, signal?: AbortSignal) => Promise<void>;
  start: (request: DraftStartRequest, signal?: AbortSignal) => Promise<DraftStartResult>;
}

export interface DraftClock {
  now: () => number;
  setTimeout: (callback: () => void, milliseconds: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

const defaultClock: DraftClock = {
  now: () => Date.now(),
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface WorkflowDraftState {
  phase: 'loading' | 'ready' | 'failed';
  context: DraftLaunchContextVO | null;
  content: DraftContent;
  saved: DraftSaveResult | null;
  pendingDraft: DraftSummaryVO | null;
  dirty: boolean;
  saving: boolean;
  restoring: boolean;
  submitting: boolean;
  submitted: boolean;
  confirmingSubmission: boolean;
  confirmingSave: boolean;
  blocked: boolean;
  error: WorkflowDraftError | null;
}

export const createInitialDraftState = (): WorkflowDraftState => ({
  phase: 'loading',
  context: null,
  content: { title: '', formData: {}, nodeAssignees: {} },
  saved: null,
  pendingDraft: null,
  dirty: false,
  saving: false,
  restoring: false,
  submitting: false,
  submitted: false,
  confirmingSubmission: false,
  confirmingSave: false,
  blocked: false,
  error: null,
});

export function isDraftFieldWritable(context: DraftLaunchContextVO, field: FormField): boolean {
  const fields = context.formDefinition?.fields || [];
  const location = listFormFields(fields).find((candidate) => candidate.field === field || candidate.path === field.id);
  const paths = [location?.path || field.id, ...(location?.ancestors || [])];
  return !field.readonly && !formDerivedFields(fields).has(field.id) && paths.every((path) => {
    const permission = context.fieldPermissions.find((entry) => entry.nodeKey === '__START__' && entry.fieldId === path);
    return !findFormField(fields, path)?.field.readonly && permission?.visibleFlag !== false && permission?.editableFlag !== false;
  });
}

export function projectDraftContent(context: DraftLaunchContextVO, content: DraftContent): DraftContent {
  let formData: Record<string, unknown>;
  try { formData = projectFormInput(context.formDefinition?.fields || [], content.formData, { permissions: context.fieldPermissions }); }
  catch { throw new WorkflowDraftError('REQUEST_REJECTED'); }
  // Draft saves replace the whole value map. Empty fields without a configured default
  // keep their original omission semantics; a clear that overrides a default must remain explicit.
  const omitUnconfiguredEmpty = (fields: FormField[], values: Record<string, unknown>) => {
    for (const field of getFormValueFields(fields)) {
      const value = values[field.id];
      if ((value === '' || value === null) && field.defaultValue === undefined) delete values[field.id];
      else if (field.type === 'SUB_TABLE' && Array.isArray(value)) {
        for (const row of value) if (row && typeof row === 'object' && !Array.isArray(row)) omitUnconfiguredEmpty(getSubTableColumns(field), row as Record<string, unknown>);
      }
    }
  };
  omitUnconfiguredEmpty(context.formDefinition?.fields || [], formData);
  return {
    title: content.title,
    formData,
    nodeAssignees: Object.fromEntries(Object.entries(content.nodeAssignees).filter(([, userIds]) => userIds.length).map(([nodeKey, userIds]) => [nodeKey, [...userIds]])),
  };
}

export function draftContentFingerprint(content: DraftContent): string {
  return JSON.stringify(content, (_key, value: unknown) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, (value as Record<string, unknown>)[key]]));
    }
    return value;
  });
}

export function validateDraftContext(context: DraftLaunchContextVO, definitionId: string): void {
  if (!context || context.definitionId !== definitionId || !/^[\da-f]{64}$/i.test(context.contextHash)
    || !context.processDefKey || !Array.isArray(context.fieldPermissions) || !Array.isArray(context.assigneeNodes)
    || (context.formId ? context.formDefinition?.id !== context.formId : context.formDefinition !== null)) {
    throw new WorkflowDraftError('INVALID_RESPONSE');
  }
  if (context.formDefinition && !Array.isArray(context.formDefinition.fields)) throw new WorkflowDraftError('INVALID_RESPONSE');
  if (getWorkflowBusinessEntry(context.processDefKey)) throw new WorkflowDraftError('BUSINESS_ENTRY_REQUIRED');
  const fields = context.formDefinition?.fields || [];
  if (listFormFields(fields).some((location) => !supportedFields.has(location.field.type))) throw new WorkflowDraftError('FORM_UNSUPPORTED_FIELD_TYPE');
  if (validateFormTree(fields).length) throw new WorkflowDraftError('INVALID_RESPONSE');
  if (context.fieldPermissions.some((permission) => permission.nodeKey !== '__START__')) throw new WorkflowDraftError('INVALID_RESPONSE');
}

export function validateDraftAssignees(context: DraftLaunchContextVO, nodeAssignees: Record<string, string[]>, required: boolean): void {
  for (const [nodeKey, userIds] of Object.entries(nodeAssignees)) {
    const node = context.assigneeNodes.find((entry) => entry.nodeKey === nodeKey);
    if (!node || !Array.isArray(userIds) || (!node.multiple && userIds.length > 1)
      || new Set(userIds).size !== userIds.length
      || userIds.some((userId) => typeof userId !== 'string' || !node.candidates.some((candidate) => candidate.userId === userId))) {
      throw new WorkflowDraftError('DRAFT_STALE');
    }
  }
  if (required && context.assigneeNodes.some((node) => !nodeAssignees[node.nodeKey]?.length)) throw new WorkflowDraftError('ASSIGNEES_REQUIRED');
}

interface WorkflowDraftOptions {
  definitionId: string;
  draftId?: string;
  access: WorkflowDraftAccess;
  api: WorkflowDraftApi;
  clock?: DraftClock;
  isCurrent?: () => boolean;
  onChanged?: () => void;
  onSubmitted?: (result: DraftStartResult) => void;
  onPermissionUnavailable?: () => void;
}

export class WorkflowDraftSession {
  private state = createInitialDraftState();
  private readonly listeners = new Set<() => void>();
  private readonly abort = new AbortController();
  private readonly clock: DraftClock;
  private active = true;
  private autoTimer: unknown = null;
  private expiryTimer: unknown = null;
  private firstDirtyAt: number | null = null;
  private lastChangeAt = 0;
  private savedFingerprint = '';
  private savingPromise: Promise<DraftSaveResult | null> | null = null;
  private uncertainSave: { request: DraftSaveRequest; fingerprint: string } | null = null;
  private pendingSubmission: DraftStartRequest | null = null;

  constructor(private readonly options: WorkflowDraftOptions) {
    this.clock = options.clock || defaultClock;
  }

  getState = () => this.state;

  updateAccess(access: WorkflowDraftAccess): void {
    this.options.access = access;
    this.scheduleAutoSave();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private current() {
    return this.active && !this.abort.signal.aborted && (this.options.isCurrent?.() ?? true);
  }

  private publish(patch: Partial<WorkflowDraftState>) {
    if (!this.current()) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private fail(error: unknown) {
    const failure = toWorkflowDraftError(error);
    this.cancelAutoSave();
    this.publish({ error: failure, blocked: this.state.blocked || blockingErrors.has(failure.code) });
    return failure;
  }

  async initialize(): Promise<void> {
    try {
      const [context, pendingDraft] = await Promise.all([
        this.options.api.context(this.options.definitionId, this.abort.signal),
        !this.options.draftId && this.options.access.view
          ? this.options.api.byDefinition(this.options.definitionId, this.abort.signal)
          : Promise.resolve(null),
      ]);
      if (!this.current()) return;
      validateDraftContext(context, this.options.definitionId);
      if (pendingDraft && pendingDraft.definitionId !== this.options.definitionId) throw new WorkflowDraftError('INVALID_RESPONSE');
      this.savedFingerprint = draftContentFingerprint(projectDraftContent(context, this.state.content));
      this.publish({ context, pendingDraft, phase: 'ready', error: null });
      if (this.options.draftId) await this.restore(this.options.draftId);
    } catch (error) {
      if (!this.current()) return;
      const failure = this.fail(error);
      this.publish({ phase: 'failed' });
      if (failure.code === 'PERMISSION_DENIED' && !this.options.draftId) this.options.onPermissionUnavailable?.();
    }
  }

  private checkDetail(detail: DraftDetailVO, draftId: string) {
    const context = this.state.context;
    if (!context || detail.draftId !== draftId || detail.definitionId !== context.definitionId
      || detail.formId !== context.formId || detail.contextHash !== context.contextHash) throw new WorkflowDraftError('DRAFT_STALE');
    if (isDraftExpired(detail, this.clock.now())) throw new WorkflowDraftError('DRAFT_EXPIRED');
    if (detail.availability !== 'AVAILABLE') throw new WorkflowDraftError(detail.availability === 'STALE' ? 'DRAFT_STALE' : 'DRAFT_UNAVAILABLE');
    if (!detail.formData || typeof detail.formData !== 'object' || Array.isArray(detail.formData)) throw new WorkflowDraftError('INVALID_RESPONSE');
    if (!hasKnownFormDataShape(context.formDefinition?.fields || [], detail.formData)) throw new WorkflowDraftError('DRAFT_STALE');
    validateDraftAssignees(context, detail.nodeAssignees || {}, false);
  }

  private savedResult(detail: DraftDetailVO): DraftSaveResult {
    return { draftId: detail.draftId, definitionId: detail.definitionId, lockVersion: detail.lockVersion, lastSaveTime: detail.lastSaveTime, expireTime: detail.expireTime, changed: false };
  }

  async restore(draftId = this.state.pendingDraft?.draftId): Promise<void> {
    if (!this.current() || !draftId || !this.options.access.view || this.state.restoring || this.state.dirty) return;
    this.publish({ restoring: true, error: null });
    try {
      const detail = await this.options.api.detail(draftId, this.abort.signal);
      if (!this.current()) return;
      this.checkDetail(detail, draftId);
      const content = { title: detail.title || '', formData: { ...detail.formData }, nodeAssignees: structuredClone(detail.nodeAssignees || {}) };
      this.savedFingerprint = draftContentFingerprint(projectDraftContent(this.state.context!, content));
      this.publish({ content, saved: this.savedResult(detail), pendingDraft: null, dirty: false, error: null, blocked: false });
      this.watchExpiry();
    } catch (error) {
      if (this.current()) this.fail(error);
    } finally {
      this.publish({ restoring: false });
    }
  }

  async deletePending(): Promise<void> {
    const pending = this.state.pendingDraft;
    if (!this.current() || !pending || !this.options.access.remove || this.state.restoring) return;
    this.publish({ restoring: true });
    try {
      await this.options.api.remove(pending.draftId, pending.lockVersion, this.abort.signal);
      if (!this.current()) return;
      this.publish({ pendingDraft: null, error: null, blocked: false });
      this.options.onChanged?.();
    } catch (error) {
      if (this.current()) this.fail(error);
    } finally {
      this.publish({ restoring: false });
    }
  }

  change(patch: Partial<DraftContent>): void {
    if (!this.current() || this.state.phase !== 'ready' || this.state.pendingDraft || this.state.restoring
      || this.state.submitting || this.state.submitted || this.state.confirmingSubmission) return;
    const content = { ...this.state.content, ...patch };
    try {
      const dirty = draftContentFingerprint(projectDraftContent(this.state.context!, content)) !== this.savedFingerprint;
      this.publish({ content, dirty, error: this.state.blocked || this.uncertainSave ? this.state.error : null });
      this.lastChangeAt = this.clock.now();
      if (dirty && this.firstDirtyAt === null) this.firstDirtyAt = this.lastChangeAt;
      if (!dirty) this.firstDirtyAt = null;
      this.scheduleAutoSave();
    } catch (error) {
      this.publish({ content, dirty: true });
      this.fail(error);
    }
  }

  private cancelAutoSave() {
    if (this.autoTimer !== null) this.clock.clearTimeout(this.autoTimer);
    this.autoTimer = null;
  }

  private scheduleAutoSave() {
    this.cancelAutoSave();
    if (!this.current() || !this.options.access.save || !this.state.dirty || this.state.blocked || this.uncertainSave
      || this.state.submitting || this.state.confirmingSubmission || this.state.submitted) return;
    const deadline = Math.min(this.lastChangeAt + DRAFT_DEBOUNCE_MS, (this.firstDirtyAt ?? this.clock.now()) + DRAFT_MAX_WAIT_MS);
    this.autoTimer = this.clock.setTimeout(() => { void this.save('auto'); }, Math.max(0, deadline - this.clock.now()));
  }

  private checkExpiry() {
    if (this.state.saved && isDraftExpired(this.state.saved, this.clock.now())) throw new WorkflowDraftError('DRAFT_EXPIRED');
  }

  private watchExpiry() {
    if (this.expiryTimer !== null) this.clock.clearTimeout(this.expiryTimer);
    if (!this.current() || !this.state.saved || this.state.submitted || this.pendingSubmission) return;
    const remaining = draftExpireTimestamp(this.state.saved.expireTime) - this.clock.now();
    if (remaining <= 0) { this.fail(new WorkflowDraftError('DRAFT_EXPIRED')); return; }
    this.expiryTimer = this.clock.setTimeout(() => this.watchExpiry(), Math.min(remaining, 60_000));
  }

  private async reconcileSave(): Promise<void> {
    const attempt = this.uncertainSave;
    if (!attempt) return;
    if (!this.options.access.view) throw new WorkflowDraftError('SAVE_UNCONFIRMED', true);
    const summary = await this.options.api.byDefinition(this.options.definitionId, this.abort.signal);
    if (!this.current()) return;
    if (!summary) {
      if (attempt.request.draftId) throw new WorkflowDraftError('DRAFT_NOT_FOUND');
      this.uncertainSave = null;
      this.publish({ confirmingSave: false });
      return;
    }
    if (attempt.request.draftId && summary.draftId !== attempt.request.draftId) throw new WorkflowDraftError('DRAFT_CONFLICT');
    const detail = await this.options.api.detail(summary.draftId, this.abort.signal);
    if (!this.current()) return;
    this.checkDetail(detail, summary.draftId);
    const fingerprint = draftContentFingerprint(projectDraftContent(this.state.context!, { title: detail.title || '', formData: detail.formData, nodeAssignees: detail.nodeAssignees || {} }));
    const unchangedOriginal = detail.draftId === attempt.request.draftId && detail.lockVersion === attempt.request.expectedVersion && fingerprint === this.savedFingerprint;
    if (fingerprint !== attempt.fingerprint && !unchangedOriginal) throw new WorkflowDraftError('DRAFT_CONFLICT');
    this.savedFingerprint = fingerprint;
    this.uncertainSave = null;
    const dirty = draftContentFingerprint(projectDraftContent(this.state.context!, this.state.content)) !== fingerprint;
    this.publish({ saved: this.savedResult(detail), dirty, error: null, confirmingSave: false });
    this.watchExpiry();
  }

  async save(mode: 'auto' | 'manual' | 'submit' = 'manual'): Promise<DraftSaveResult | null> {
    this.cancelAutoSave();
    if (!this.current() || !this.options.access.save || !this.state.context || this.state.phase !== 'ready'
      || this.state.pendingDraft || this.state.restoring || this.state.blocked || this.state.submitted
      || this.state.confirmingSubmission || (this.state.submitting && mode !== 'submit')) return null;
    if (this.savingPromise) {
      const previous = await this.savingPromise;
      return previous && this.current() ? this.save(mode) : null;
    }
    if (!this.uncertainSave && !this.state.dirty && (this.state.saved || mode === 'auto')) return this.state.saved;
    const pending = this.performSave();
    this.savingPromise = pending;
    try {
      return await pending;
    } finally {
      if (this.savingPromise === pending) this.savingPromise = null;
    }
  }

  private async performSave(): Promise<DraftSaveResult | null> {
    this.publish({ saving: true, error: null });
    let attempt: { request: DraftSaveRequest; fingerprint: string } | null = null;
    try {
      await this.reconcileSave();
      if (!this.current()) return null;
      this.checkExpiry();
      if (!this.state.dirty && this.state.saved) return this.state.saved;
      const context = this.state.context!;
      const content = projectDraftContent(context, this.state.content);
      validateDraftAssignees(context, content.nodeAssignees, false);
      const request: DraftSaveRequest = {
        ...content,
        ...(this.state.saved ? { draftId: this.state.saved.draftId } : {}),
        definitionId: context.definitionId,
        expectedVersion: this.state.saved?.lockVersion || 0,
        loadedContextHash: context.contextHash,
      };
      attempt = { request, fingerprint: draftContentFingerprint(content) };
      this.firstDirtyAt = null;
      const saved = await this.options.api.save(request, this.abort.signal);
      if (!this.current()) return null;
      if (!saved || typeof saved.draftId !== 'string' || !saved.draftId || saved.definitionId !== context.definitionId
        || (request.draftId && saved.draftId !== request.draftId) || !Number.isInteger(saved.lockVersion) || saved.lockVersion < 1
        || saved.lockVersion !== request.expectedVersion + (saved.changed ? 1 : 0)
        || !Number.isFinite(draftExpireTimestamp(saved.expireTime)) || !Number.isFinite(draftExpireTimestamp(saved.lastSaveTime))) {
        throw new WorkflowDraftError('INVALID_RESPONSE', true);
      }
      this.savedFingerprint = attempt.fingerprint;
      this.uncertainSave = null;
      const dirty = draftContentFingerprint(projectDraftContent(context, this.state.content)) !== this.savedFingerprint;
      this.publish({ saved, dirty, error: null, confirmingSave: false });
      if (dirty && this.firstDirtyAt === null) this.firstDirtyAt = this.clock.now();
      this.watchExpiry();
      this.options.onChanged?.();
      return saved;
    } catch (error) {
      if (!this.current()) return null;
      const failure = toWorkflowDraftError(error);
      if (failure.uncertain && attempt) {
        this.uncertainSave = attempt;
        this.publish({ confirmingSave: true });
        this.fail(new WorkflowDraftError('SAVE_UNCONFIRMED', true));
      } else {
        this.fail(failure);
      }
      return null;
    } finally {
      this.publish({ saving: false });
      if (!this.state.error) this.scheduleAutoSave();
    }
  }

  async submit(): Promise<DraftStartResult | null> {
    if (!this.current() || !this.options.access.submit || !this.options.access.save || !this.state.context
      || this.state.phase !== 'ready' || this.state.pendingDraft || this.state.restoring || this.state.blocked
      || this.state.submitting || this.state.submitted) return null;
    this.cancelAutoSave();
    this.publish({ submitting: true, error: null });
    try {
      if (!this.pendingSubmission) {
        validateDraftAssignees(this.state.context, this.state.content.nodeAssignees, true);
        const saved = await this.save('submit');
        if (!saved || !this.current()) return null;
        this.checkExpiry();
        this.pendingSubmission = { draftId: saved.draftId, expectedVersion: saved.lockVersion };
      }
      const result = await this.options.api.start(this.pendingSubmission, this.abort.signal);
      if (!this.current()) return null;
      if (!result || typeof result.instanceId !== 'string' || typeof result.processInstanceId !== 'string' || typeof result.processNo !== 'string') {
        throw new WorkflowDraftError('INVALID_RESPONSE', true);
      }
      this.cancelAutoSave();
      if (this.expiryTimer !== null) this.clock.clearTimeout(this.expiryTimer);
      this.publish({ submitted: true, confirmingSubmission: false, dirty: false, error: null });
      this.options.onChanged?.();
      this.options.onSubmitted?.(result);
      return result;
    } catch (error) {
      if (!this.current()) return null;
      const failure = toWorkflowDraftError(error);
      if (failure.uncertain && this.pendingSubmission) {
        this.publish({ confirmingSubmission: true });
        this.fail(new WorkflowDraftError('SUBMIT_UNCONFIRMED', true));
      } else {
        this.pendingSubmission = null;
        this.publish({ confirmingSubmission: false });
        this.fail(failure);
        this.watchExpiry();
      }
      return null;
    } finally {
      this.publish({ submitting: false });
    }
  }

  dispose(): void {
    this.active = false;
    this.abort.abort();
    this.cancelAutoSave();
    if (this.expiryTimer !== null) this.clock.clearTimeout(this.expiryTimer);
    this.listeners.clear();
  }
}
