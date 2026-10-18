import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { ArrowRightLeft, Edit, GripVertical, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { projectApi, type ProjectWbsTask } from '@/services/api/project';
import { getErrorMessage } from '@/utils/errorMessage';
import { Field, OpsSelect } from './OperationsKit';
import { moveProjectTask, projectTaskDescendants, projectTaskRows, sameProjectTaskPlacement, type ProjectTaskMove, type ProjectTaskTreeRow } from './projectTaskTreeModel';
import './ProjectTaskTree.css';

interface ProjectTaskTreeProps {
  projectId: number;
  tasks: ProjectWbsTask[];
  editable: boolean;
  onCreate: () => void;
  onEdit: (task: ProjectWbsTask) => void;
  onRemove: (task: ProjectWbsTask) => void;
  onReload: () => Promise<ProjectWbsTask[]>;
}

function DropTarget({ move, label, disabled = false }: { move: ProjectTaskMove; label: string; disabled?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${move.position}:${move.targetId || 0}`, data: { move, label }, disabled });
  return <div ref={setNodeRef} className={`project-task-tree__drop ${isOver ? 'is-over' : ''} ${disabled ? 'is-disabled' : ''}`}
    role="group" aria-label={label} data-drop-position={move.position} data-drop-task={move.targetId || 0}>{label}</div>;
}

function TaskRow({ row, disabled, editable, dragging, excluded, onMove, onEdit, onRemove }: {
  row: ProjectTaskTreeRow; disabled: boolean; editable: boolean; dragging: boolean; excluded: Set<number>;
  onMove: (task: ProjectWbsTask) => void; onEdit: (task: ProjectWbsTask) => void; onRemove: (task: ProjectWbsTask) => void;
}) {
  const { task, depth } = row;
  const name = task.subject || task.taskNo || '未命名任务';
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: task.taskId, data: { task }, disabled: disabled || !editable,
  });
  return <li className="project-task-tree__item" data-task-id={task.taskId} data-task-depth={depth}>
    {dragging && <DropTarget move={{ position: 'before', targetId: task.taskId }} label={`放在“${name}”之前`} disabled={excluded.has(task.taskId)} />}
    <div ref={setNodeRef} className={`project-task-tree__row ${isDragging ? 'is-dragging' : ''}`}
      style={{ '--task-depth': depth - 1 } as React.CSSProperties}>
      {editable ? <button ref={setActivatorNodeRef} type="button" className="project-task-tree__handle"
        {...attributes} {...listeners} aria-label={`拖动任务：${name}`} disabled={disabled}><GripVertical size={18} /></button>
        : <span className="project-task-tree__level">{depth}层</span>}
      <div className="project-task-tree__content">
        <div className="project-task-tree__title">{task.isGroupFlag ? '分组 · ' : task.isMilestoneFlag ? '里程碑 · ' : ''}{name}</div>
        <div className="project-task-tree__meta">编号 {task.taskNo || '—'} · 第{depth}层 · 进度 {task.progress || 0}% · 权重 {task.taskWeight || 1}</div>
        <div className="project-task-tree__meta">计划 {task.plannedStart?.slice(0, 10) || '—'} 至 {task.plannedEnd?.slice(0, 10) || '—'}</div>
        <div className="project-task-tree__meta">基线 {task.baselineStart?.slice(0, 10) || '—'} 至 {task.baselineEnd?.slice(0, 10) || '—'}</div>
      </div>
      {editable && <div className="project-task-tree__actions">
        <Button variant="outline" size="sm" disabled={disabled} aria-label={`移动任务：${name}`} onClick={() => onMove(task)}><ArrowRightLeft size={15} />移动</Button>
        <Button variant="ghost" size="icon" disabled={disabled} aria-label="编辑 WBS" onClick={() => onEdit(task)}><Edit size={15} /></Button>
        <Button variant="ghost" size="icon" disabled={disabled} aria-label="删除 WBS" onClick={() => onRemove(task)}><Trash2 size={15} /></Button>
      </div>}
    </div>
    {dragging && task.isGroupFlag === 1 && <DropTarget move={{ position: 'inside', targetId: task.taskId }} label={`放入分组“${name}”`} disabled={excluded.has(task.taskId)} />}
  </li>;
}

export default function ProjectTaskTree({ projectId, tasks, editable, onCreate, onEdit, onRemove, onReload }: ProjectTaskTreeProps) {
  const [current, setCurrent] = useState(tasks);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [moving, setMoving] = useState<ProjectWbsTask | null>(null);
  const [destination, setDestination] = useState('0');
  const [placement, setPlacement] = useState('END');
  const [busy, setBusy] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [message, setMessage] = useState('');
  const saving = useRef(false);
  const mounted = useRef(true);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor));
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (!saving.current) setCurrent(tasks); }, [tasks]);
  const tree = useMemo(() => {
    try { return { rows: projectTaskRows(current), error: '' }; }
    catch (failure) { return { rows: [], error: getErrorMessage(failure, '任务树读取失败') }; }
  }, [current]);
  const blocked = busy || unconfirmed || Boolean(tree.error);
  const dragged = current.find(task => task.taskId === draggingId);
  const excluded = useMemo(() => {
    if (draggingId == null || tree.error || !current.some(task => task.taskId === draggingId)) return new Set<number>();
    return projectTaskDescendants(current, draggingId);
  }, [current, draggingId, tree.error]);
  const movingTask = moving && current.find(task => task.taskId === moving.taskId);
  const moveExcluded = movingTask?.taskId && !tree.error ? projectTaskDescendants(current, movingTask.taskId) : new Set<number>();
  const groupOptions = Object.fromEntries([['0', '最外层'], ...tree.rows
    .filter(row => row.task.isGroupFlag === 1 && !moveExcluded.has(row.task.taskId))
    .map(row => [String(row.task.taskId), `第${row.depth}层 · ${row.task.subject || row.task.taskNo}`])]);
  const positionOptions = Object.fromEntries([['END', '放在末尾'], ...tree.rows
    .filter(row => (row.task.parentTaskId || 0) === Number(destination) && !moveExcluded.has(row.task.taskId))
    .map(row => [String(row.task.taskId), `放在“${row.task.subject || row.task.taskNo}”之前`])]);

  const reload = async () => {
    if (saving.current) return;
    saving.current = true; setBusy(true);
    try {
      const fresh = await onReload();
      if (!mounted.current) return;
      setCurrent(fresh); setUnconfirmed(false); setMessage(''); setMoving(null);
    } catch (failure) {
      if (mounted.current) setMessage(getErrorMessage(failure, '任务树刷新失败，请重试'));
    } finally { saving.current = false; if (mounted.current) setBusy(false); }
  };

  const persistMove = async (sourceId: number, move: ProjectTaskMove) => {
    if (saving.current || blocked || !editable) return;
    let proposed: ProjectWbsTask[];
    try { proposed = moveProjectTask(current, sourceId, move); }
    catch (failure) { toast.error(getErrorMessage(failure, '任务移动失败')); return; }
    if (sameProjectTaskPlacement(current, proposed)) { setMoving(null); return; }
    saving.current = true; setBusy(true); setMessage(''); setMoving(null); setCurrent(proposed);
    let requestFailure: unknown;
    try {
      try {
        await projectApi.updateWbsTree(projectId, proposed.map(task => ({ taskId: task.taskId,
          parentTaskId: task.parentTaskId || 0, sortNo: task.sortNo || 0, version: task.version })));
      } catch (failure) { requestFailure = failure; }
      if (!mounted.current) return;
      const fresh = await onReload();
      if (!mounted.current) return;
      setCurrent(fresh);
      if (sameProjectTaskPlacement(fresh, proposed)) toast.success('任务层级与顺序已保存');
      else toast.error(requestFailure ? getErrorMessage(requestFailure, '任务移动未保存，已恢复最新任务树') : '任务树已有其他修改，已显示最新结果');
    } catch (failure) {
      if (mounted.current) {
        setUnconfirmed(true);
        setMessage('任务树保存状态尚未确认，请刷新后再操作。');
      }
    } finally { saving.current = false; if (mounted.current) setBusy(false); }
  };

  const finishDrag = (event: DragEndEvent) => {
    setDraggingId(null);
    const move = event.over?.data.current?.move as ProjectTaskMove | undefined;
    if (move) void persistMove(Number(event.active.id), move);
  };
  const openMove = (task: ProjectWbsTask) => { setMoving(task); setDestination(String(task.parentTaskId || 0)); setPlacement('END'); };

  return <div className="project-task-tree" aria-busy={busy}>
    <div className="project-task-tree__toolbar">
      <p className="project-task-tree__hint">拖动左侧手柄调整层级与顺序，分组内任务一起移动；最多五层。也可使用“移动”按钮。</p>
      <div className="project-task-tree__actions">
        {editable && <Button size="sm" disabled={blocked} onClick={onCreate}><Plus size={15} />新增 WBS</Button>}
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void reload()}><RefreshCw size={15} />刷新任务树</Button>
      </div>
    </div>
    {busy && <p role="status" className="project-task-tree__hint">正在保存并核对最新任务树…</p>}
    {(message || tree.error) && <p role="alert" className="project-task-tree__error">{message || tree.error}</p>}
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={event => setDraggingId(Number(event.active.id))}
      onDragCancel={() => setDraggingId(null)} onDragEnd={finishDrag}
      accessibility={{ screenReaderInstructions: { draggable: '按空格开始拖动，方向键选择位置，再按空格放下，按 Escape 取消；也可使用移动按钮。' },
        announcements: { onDragStart: ({ active }) => `开始移动${active.data.current?.task?.subject || '任务'}`,
          onDragOver: ({ over }) => over ? over.data.current?.label || '选择放置位置' : '未选择放置位置',
          onDragEnd: ({ over }) => over ? '正在保存任务位置' : '已取消任务移动', onDragCancel: () => '已取消任务移动' } }}>
      <ol className="project-task-tree__list" aria-label="项目任务列表">
        {tree.rows.map(row => <TaskRow key={row.task.taskId} row={row} editable={editable} disabled={blocked}
          dragging={draggingId != null} excluded={excluded} onMove={openMove} onEdit={onEdit} onRemove={onRemove} />)}
      </ol>
      {!tree.error && !tree.rows.length && <p className="project-task-tree__hint">暂无任务</p>}
      {draggingId != null && <DropTarget move={{ position: 'root' }} label="放到最外层末尾" />}
      <DragOverlay dropAnimation={null}>{dragged && <div className="project-task-tree__overlay">{dragged.subject || dragged.taskNo}</div>}</DragOverlay>
    </DndContext>
    <BaseDialog open={Boolean(moving)} title="移动任务" onClose={() => { if (!busy) setMoving(null); }}
      footer={<><Button variant="outline" disabled={busy} onClick={() => setMoving(null)}>取消</Button>
        <Button disabled={blocked || !movingTask?.taskId} onClick={() => movingTask?.taskId && void persistMove(movingTask.taskId,
          placement === 'END' ? Number(destination) ? { position: 'inside', targetId: Number(destination) } : { position: 'root' }
            : { position: 'before', targetId: Number(placement) })}>确认移动</Button></>}>
      <div className="project-task-tree__move-fields">
        <p className="project-task-tree__title">{moving?.subject}</p>
        {moving && !movingTask && <p role="alert">该任务已被移除，请关闭窗口并刷新任务树。</p>}
        <Field label="所属分组"><OpsSelect label="所属分组" value={destination} options={groupOptions}
          onChange={value => { setDestination(value); setPlacement('END'); }} disabled={busy} /></Field>
        <Field label="组内位置"><OpsSelect label="组内位置" value={placement} options={positionOptions} onChange={setPlacement} disabled={busy} /></Field>
      </div>
    </BaseDialog>
  </div>;
}
