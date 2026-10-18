import { FormDefinition } from '@/types';

export type BackendFormDefinitionLike = Omit<Partial<FormDefinition>, 'id' | 'formKey' | 'isLatest' | 'isRollback'> & {
  id?: unknown;
  formId?: unknown;
  formName?: unknown;
  formKey?: unknown;
  fieldsJson?: unknown;
  formSchema?: unknown;
  fields?: unknown;
  isLatest?: number | boolean;
  isRollback?: number | boolean;
};

const parseFormFields = (form: BackendFormDefinitionLike): FormDefinition['fields'] => {
  if (Array.isArray(form.fields)) {
    return form.fields;
  }

  const raw =
    typeof form.fieldsJson === 'string'
      ? form.fieldsJson
      : typeof form.formSchema === 'string'
        ? form.formSchema
        : null;

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed?.fields) ? parsed.fields : [];
  } catch {
    try {
      const sanitized = raw.replace(/\\([^"\\/bfnrtu])/g, '\\\\$1');
      const parsed = JSON.parse(sanitized);
      return Array.isArray(parsed) ? parsed : Array.isArray(parsed?.fields) ? parsed.fields : [];
    } catch {
      return [];
    }
  }
};

export const mapBackendFormDefinition = (
  form?: BackendFormDefinitionLike | null,
): FormDefinition | null => {
  if (!form) {
    return null;
  }

  const id = String(form.formId ?? form.id ?? form.formKey ?? '').trim();
  if (!id) {
    return null;
  }

  const name = String(form.name ?? form.formName ?? form.formKey ?? id).trim() || id;

  return {
    id,
    formKey: typeof form.formKey === 'string' ? form.formKey : undefined,
    name,
    fields: parseFormFields(form),
    version: form.version,
    versionLock: form.versionLock,
    isLatest: form.isLatest === undefined ? undefined : form.isLatest === true || form.isLatest === 1,
    checksum: form.checksum,
    changeLog: form.changeLog,
    changeType: form.changeType,
    isRollback: form.isRollback === true || form.isRollback === 1,
    rollbackFromVersion: form.rollbackFromVersion,
    createBy: form.createBy,
    createTime: form.createTime,
    versionUnknownFlag: form.versionUnknownFlag,
  };
};

export const mapBackendFormDefinitions = (
  forms: BackendFormDefinitionLike[] = [],
): FormDefinition[] =>
  forms
    .map((form) => mapBackendFormDefinition(form))
    .filter((form): form is FormDefinition => Boolean(form));
