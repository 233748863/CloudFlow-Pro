import React from 'react';
import { Clock, DollarSign, FileBadge, GitMerge, Monitor } from 'lucide-react';
import type { FormDefinition, WorkflowDefinition } from '@/types';

export const normalizeWorkflowTags = (rawTags: unknown): string[] => {
  if (Array.isArray(rawTags)) {
    return rawTags.filter((item): item is string => typeof item === 'string');
  }

  if (typeof rawTags !== 'string' || rawTags.trim() === '') {
    return [];
  }

  try {
    const parsed = JSON.parse(rawTags);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string');
    }
  } catch {
    // 兼容后端逗号拼接标签的旧数据。
  }

  return rawTags
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

export const mapWorkflowBackendForm = (form: any): FormDefinition => {
  let fields: any[] = [];
  const raw =
    typeof form?.fieldsJson === 'string'
      ? form.fieldsJson
      : typeof form?.formSchema === 'string'
        ? form.formSchema
        : null;

  if (raw) {
    try {
      fields = JSON.parse(raw);
    } catch {
      try {
        const sanitized = raw.replace(/\\([^"\\/bfnrtu])/g, '\\\\$1');
        fields = JSON.parse(sanitized);
      } catch {
        fields = [];
      }
    }
  }

  return {
    id: String(form?.formId || ''),
    name: form?.formName || '未命名表单',
    fields,
  };
};

export const getWorkflowCatalogIcon = (workflow: WorkflowDefinition): React.ReactNode => {
  if (workflow.key.includes('reimburse') || workflow.key.includes('payment')) {
    return <DollarSign size={20} />;
  }
  if (workflow.key.includes('leave') || workflow.key.includes('overtime')) {
    return <Clock size={20} />;
  }
  if (workflow.key.includes('it') || workflow.key.includes('deploy')) {
    return <Monitor size={20} />;
  }
  if (workflow.key.includes('contract') || workflow.key.includes('file')) {
    return <FileBadge size={20} />;
  }
  return <GitMerge size={20} />;
};
