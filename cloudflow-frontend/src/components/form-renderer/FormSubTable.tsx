import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { List, useDynamicRowHeight, type ListImperativeAPI } from 'react-window';
import { ArrowDown, ArrowUp, Copy, GripVertical, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import type { FormField } from '../../types';
import type { FieldPermission } from '../../types/workflowSemantic';
import { Button } from '@/components/common/button';
import { BaseDialog } from '@/components/common/BaseDialog';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { cn } from '@/utils/cn';
import { calculateSubTableSummary, createSubTableRow, getSubTableColumns } from '@/utils/formTree';
import { formDeclaredFields, formDerivedFields, formFieldState, formScopeValues } from '@/utils/formValueRuntime';
import { FormScalarControl } from './FormScalarControl';
import type { FormErrorFocusTarget, FormRenderServices } from './types';

interface FormSubTableProps extends FormRenderServices {
  field: FormField;
  value: unknown;
  data: Record<string, unknown>;
  declared: ReadonlySet<string>;
  permissions?: FieldPermission[];
  nodeKey?: string;
  disabled: boolean;
  readonly: boolean;
  errors: Record<string, string>;
  errorFocus?: FormErrorFocusTarget;
  onChange: (value: unknown) => void;
}

interface RowContext extends FormRenderServices {
  field: FormField;
  columns: FormField[];
  rootValues: Record<string, unknown>;
  declared: ReadonlySet<string>;
  permissions?: FieldPermission[];
  nodeKey?: string;
  disabled: boolean;
  readonly: boolean;
  mobile: boolean;
  allowCopy: boolean;
  allowDelete: boolean;
  rowCount: number;
  update: (index: number, fieldId: string, value: unknown, extra?: Record<string, unknown>) => void;
  copy: (index: number) => void;
  remove: (index: number) => void;
  move: (index: number, offset: number) => void;
}

interface RowProps {
  row: Record<string, unknown>;
  index: number;
  context: RowContext;
  errors: Record<string, string>;
}

const identity = (field: FormField, row: Record<string, unknown>, index: number): string => typeof row._rowId === 'string' ? row._rowId : `${field.id}-row-${index}`;
const rowErrors = (errors: Record<string, string>, tableId: string, index: number) => Object.entries(errors).filter(([path]) => path.startsWith(`${tableId}[${index}].`));
const desktopHeaderSize = 44;
const desktopRowSize = 116;
const pointerSensorOptions = { activationConstraint: { distance: 6 } };
const keyboardSensorOptions = { coordinateGetter: sortableKeyboardCoordinates };

const sameRow = (previous: RowProps, next: RowProps) => previous.row === next.row && previous.index === next.index && previous.context === next.context
  && JSON.stringify(rowErrors(previous.errors, previous.context.field.id, previous.index)) === JSON.stringify(rowErrors(next.errors, next.context.field.id, next.index));

const RowFields = memo(function RowFields({ row, index, context, errors }: RowProps) {
  const { field, columns, rootValues, permissions, nodeKey, disabled, readonly, mobile } = context;
  const Cell = mobile ? 'div' : 'td';
  const scope = formScopeValues(columns, row, rootValues);
  const derived = formDerivedFields(columns);
  return <>
    {columns.map((column) => {
      const path = `${field.id}.${column.id}`;
      const errorPath = `${field.id}[${index}].${column.id}`;
      const state = formFieldState(column, path, scope, context.declared, { permissions, nodeKey, readonly });
      if (!state.visible) return mobile ? null : <td key={column.id} className="border-b border-[var(--cf-border)]" aria-hidden="true" />;
      const projected = { ...column, required: state.required, readonly: state.readonly || derived.has(column.id), ...(column.type === 'UPLOAD_FILE' ? { maxCount: 1 } : {}) };
      return <Cell key={column.id} id={`field-${errorPath}`} tabIndex={-1} style={mobile ? undefined : { scrollMarginTop: 'var(--cf-subtable-header-height, 44px)' }} className={cn('min-w-0 space-y-1 [overflow-wrap:anywhere]', !mobile && 'border-b border-[var(--cf-border)] p-3 align-top [&_[id^=input-]]:[scroll-margin-top:var(--cf-subtable-header-height,44px)]')}>
        <label id={`label-${errorPath}`} htmlFor={`input-${errorPath}`} className={mobile ? 'block text-xs font-medium text-cf-subtle' : 'sr-only'}>{column.label}{state.required ? <span className="text-red-500"> *</span> : null}</label>
        <FormScalarControl {...context} field={projected} fieldPath={path} inputId={`input-${errorPath}`} labelId={`label-${errorPath}`} errorId={errors[errorPath] ? `error-${errorPath}` : undefined} data={scope} value={row[column.id]} disabled={disabled} readonly={projected.readonly} invalid={Boolean(errors[errorPath])}
          onChange={(value, extra) => context.update(index, column.id, value, extra)} />
        {errors[errorPath] ? <p id={`error-${errorPath}`} role="alert" className="text-xs text-red-600">{errors[errorPath]}</p> : null}
      </Cell>;
    })}
    {!mobile ? <td className="border-b border-[var(--cf-border)] p-3 align-top"><div className="flex items-center justify-end gap-1">
      {!readonly && field.allowCopyRow !== false ? <Button type="button" variant="ghost" size="sm" className="!min-h-11 !min-w-11" disabled={disabled || !context.allowCopy} aria-label={`复制第${index + 1}行`} onClick={() => context.copy(index)}><Copy size={15} /></Button> : null}
      {!readonly && field.allowDelete !== false ? <Button type="button" variant="ghost" size="sm" className="!min-h-11 !min-w-11" disabled={disabled || !context.allowDelete} aria-label={`删除第${index + 1}行`} onClick={() => context.remove(index)}><Trash2 size={15} /></Button> : null}
    </div></td> : null}
  </>;
}, sameRow);

const TableRow = memo(function TableRow(props: RowProps) {
  const { row, index, context } = props;
  const { field, disabled, readonly, mobile } = context;
  const Row = mobile ? 'div' : 'tr';
  const IndexCell = mobile ? 'div' : 'td';
  const [menuOpen, setMenuOpen] = useState(false);
  const sorting = !readonly && field.allowSort !== false;
  const sortable = useSortable({ id: identity(field, row, index), disabled: mobile || disabled || !sorting });
  const showMenu = !readonly && (field.allowCopyRow !== false || field.allowDelete !== false);
  return <Row ref={sortable.setNodeRef} style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition, height: mobile ? undefined : desktopRowSize }}
    role={mobile ? 'group' : undefined} aria-label={`第${index + 1}条明细`} aria-rowindex={mobile ? undefined : index + 2}
    className={cn('bg-[var(--cf-surface)]', mobile && 'm-1 space-y-3 rounded-lg border border-[var(--cf-border)] p-3', sortable.isDragging && 'relative z-10 opacity-70 shadow-md')}>
    <IndexCell className={mobile ? undefined : 'border-b border-[var(--cf-border)] p-3 align-top'}>
    <div className={cn('flex items-center gap-1 pt-1 text-xs text-cf-subtle', mobile ? 'justify-between' : 'flex-col')}>
      <span>{mobile ? `第${index + 1}条明细` : index + 1}</span>
      {mobile ? <div className="flex items-center gap-1">
        {sorting ? <><Button type="button" variant="ghost" size="sm" className="!min-h-11 !min-w-11" disabled={disabled || index === 0} aria-label={`上移第${index + 1}行`} onClick={() => context.move(index, -1)}><ArrowUp size={15} /></Button>
          <Button type="button" variant="ghost" size="sm" className="!min-h-11 !min-w-11" disabled={disabled || index === context.rowCount - 1} aria-label={`下移第${index + 1}行`} onClick={() => context.move(index, 1)}><ArrowDown size={15} /></Button></> : null}
        {showMenu ? <Button type="button" variant="ghost" size="sm" className="!min-h-11 !min-w-11" disabled={disabled} aria-label={`第${index + 1}条明细操作`} aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><MoreHorizontal size={18} /></Button> : null}
      </div> : sorting ? <button type="button" {...sortable.attributes} {...sortable.listeners} disabled={disabled} aria-label={`拖动第${index + 1}行排序`} className="flex min-h-11 min-w-11 touch-none items-center justify-center rounded p-1 hover:bg-[var(--cf-surface-muted)]"><GripVertical size={15} /></button> : null}
    </div>
    </IndexCell>
    <RowFields {...props} />
    {mobile && showMenu ? <BaseDialog open={menuOpen} title={`第${index + 1}条明细操作`} onClose={() => setMenuOpen(false)} width="narrow" bodyClassName="space-y-2" zIndex={80}>
      {field.allowCopyRow !== false ? <Button type="button" variant="outline" className="!min-h-11 w-full justify-start" disabled={disabled || !context.allowCopy} aria-label={`复制第${index + 1}行`} onClick={() => { setMenuOpen(false); context.copy(index); }}><Copy size={16} className="mr-2" />复制此条明细</Button> : null}
      {field.allowDelete !== false ? <Button type="button" variant="outline" className="!min-h-11 w-full justify-start text-[var(--cf-chart-critical)]" disabled={disabled || !context.allowDelete} aria-label={`删除第${index + 1}行`} onClick={() => { setMenuOpen(false); context.remove(index); }}><Trash2 size={16} className="mr-2" />删除此条明细</Button> : null}
    </BaseDialog> : null}
  </Row>;
}, sameRow);

interface VirtualRowProps { rows: Array<Record<string, unknown>>; context: RowContext; errors: Record<string, string> }
const VirtualRow = ({ index, style, rows, context, errors }: VirtualRowProps & { index: number; style: React.CSSProperties }) => <div style={{ ...style, display: 'flow-root' }}><TableRow row={rows[index]} index={index} context={context} errors={errors} /></div>;

const useTableListGeometry = (heights: number[], header: number, captureList: (api: ListImperativeAPI | null) => void) => {
  const offsets = useMemo(() => { const values = [0]; for (const height of heights) values.push(values[values.length - 1] + height); return values; }, [heights]);
  const geometry = useRef({ offsets, header });
  const committed = useRef(geometry.current);
  geometry.current = { offsets, header };
  const list = useRef<ListImperativeAPI | null>(null);
  const attachList = useCallback((api: ListImperativeAPI | null) => {
    list.current = api;
    captureList(api ? {
      get element() { return api.element; },
      scrollToRow({ index, behavior }) {
        const current = geometry.current;
        api.element?.scrollTo({ top: current.offsets[index + (current.header ? 1 : 0)] - current.header, behavior });
      },
    } : null);
  }, [captureList]);
  useLayoutEffect(() => {
    const previous = committed.current, element = list.current?.element;
    committed.current = geometry.current;
    if (!element || !element.scrollTop || previous.offsets.length !== offsets.length) return;
    const point = element.scrollTop + previous.header;
    let anchor = 0;
    while (anchor + 1 < previous.offsets.length - 1 && previous.offsets[anchor + 1] <= point) anchor++;
    // Keep the visible row in place when earlier rows acquire their actual height.
    const adjustment = offsets[anchor] - previous.offsets[anchor] - header + previous.header;
    if (adjustment) element.scrollTop += adjustment;
  }, [offsets, header]);
  return { attachList, offsets };
};

const MobileVirtualTable = ({ rows, context, errors, captureList }: VirtualRowProps & { captureList: (api: ListImperativeAPI | null) => void }) => {
  const estimate = 80 + context.columns.length * 104;
  const rowHeight = useDynamicRowHeight({ defaultRowHeight: estimate, key: JSON.stringify([rows.map((row, index) => identity(context.field, row, index)), context.columns]) });
  const heights = useMemo(() => rows.map((_, index) => rowHeight.getRowHeight(index) ?? estimate), [rows, rowHeight, estimate]);
  const { attachList, offsets } = useTableListGeometry(heights, 0, captureList);
  return <List<VirtualRowProps> listRef={attachList} rowComponent={VirtualRow} rowCount={rows.length} rowHeight={rowHeight} rowProps={{ rows, context, errors }} overscanCount={2} defaultHeight={Math.min(estimate * 5, 600)}
    className="[&>div[aria-hidden=true]]:!h-[var(--cf-subtable-total-height)]" style={{ height: Math.min(estimate * 5, 600), '--cf-subtable-total-height': `${offsets[rows.length]}px` } as React.CSSProperties} />;
};

interface DesktopTableProps extends VirtualRowProps {
  width: number;
  start?: number;
  stop?: number;
  virtual?: boolean;
  rowOffsets?: number[];
  tableRef?: React.Ref<HTMLTableElement>;
  focusedIndex?: number;
  onFocusCapture?: React.FocusEventHandler<HTMLTableElement>;
  onBlurCapture?: React.FocusEventHandler<HTMLTableElement>;
}

const DesktopTable = ({ rows, context, errors, width, start = 0, stop = rows.length - 1, virtual = false, rowOffsets, tableRef, focusedIndex, onFocusCapture, onBlurCapture }: DesktopTableProps) => {
  const { field, columns } = context;
  const indices = Array.from({ length: Math.max(0, stop - start + 1) }, (_, offset) => start + offset);
  if (focusedIndex !== undefined && focusedIndex >= 0 && focusedIndex < rows.length && !indices.includes(focusedIndex)) indices.push(focusedIndex);
  indices.sort((left, right) => left - right);
  const gap = (from: number, to: number) => to > from ? <tr aria-hidden="true"><td colSpan={columns.length + 2} className="border-0 p-0" style={{ height: rowOffsets ? rowOffsets[to + 1] - rowOffsets[from + 1] : (to - from) * desktopRowSize }} /></tr> : null;
  return <table ref={tableRef} onFocusCapture={onFocusCapture} onBlurCapture={onBlurCapture} aria-label={field.label} aria-rowcount={virtual ? rows.length + 1 : undefined} className="table-fixed border-separate border-spacing-0"
    style={{ width, minWidth: width, ...(virtual ? { position: 'absolute', left: 0, top: 0 } : {}) }}>
    <colgroup><col style={{ width: 68 }} />{columns.map(column => <col key={column.id} style={{ width: Math.max(column.width || 160, 120) }} />)}<col style={{ width: 120 }} /></colgroup>
    <thead className={cn('bg-[var(--cf-surface-muted)] text-xs font-medium text-cf-subtle', virtual && 'sticky top-0 z-10')}>
      <tr style={{ height: desktopHeaderSize }}><th scope="col" className="px-3 text-left">序号</th>{columns.map(column => <th scope="col" key={column.id} className="px-3 py-2 text-left [overflow-wrap:anywhere]">{column.label}{column.required ? <span className="text-red-500"> *</span> : null}</th>)}<th scope="col" className="px-3 text-right">操作</th></tr>
    </thead>
    <tbody>
      {indices.map((index, position) => <React.Fragment key={identity(field, rows[index], index)}>
        {gap(position ? indices[position - 1] + 1 : 0, index)}
        <TableRow row={rows[index]} index={index} context={context} errors={errors} />
      </React.Fragment>)}
      {gap(indices.length ? indices[indices.length - 1] + 1 : 0, rows.length)}
      {!rows.length ? <tr><td colSpan={columns.length + 2} className="p-6 text-center text-sm text-cf-faint">{field.emptyText || '暂无明细，请新增一条'}</td></tr> : null}
    </tbody>
  </table>;
};

const EmptyVirtualRow = () => null;
const emptyRowProps = {};
interface RowRange { startIndex: number; stopIndex: number }
const DesktopVirtualTable = ({ rows, context, errors, width, captureList }: DesktopTableProps & { captureList: (api: ListImperativeAPI | null) => void }) => {
  const [range, setRange] = useState<RowRange>({ startIndex: 0, stopIndex: 7 });
  const [focusedIdentity, setFocusedIdentity] = useState<string>();
  const focusedIndex = focusedIdentity === undefined ? undefined : rows.findIndex((row, index) => identity(context.field, row, index) === focusedIdentity);
  const table = useRef<HTMLTableElement>(null);
  const [sizes, setSizes] = useState({ header: desktopHeaderSize, rows: new Map<Record<string, unknown>, number>() });
  const heights = useMemo(() => [sizes.header, ...rows.map(row => sizes.rows.get(row) ?? desktopRowSize)], [sizes, rows]);
  const { attachList, offsets } = useTableListGeometry(heights, sizes.header, captureList);
  const rowHeight = useCallback((index: number) => heights[index], [heights]);
  useLayoutEffect(() => {
    const element = table.current;
    if (!element) return;
    const measure = () => {
      const header = element.tHead?.getBoundingClientRect().height || desktopHeaderSize;
      const measured = [...element.querySelectorAll<HTMLTableRowElement>('tbody tr[aria-rowindex]')].map(row => ({
        value: rows[Number(row.getAttribute('aria-rowindex')) - 2], height: row.getBoundingClientRect().height,
      })).filter(row => row.value && row.height > 0);
      if (!element.getBoundingClientRect().height) return;
      setSizes(previous => {
        const currentRows = new Set(rows);
        const next = new Map([...previous.rows].filter(([row]) => currentRows.has(row)));
        for (const row of measured) next.set(row.value, row.height);
        if (previous.header === header && next.size === previous.rows.size && [...next].every(([row, height]) => previous.rows.get(row) === height)) return previous;
        return { header, rows: next };
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (element.tHead) observer.observe(element.tHead);
    element.querySelectorAll('tbody tr[aria-rowindex]').forEach(row => observer.observe(row));
    return () => observer.disconnect();
  }, [rows, context.columns, range, focusedIndex]);
  const onRowsRendered = useCallback((_visible: RowRange, all: RowRange) => {
    setRange(previous => previous.startIndex === all.startIndex && previous.stopIndex === all.stopIndex ? previous : all);
  }, []);
  // Keep react-window's spacer outside the native table; only legal rows enter tbody.
  return <List listRef={attachList} role="presentation" rowComponent={EmptyVirtualRow} rowProps={emptyRowProps} rowCount={rows.length + 1}
    className="[&>div[aria-hidden=true]]:!h-[var(--cf-subtable-total-height)]"
    rowHeight={rowHeight} overscanCount={2} defaultHeight={580} style={{ height: 580, minWidth: width, '--cf-subtable-total-height': `${offsets[rows.length + 1]}px`, '--cf-subtable-header-height': `${sizes.header}px` } as React.CSSProperties} onRowsRendered={onRowsRendered}>
    <DesktopTable tableRef={table} rows={rows} context={context} errors={errors} width={width} rowOffsets={offsets} focusedIndex={focusedIndex}
      onFocusCapture={event => {
        const row = (event.target as HTMLElement).closest('tr[aria-rowindex]');
        const index = Number(row?.getAttribute('aria-rowindex')) - 2;
        if (rows[index]) setFocusedIdentity(identity(context.field, rows[index], index));
      }}
      onBlurCapture={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setFocusedIdentity(undefined); }}
      virtual start={Math.max(0, range.startIndex - 1)} stop={Math.min(rows.length - 1, Math.max(0, range.stopIndex - 1))} />
  </List>;
};

export const FormSubTable: React.FC<FormSubTableProps> = (props) => {
  const { field, value, data, disabled, readonly, permissions, nodeKey, errors } = props;
  const breakpoint = useBreakpoint();
  const mobile = props.layoutMode === 'mobile' || props.layoutMode !== 'desktop' && breakpoint === 'mobile';
  const rows = useMemo(() => Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => row !== null && typeof row === 'object' && !Array.isArray(row)) : [], [value]);
  const current = useRef({ props, rows });
  current.current = { props, rows };
  const list = useRef<ListImperativeAPI>(null);
  const [listElement, setListElement] = useState<HTMLDivElement | null>(null);
  const captureList = useCallback((api: ListImperativeAPI | null) => {
    list.current = api;
    setListElement(api?.element || null);
  }, []);
  const sensors = useSensors(useSensor(PointerSensor, pointerSensorOptions), useSensor(KeyboardSensor, keyboardSensorOptions));
  const columns = useMemo(() => getSubTableColumns(field).filter((column) => !permissions?.some((permission) => permission.nodeKey === (nodeKey || '__START__') && permission.fieldId === `${field.id}.${column.id}` && permission.visibleFlag === false)), [field, permissions, nodeKey]);
  const rootKey = JSON.stringify(Object.fromEntries(Object.entries(data).filter(([fieldId]) => fieldId !== field.id)));
  const rootValues = useMemo(() => Object.fromEntries(Object.entries(data).filter(([fieldId]) => fieldId !== field.id)), [rootKey]);
  const declaredKey = JSON.stringify([...props.declared]);
  const declared = useMemo(() => new Set([...props.declared, ...formDeclaredFields(columns)]), [declaredKey, columns]);
  const maximum = Math.min(field.maxRows ?? 100, 500);
  const minimum = field.minRows ?? 0;
  const identitiesKey = JSON.stringify(rows.map((row, index) => identity(field, row, index)));
  const identities = useMemo<string[]>(() => JSON.parse(identitiesKey), [identitiesKey]);
  const update = useCallback((index: number, columnId: string, next: unknown, extra: Record<string, unknown> = {}) => {
    const state = current.current;
    if (state.props.disabled || state.props.readonly) return;
    state.props.onChange(state.rows.map((row, rowIndex) => rowIndex === index ? { ...row, [columnId]: next, ...extra } : row));
  }, []);
  const copy = useCallback((index: number) => {
    const state = current.current;
    if (state.props.disabled || state.props.readonly || state.props.field.allowCopyRow === false || state.rows.length >= Math.min(state.props.field.maxRows ?? 100, 500)) return;
    const next = [...state.rows];
    next.splice(index + 1, 0, { ...structuredClone(state.rows[index]), _rowId: crypto.randomUUID() });
    state.props.onChange(next);
  }, []);
  const remove = useCallback((index: number) => {
    const state = current.current;
    if (state.props.disabled || state.props.readonly || state.props.field.allowDelete === false || state.rows.length <= (state.props.field.minRows ?? 0)) return;
    state.props.onChange(state.rows.filter((_, rowIndex) => rowIndex !== index));
  }, []);
  const move = useCallback((index: number, offset: number) => {
    const state = current.current;
    const target = index + offset;
    if (state.props.disabled || state.props.readonly || state.props.field.allowSort === false || index < 0 || index >= state.rows.length || target < 0 || target >= state.rows.length) return;
    state.props.onChange(arrayMove(state.rows, index, target));
  }, []);
  const context = useMemo<RowContext>(() => ({ field, columns, rootValues, declared, permissions, nodeKey, disabled, readonly, mobile,
    allowCopy: rows.length < maximum, allowDelete: rows.length > minimum, rowCount: rows.length, update, copy, remove, move,
    renderReferenceField: props.renderReferenceField, renderUploadField: props.renderUploadField, idValuesAsStrings: props.idValuesAsStrings,
  }), [field, columns, rootValues, declared, permissions, nodeKey, disabled, readonly, mobile, rows.length, maximum, minimum, update, copy, remove, move, props.renderReferenceField, props.renderUploadField, props.idValuesAsStrings]);
  const firstError = props.errorFocus?.path.startsWith(`${field.id}[`) && errors[props.errorFocus.path] ? props.errorFocus.path : undefined;
  useEffect(() => {
    if (!firstError || rows.length <= 30) return;
    const rowIndex = Number(firstError.slice(firstError.indexOf('[') + 1, firstError.indexOf(']')));
    const element = listElement;
    if (!element || rowIndex < 0 || rowIndex >= rows.length) return;
    let frame = 0;
    let revealed = false;
    const reveal = () => {
      if (revealed || element.closest('details:not([open])') || !element.getBoundingClientRect().height) return;
      list.current?.scrollToRow({ index: rowIndex, align: 'center', behavior: 'instant' });
      revealed = true;
      resize.disconnect();
    };
    const resize = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(reveal); });
    resize.observe(element);
    frame = requestAnimationFrame(reveal);
    return () => { cancelAnimationFrame(frame); resize.disconnect(); };
  }, [firstError, props.errorFocus?.request, rows.length, listElement, mobile]);
  const summaries = useMemo(() => {
    try { return calculateSubTableSummary({ ...field, summaryColumns: field.summaryColumns?.filter((summary) => columns.some((column) => column.id === summary.columnId)) }, rows); }
    catch { return {}; }
  }, [field, columns, rows]);
  const tableWidth = 188 + columns.reduce((total, column) => total + Math.max(column.width || 160, 120), 0);
  return <section className={cn('rounded-lg border border-[var(--cf-border)]', mobile ? 'overflow-visible' : 'overflow-hidden')} aria-label={field.label}>
    <div className="flex items-center justify-between gap-3 border-b border-[var(--cf-border)] bg-[var(--cf-surface-muted)] px-3 py-2">
      <span className="text-xs text-cf-subtle">{rows.length} / {maximum} 条明细{minimum > 0 ? ` · 至少${minimum}条` : ''}</span>
    </div>
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
          if (!over || mobile || disabled || readonly || field.allowSort === false || active.id === over.id) return;
          const from = rows.findIndex((row, index) => identity(field, row, index) === active.id);
          const to = rows.findIndex((row, index) => identity(field, row, index) === over.id);
          if (from >= 0 && to >= 0) props.onChange(arrayMove(rows, from, to));
        }}>
      <SortableContext items={identities} strategy={verticalListSortingStrategy}>
        <div className="overflow-x-auto">
          {mobile ? <>
            {rows.length > 30 ? <MobileVirtualTable rows={rows} context={context} errors={errors} captureList={captureList} />
              : rows.map((row, index) => <TableRow key={identity(field, row, index)} row={row} index={index} context={context} errors={errors} />)}
            {!rows.length ? <p className="p-6 text-center text-sm text-cf-faint">{field.emptyText || '暂无明细，请新增一条'}</p> : null}
          </> : rows.length > 30 ? <DesktopVirtualTable rows={rows} context={context} errors={errors} width={tableWidth} captureList={captureList} />
            : <DesktopTable rows={rows} context={context} errors={errors} width={tableWidth} />}
        </div>
      </SortableContext>
    </DndContext>
    {Object.keys(summaries).length || !readonly && field.allowAdd !== false ? <div data-subtable-footer className={cn('flex flex-wrap items-center justify-between gap-3 rounded-b-lg border-t border-[var(--cf-border)] bg-[var(--cf-surface-muted)] px-3 py-2 text-xs text-cf-subtle', mobile && 'sticky bottom-0 z-10')}>
      <div className="flex min-w-0 max-w-full flex-wrap gap-x-6 gap-y-1 [overflow-wrap:anywhere]">{Object.entries(summaries).map(([columnId, total]) => <span key={columnId} className="min-w-0 max-w-full">{columns.find((column) => column.id === columnId)?.label} · {field.summaryColumns?.find((summary) => summary.columnId === columnId)?.aggregation === 'AVG' ? '平均' : field.summaryColumns?.find((summary) => summary.columnId === columnId)?.aggregation === 'COUNT' ? '计数' : '合计'} <strong className="font-semibold tabular-nums text-cf-title">{total}</strong></span>)}</div>
      {!readonly && field.allowAdd !== false ? <Button type="button" variant="outline" size="sm" className={cn('!min-h-11', mobile && 'w-full')} aria-label="新增明细" disabled={disabled || rows.length >= maximum} onClick={() => props.onChange([...rows, createSubTableRow(field)])}><Plus size={14} className="mr-1" />新增明细</Button> : null}
    </div> : null}
  </section>;
};
