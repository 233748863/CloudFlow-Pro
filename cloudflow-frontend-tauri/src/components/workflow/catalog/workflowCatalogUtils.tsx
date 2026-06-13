import React from 'react';
import { Clock, DollarSign, FileBadge, GitMerge, Monitor } from 'lucide-react';
import type { FormDefinition, WorkflowDefinition } from '@/types';
import { mapBackendFormDefinition } from '@/utils/formDefinition';

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
    // 兼容后端历史上使用逗号拼接标签的旧数据。
  }

  return rawTags
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

export const mapWorkflowBackendForm = (form: any): FormDefinition =>
  mapBackendFormDefinition(form) ?? {
    id: '',
    name: '未命名表单',
    fields: [],
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
