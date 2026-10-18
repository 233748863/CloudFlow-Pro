import React, { useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/common/button';
import { SelectorShell, type SelectorShellOption } from '@/components/common/SelectorShell';
import type { FormReferenceFieldRenderProps } from '@/components/FormRenderer';
import { workflowDraftIdentity } from '@/hooks/useWorkflowDraft';
import { getDraftReferenceOptions, WorkflowDraftError, type DraftReferenceOption, type DraftReferencePageResult, type DraftReferenceQuery } from '@/services/api/workflow/draft';
import { getCurrentUserSnapshot } from '@/utils/authStorage';

interface WorkflowDraftReferenceFieldProps extends FormReferenceFieldRenderProps {
  identity: string;
  definitionId: string;
  contextHash: string;
  enabled: boolean;
  loadOptions?: (fieldPath: string, query: DraftReferenceQuery, signal: AbortSignal) => Promise<DraftReferencePageResult>;
}

interface ReferenceState {
  scope: string;
  options: DraftReferenceOption[];
  loading: boolean;
  error: string | null;
}

const referenceLabels = { EMPLOYEE: '员工', DEPT: '部门', POST: '岗位', POSITION: '职位', USER_MULTI: '用户', DEPT_MULTI: '部门', DICT_SELECT: '选项' };
const referenceId = (value: unknown): string => typeof value === 'string'
  ? value
  : typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : '';

export const WorkflowDraftReferenceField: React.FC<WorkflowDraftReferenceFieldProps> = ({
  identity, definitionId, contextHash, enabled, loadOptions, field, fieldPath, value, data, disabled, className, controlProps, onChange, onMultiChange,
}) => {
  const path = fieldPath || field.id;
  const multiple = field.type === 'USER_MULTI' || field.type === 'DEPT_MULTI' || field.type === 'DICT_SELECT' && field.multiple === true;
  const scope = JSON.stringify([identity, definitionId, contextHash, path, field.type, field.onlyActive, field.scopeDeptId, field.dictType]);
  const permitted = enabled && Boolean(identity && definitionId && path) && Object.hasOwn(referenceLabels, field.type)
    && workflowDraftIdentity(getCurrentUserSnapshot()) === identity;
  const canLoad = permitted && !disabled && !field.readonly;
  const departmentId = field.filterByDeptFieldId ? referenceId(data[field.filterByDeptFieldId]) : '';
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ReferenceState>({ scope, options: [], loading: canLoad, error: null });
  const mounted = useRef(false);
  const current = useRef({ scope, canLoad, departmentId, ready: false });
  current.current = { scope, canLoad, departmentId, ready: state.scope === scope && !state.loading && !state.error };

  useLayoutEffect(() => {
    const controller = new AbortController();
    mounted.current = true;
    const isCurrent = () => !controller.signal.aborted && current.current.scope === scope && current.current.canLoad
      && workflowDraftIdentity(getCurrentUserSnapshot()) === identity;
    setState((previous) => ({ scope, options: previous.scope === scope && canLoad ? previous.options : [], loading: canLoad, error: null }));
    if (canLoad) {
      const load = async () => {
        const options = new Map<string, DraftReferenceOption>();
        const pageSize = 100;
        let pageNum = 1;
        try {
          while (isCurrent()) {
            const page = loadOptions ? await loadOptions(path, { pageNum, pageSize }, controller.signal)
              : await getDraftReferenceOptions(definitionId, path, { pageNum, pageSize }, controller.signal);
            if (!isCurrent()) return;
            if (!page || !Array.isArray(page.rows) || !Number.isSafeInteger(page.total) || page.total < 0
              || page.pageNum !== pageNum || page.pageSize !== pageSize || page.rows.length > pageSize
              || (!page.rows.length && (pageNum - 1) * pageSize < page.total)) {
              throw new WorkflowDraftError('INVALID_RESPONSE');
            }
            for (const option of page.rows) {
              if (!option || typeof option.id !== 'string' || !option.id || typeof option.label !== 'string'
                || (option.departmentId != null && typeof option.departmentId !== 'string')) {
                throw new WorkflowDraftError('INVALID_RESPONSE');
              }
              options.set(option.id, { id: option.id, label: option.label, departmentId: option.departmentId });
            }
            if (pageNum * pageSize >= page.total) break;
            pageNum += 1;
          }
          if (isCurrent()) setState({ scope, options: [...options.values()], loading: false, error: null });
        } catch (error) {
          if (!isCurrent()) return;
          const message = error instanceof WorkflowDraftError && ['PERMISSION_DENIED', 'DRAFT_REFERENCE_UNAVAILABLE'].includes(error.code)
            ? error.message : '选项暂时无法加载，请重试。';
          setState({ scope, options: [], loading: false, error: message });
        }
      };
      void load();
    }
    return () => { mounted.current = false; controller.abort(); };
  }, [scope, canLoad, attempt, definitionId, path, identity, loadOptions]);

  const active = state.scope === scope && permitted;
  const loading = canLoad && (!active || state.loading);
  const error = active ? state.error : null;
  const available = active ? state.options : [];
  const filtered = departmentId ? available.filter((option) => !option.departmentId || option.departmentId === departmentId) : available;
  const selectedIds = permitted ? (multiple && Array.isArray(value) ? value.map(referenceId) : [referenceId(value)]).filter(Boolean) : [];
  const options: SelectorShellOption[] = filtered.map((option) => ({ id: option.id, label: option.label }));
  for (const selectedId of selectedIds.filter((identifier) => !options.some((option) => option.id === identifier))) {
    const restoredLabel = field.displayFieldId ? data[field.displayFieldId] : undefined;
    const label = available.find((option) => option.id === selectedId)?.label
      || (typeof restoredLabel === 'string' && restoredLabel.trim() ? restoredLabel : selectedId);
    options.push({ id: selectedId, label, disabled: true });
  }
  const canChange = () => mounted.current && canLoad && !loading && !error && current.current.ready
    && current.current.scope === scope && current.current.canLoad
    && current.current.departmentId === departmentId && workflowDraftIdentity(getCurrentUserSnapshot()) === identity;
  const label = referenceLabels[field.type as keyof typeof referenceLabels] || '记录';
  const select = (identifiers: string[]) => {
    if (multiple) onMultiChange?.(identifiers.map((identifier) => ({ id: identifier, label: available.find((option) => option.id === identifier)?.label || identifier })));
    else {
      const selected = available.find((option) => option.id === identifiers[0]);
      onChange(selected ? { id: selected.id, label: selected.label } : null);
    }
  };

  return (
    <div className="space-y-1">
      <SelectorShell
        {...controlProps}
        key={scope}
        options={options}
        value={selectedIds}
        loading={loading}
        disabled={!canLoad || loading && available.length === 0 || Boolean(error)}
        multiple={multiple}
        allowClear
        placeholder={field.placeholder || `选择${label}`}
        searchPlaceholder={`搜索${label}...`}
        emptyText={`允许范围内暂无可选${label}`}
        showAvatar={field.type === 'EMPLOYEE' || field.type === 'USER_MULTI'}
        className={className}
        onOpen={field.type === 'DICT_SELECT' ? () => {
          if (canChange()) {
            current.current.ready = false;
            setAttempt((previous) => previous + 1);
          }
        } : undefined}
        onToggle={(id) => {
          if (!canChange()) return;
          const option = filtered.find((candidate) => candidate.id === id);
          if (option) select(selectedIds.includes(id) ? selectedIds.filter((selected) => selected !== id) : multiple ? [...selectedIds, id] : [id]);
        }}
        onRemove={(id) => { if (canChange() && selectedIds.includes(id)) select(selectedIds.filter((selected) => selected !== id)); }}
      />
      {error ? (
        <div className="flex items-center gap-2">
          <p role="alert" className="text-xs text-red-500">{error}</p>
          <Button type="button" variant="ghost" size="sm" disabled={!canLoad} onClick={() => {
            if (mounted.current && current.current.scope === scope && current.current.canLoad && workflowDraftIdentity(getCurrentUserSnapshot()) === identity) {
              setAttempt((previous) => previous + 1);
            }
          }}>重试</Button>
        </div>
      ) : null}
    </div>
  );
};
