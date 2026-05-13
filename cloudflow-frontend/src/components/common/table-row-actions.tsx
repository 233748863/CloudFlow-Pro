import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Button } from './button';

export type TableRowActionPriority =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'danger';

export type TableRowActionTone =
  | 'primary'
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

export type ActionSemanticKey =
  | 'view'
  | 'edit'
  | 'submit'
  | 'process'
  | 'bind'
  | 'writeoff'
  | 'send'
  | 'enable'
  | 'disable'
  | 'reset'
  | 'copy'
  | 'open'
  | 'export'
  | 'archive'
  | 'void'
  | 'delete'
  | 'custom';

export interface ActionPreset {
  semantic: ActionSemanticKey;
  label: string;
  priority: TableRowActionPriority;
  tone: TableRowActionTone;
}

export interface TableRowActionItem {
  key?: React.Key;
  label: string;
  icon?: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  hidden?: boolean;
  tone?: TableRowActionTone;
  title?: string;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
  priority?: TableRowActionPriority;
  menuOnly?: boolean;
  isPrimary?: boolean;
  group?: string;
  tooltip?: string;
  permissionKey?: string;
  semantic?: ActionSemanticKey;
  danger?: boolean;
}

export interface TableRowActionsProps {
  actions: TableRowActionItem[];
  align?: 'start' | 'center' | 'end';
  wrap?: boolean;
  iconOnly?: boolean;
  className?: string;
  emptyText?: string;
  mode?: 'inline' | 'stacked' | 'auto';
  maxVisibleActions?: number;
  overflowLabel?: string;
  compactAt?: number;
  buttonLayout?: 'stacked' | 'compact';
}

const DEFAULT_ACTION_PRESETS: Record<ActionSemanticKey, ActionPreset> = {
  view: { semantic: 'view', label: '查看详情', priority: 'primary', tone: 'neutral' },
  edit: { semantic: 'edit', label: '编辑', priority: 'primary', tone: 'primary' },
  submit: { semantic: 'submit', label: '提交', priority: 'secondary', tone: 'success' },
  process: { semantic: 'process', label: '处理', priority: 'primary', tone: 'primary' },
  bind: { semantic: 'bind', label: '绑定', priority: 'secondary', tone: 'info' },
  writeoff: { semantic: 'writeoff', label: '核销', priority: 'secondary', tone: 'info' },
  send: { semantic: 'send', label: '发送', priority: 'secondary', tone: 'info' },
  enable: { semantic: 'enable', label: '启用', priority: 'secondary', tone: 'success' },
  disable: { semantic: 'disable', label: '停用', priority: 'danger', tone: 'warning' },
  reset: { semantic: 'reset', label: '重置', priority: 'secondary', tone: 'warning' },
  copy: { semantic: 'copy', label: '复制', priority: 'tertiary', tone: 'neutral' },
  open: { semantic: 'open', label: '打开', priority: 'tertiary', tone: 'info' },
  export: { semantic: 'export', label: '导出', priority: 'tertiary', tone: 'neutral' },
  archive: { semantic: 'archive', label: '归档', priority: 'danger', tone: 'warning' },
  void: { semantic: 'void', label: '作废', priority: 'danger', tone: 'danger' },
  delete: { semantic: 'delete', label: '删除', priority: 'danger', tone: 'danger' },
  custom: { semantic: 'custom', label: '操作', priority: 'secondary', tone: 'neutral' },
};

const toneClassMap: Record<TableRowActionTone, string> = {
  primary: 'text-cyan-700 hover:bg-cyan-50 hover:text-cyan-800 dark:text-cyan-300 dark:hover:bg-cyan-950/40 dark:hover:text-cyan-100',
  neutral: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100',
  success: 'text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-100',
  warning: 'text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/40 dark:hover:text-amber-100',
  danger: 'text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40 dark:hover:text-rose-100',
  info: 'text-sky-700 hover:bg-sky-50 hover:text-sky-800 dark:text-sky-300 dark:hover:bg-sky-950/40 dark:hover:text-sky-100',
};

const priorityRank: Record<TableRowActionPriority, number> = {
  primary: 1,
  secondary: 2,
  tertiary: 3,
  danger: 4,
};

const alignClassMap: Record<NonNullable<TableRowActionsProps['align']>, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
};

const OVERFLOW_MENU_WIDTH = 176;
const OVERFLOW_MENU_GAP = 8;
const OVERFLOW_MENU_VIEWPORT_PADDING = 12;

interface OverflowMenuPlacement {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  ready: boolean;
}

const getPreset = (action: TableRowActionItem) =>
  action.semantic ? DEFAULT_ACTION_PRESETS[action.semantic] : DEFAULT_ACTION_PRESETS.custom;

const resolvePriority = (action: TableRowActionItem) =>
  action.priority
  ?? (action.danger ? 'danger' : undefined)
  ?? (action.isPrimary ? 'primary' : undefined)
  ?? getPreset(action).priority;

const resolveTone = (action: TableRowActionItem) =>
  action.tone
  ?? (action.danger ? 'danger' : undefined)
  ?? getPreset(action).tone;

const sortActions = (actions: TableRowActionItem[]) =>
  [...actions].sort((left, right) => {
    const leftPriority = priorityRank[resolvePriority(left)];
    const rightPriority = priorityRank[resolvePriority(right)];
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    if (Boolean(right.isPrimary) !== Boolean(left.isPrimary)) {
      return right.isPrimary ? 1 : -1;
    }
    return left.label.localeCompare(right.label, 'zh-CN');
  });

function useActionLayout(actions: TableRowActionItem[], maxVisibleActions: number) {
  return useMemo(() => {
    const sorted = sortActions(actions.filter((action) => !action.hidden));
    const directCandidates = sorted.filter((action) => !action.menuOnly);
    const explicitPrimary = directCandidates.filter((action) => action.isPrimary);
    const primaryVisible = explicitPrimary.slice(0, Math.min(2, explicitPrimary.length));
    const visibleKeys = new Set(primaryVisible.map((action) => action.key ?? action.label));

    const visibleActions = [...primaryVisible];
    for (const action of directCandidates) {
      const key = action.key ?? action.label;
      if (visibleKeys.has(key)) {
        continue;
      }
      if (visibleActions.length >= maxVisibleActions) {
        break;
      }
      visibleActions.push(action);
      visibleKeys.add(key);
    }

    const overflowActions = sorted.filter((action) => {
      const key = action.key ?? action.label;
      return !visibleKeys.has(key);
    });

    return {
      visibleActions,
      overflowActions,
    };
  }, [actions, maxVisibleActions]);
}

interface ActionItemButtonProps {
  action: TableRowActionItem;
  layout: 'stacked' | 'menu' | 'compact';
}

function ActionItemButton({ action, layout }: ActionItemButtonProps) {
  const tone = resolveTone(action);
  const label = action.label || getPreset(action).label;
  const passthroughClassName = layout === 'menu'
    ? action.className
    : action.className
      ?.split(/\s+/)
      .filter((token) => token && !/^(border|bg-|hover:bg-|dark:border|dark:bg-|shadow|ring)/.test(token))
      .join(' ');
  return (
    <Button
      type={action.type ?? 'button'}
      variant="ghost"
      size="sm"
      onClick={action.onClick}
      disabled={action.disabled}
      title={action.tooltip ?? action.title ?? label}
      aria-label={action.tooltip ?? action.title ?? label}
      className={cn(
        layout === 'stacked'
          ? 'h-auto min-w-[3.75rem] flex-col gap-0.5 rounded-xl border-0 px-2 py-1.5 text-[11px] font-medium shadow-none'
          : layout === 'compact'
            ? 'h-8 min-w-0 gap-1 rounded-lg px-2.5 text-xs font-medium shadow-none'
            : 'h-auto w-full justify-start gap-2 rounded-lg px-3 py-2 text-xs font-medium shadow-none',
        'disabled:border-transparent disabled:bg-transparent disabled:text-slate-300 disabled:hover:bg-transparent',
        toneClassMap[tone],
        passthroughClassName,
      )}
    >
      {action.icon ? <span className="shrink-0">{action.icon}</span> : null}
      <span className={cn(layout === 'stacked' ? 'leading-tight text-center whitespace-normal' : 'leading-none whitespace-nowrap')}>
        {label}
      </span>
    </Button>
  );
}

interface ActionOverflowMenuProps {
  actions: TableRowActionItem[];
  label: string;
  compact?: boolean;
}

function ActionOverflowMenu({ actions, label, compact = false }: ActionOverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<OverflowMenuPlacement>({
    top: 0,
    left: 0,
    width: OVERFLOW_MENU_WIDTH,
    maxHeight: 320,
    ready: false,
  });
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPlacement((current) => ({ ...current, ready: false }));
      return undefined;
    }

    const updatePlacement = () => {
      const trigger = wrapperRef.current;
      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(OVERFLOW_MENU_WIDTH, viewportWidth - OVERFLOW_MENU_VIEWPORT_PADDING * 2);
      const estimatedHeight = Math.min(320, actions.length * 42 + 12);
      const menuHeight = menuRef.current?.offsetHeight || estimatedHeight;
      const spaceBelow = viewportHeight - rect.bottom - OVERFLOW_MENU_VIEWPORT_PADDING;
      const spaceAbove = rect.top - OVERFLOW_MENU_VIEWPORT_PADDING;
      const dropUp = spaceBelow < Math.min(menuHeight, 180) && spaceAbove > spaceBelow;
      const availableHeight = Math.max(120, (dropUp ? spaceAbove : spaceBelow) - OVERFLOW_MENU_GAP);
      const renderedHeight = Math.min(menuHeight, availableHeight);
      const top = dropUp
        ? Math.max(OVERFLOW_MENU_VIEWPORT_PADDING, rect.top - renderedHeight - OVERFLOW_MENU_GAP)
        : rect.bottom + OVERFLOW_MENU_GAP;
      let left = rect.right - width;

      if (left < OVERFLOW_MENU_VIEWPORT_PADDING) {
        left = OVERFLOW_MENU_VIEWPORT_PADDING;
      }
      if (left + width > viewportWidth - OVERFLOW_MENU_VIEWPORT_PADDING) {
        left = Math.max(OVERFLOW_MENU_VIEWPORT_PADDING, viewportWidth - width - OVERFLOW_MENU_VIEWPORT_PADDING);
      }

      setPlacement({
        top,
        left,
        width,
        maxHeight: availableHeight,
        ready: true,
      });
    };

    updatePlacement();
    const frame = window.requestAnimationFrame(updatePlacement);
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
    };
  }, [actions.length, open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const handlePointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!wrapperRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', handlePointer);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handlePointer);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  if (!actions.length) {
    return null;
  }

  const menu = open && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={menuRef}
        className="fixed z-[160] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-800 dark:bg-slate-950"
        style={{
          top: placement.top,
          left: placement.left,
          width: placement.width,
          maxHeight: placement.maxHeight,
          visibility: placement.ready ? 'visible' : 'hidden',
        }}
      >
        <div className="flex flex-col gap-1">
          {actions.map((action, index) => (
            <div key={action.key ?? `${action.label}-${index}`} onClick={() => setOpen(false)}>
              <ActionItemButton action={action} layout="menu" />
            </div>
          ))}
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <div ref={wrapperRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          compact
            ? 'h-8 min-w-0 gap-1 rounded-lg px-2.5 text-xs font-medium'
            : 'h-auto min-w-[3.75rem] flex-col gap-0.5 rounded-xl px-2 py-1.5 text-[11px] font-medium',
          'border-0 text-slate-600 shadow-none hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100',
        )}
        title={label}
        aria-label={label}
      >
        <MoreHorizontal size={16} />
        <span className={cn(compact ? 'leading-none whitespace-nowrap' : 'leading-tight text-center whitespace-normal')}>{label}</span>
      </Button>
      {menu}
    </div>
  );
}

export function ActionCell({
  actions,
  className,
  align = 'end',
  maxVisibleActions = 2,
  overflowLabel = '更多操作',
  buttonLayout = 'stacked',
}: {
  actions: TableRowActionItem[];
  className?: string;
  align?: 'start' | 'center' | 'end';
  maxVisibleActions?: number;
  overflowLabel?: string;
  buttonLayout?: 'stacked' | 'compact';
}) {
  const { visibleActions, overflowActions } = useActionLayout(actions, maxVisibleActions);
  return (
    <div className={cn('flex items-start gap-1.5', alignClassMap[align], className)}>
      {visibleActions.map((action, index) => (
        <ActionItemButton key={action.key ?? `${action.label}-${index}`} action={action} layout={buttonLayout} />
      ))}
      <ActionOverflowMenu actions={overflowActions} label={overflowLabel} compact={buttonLayout === 'compact'} />
    </div>
  );
}

export function ActionToolbar({
  actions,
  className,
}: {
  actions: TableRowActionItem[];
  className?: string;
}) {
  const visibleActions = actions.filter((action) => !action.hidden);
  if (!visibleActions.length) {
    return null;
  }
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {visibleActions.map((action, index) => (
        <Button
          key={action.key ?? `${action.label}-${index}`}
          type={action.type ?? 'button'}
          variant={resolvePriority(action) === 'primary' ? 'default' : resolvePriority(action) === 'danger' ? 'destructive' : 'outline'}
          size="sm"
          onClick={action.onClick}
          disabled={action.disabled}
          title={action.tooltip ?? action.title ?? action.label}
          className={cn('gap-1.5', action.className)}
        >
          {action.icon ? <span className="shrink-0">{action.icon}</span> : null}
          <span>{action.label}</span>
        </Button>
      ))}
    </div>
  );
}

export function TableRowActions({
  actions,
  align = 'start',
  wrap = false,
  iconOnly = false,
  className,
  emptyText = '-',
  mode = 'auto',
  maxVisibleActions,
  overflowLabel = '更多操作',
  compactAt,
  buttonLayout = 'stacked',
}: TableRowActionsProps) {
  const visibleActions = actions.filter((action) => !action.hidden);

  if (!visibleActions.length) {
    return <span className="text-sm text-slate-300">{emptyText}</span>;
  }

  const resolvedMode = mode === 'inline'
    ? 'inline'
    : mode === 'stacked'
      ? 'stacked'
      : 'stacked';

  if (resolvedMode === 'inline') {
    return (
      <div
        className={cn(
          'flex items-center gap-1.5',
          wrap && 'flex-wrap',
          alignClassMap[align],
          className,
        )}
      >
        {sortActions(visibleActions).map((action, index) => (
          <Button
            key={action.key ?? `${action.label}-${index}`}
            type={action.type ?? 'button'}
            variant="ghost"
            size="sm"
            onClick={action.onClick}
            disabled={action.disabled}
            title={action.tooltip ?? action.title ?? action.label}
            aria-label={action.tooltip ?? action.title ?? action.label}
            className={cn(
              'gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium shadow-none',
              toneClassMap[resolveTone(action)],
              action.className,
            )}
          >
            {action.icon ? <span className="shrink-0">{action.icon}</span> : null}
            <span className="leading-none whitespace-nowrap">{action.label}</span>
          </Button>
        ))}
      </div>
    );
  }

  const computedMaxVisibleActions = maxVisibleActions
    ?? (compactAt && visibleActions.length >= compactAt ? 2 : visibleActions.length <= 2 ? visibleActions.length : visibleActions.length <= 4 ? 3 : 2);

  return (
    <ActionCell
      actions={visibleActions}
      align={align}
      maxVisibleActions={computedMaxVisibleActions}
      overflowLabel={overflowLabel}
      buttonLayout={buttonLayout}
      className={className}
    />
  );
}

