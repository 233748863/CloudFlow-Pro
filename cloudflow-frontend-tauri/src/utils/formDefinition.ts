import { FormDefinition } from '@/types';

type BackendFormDefinitionLike = Partial<FormDefinition> & {
  formId?: unknown;
  formName?: unknown;
  formKey?: unknown;
  fieldsJson?: unknown;
  formSchema?: unknown;
  fields?: unknown;
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
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    try {
      const sanitized = raw.replace(/\\([^"\\/bfnrtu])/g, '\\\\$1');
      const parsed = JSON.parse(sanitized);
      return Array.isArray(parsed) ? parsed : [];
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

  const id = String(form.id ?? form.formId ?? form.formKey ?? '').trim();
  if (!id) {
    return null;
  }

  const name = String(form.name ?? form.formName ?? form.formKey ?? id).trim() || id;

  return {
    id,
    name,
    fields: parseFormFields(form),
  };
};

export const mapBackendFormDefinitions = (
  forms: BackendFormDefinitionLike[] = [],
): FormDefinition[] =>
  forms
    .map((form) => mapBackendFormDefinition(form))
    .filter((form): form is FormDefinition => Boolean(form));
