import request from '../request';
import { extractList, extractPageMeta } from './internals';
import { mapBackendFormDefinition, mapBackendFormDefinitions, type BackendFormDefinitionLike } from '@/utils/formDefinition';
import type { FormDefinition } from '@/types';

export interface FormVersionFieldChange {
  fieldId: string;
  label: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  properties: Record<string, { before: unknown; after: unknown }>;
}

export interface FormVersionDifference {
  fromVersion: number;
  toVersion: number;
  changeType: string;
  summary: string;
  added: FormVersionFieldChange[];
  removed: FormVersionFieldChange[];
  modified: FormVersionFieldChange[];
  layoutChanges: Array<{
    fieldId: string;
    label: string;
    from: { parent: string; order: number } | null;
    to: { parent: string; order: number } | null;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
  }>;
}

const base = (formId: string) => `/workflow/wf/form/${encodeURIComponent(formId)}`;
const parseVersion = (value: BackendFormDefinitionLike): FormDefinition => {
  const form = mapBackendFormDefinition(value);
  if (!form?.version || !Number.isInteger(form.version)) throw new Error('服务器返回的表单版本无效');
  return form;
};

export async function getFormVersions(formId: string, pageNum = 1, pageSize = 10) {
  const response = await request.get(`${base(formId)}/versions`, { params: { pageNum, pageSize } });
  const records = mapBackendFormDefinitions(extractList<BackendFormDefinitionLike>(response));
  const meta = extractPageMeta(response);
  return { records, total: meta.total ?? records.length, pageNum: meta.pageNum ?? pageNum, pageSize: meta.pageSize ?? pageSize };
}

export async function getFormVersion(formId: string, version: number): Promise<FormDefinition> {
  return parseVersion(await request.get(`${base(formId)}/versions/${version}`));
}

export async function compareFormVersions(formId: string, from: number, to: number): Promise<FormVersionDifference> {
  return request.get(`${base(formId)}/versions/compare`, { params: { from, to } });
}

export async function rollbackFormVersion(formId: string, version: number, versionLock: number, changeLog?: string): Promise<FormDefinition> {
  return parseVersion(await request.post(`${base(formId)}/rollback/${version}`, { versionLock, changeLog }));
}
