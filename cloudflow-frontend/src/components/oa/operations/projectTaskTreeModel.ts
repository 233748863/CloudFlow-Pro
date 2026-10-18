import type { ProjectWbsTask } from '@/services/api/project';

export type StoredProjectTask = ProjectWbsTask & { taskId: number; version: number };
export type ProjectTaskMove = { position: 'before' | 'after' | 'inside' | 'root'; targetId?: number };
export type ProjectTaskTreeRow = { task: StoredProjectTask; depth: number };

const parentOf = (task: ProjectWbsTask) => task.parentTaskId || 0;
const compareTasks = (left: ProjectWbsTask, right: ProjectWbsTask) =>
  (left.sortNo || 0) - (right.sortNo || 0) || (left.taskId || 0) - (right.taskId || 0);

export function projectTaskRows(tasks: ProjectWbsTask[]): ProjectTaskTreeRow[] {
  const lookup = new Map<number, StoredProjectTask>();
  const children = new Map<number, StoredProjectTask[]>();
  for (const task of tasks) {
    if (!Number.isSafeInteger(task.taskId) || !task.taskId || !Number.isSafeInteger(task.version) || Number(task.version) < 0
      || lookup.has(task.taskId)) throw new Error('任务记录不完整，请刷新任务树后重试');
    const stored = task as StoredProjectTask;
    lookup.set(stored.taskId, stored);
    const siblings = children.get(parentOf(stored)) || [];
    siblings.push(stored);
    children.set(parentOf(stored), siblings);
  }
  for (const task of lookup.values()) {
    const parent = parentOf(task);
    if (parent && (!lookup.has(parent) || lookup.get(parent)?.isGroupFlag !== 1)) {
      throw new Error('父分组不存在，请刷新任务树后重试');
    }
  }
  for (const siblings of children.values()) siblings.sort(compareTasks);
  const rows: ProjectTaskTreeRow[] = [];
  const visited = new Set<number>();
  const walk = (parent: number, depth: number) => {
    for (const task of children.get(parent) || []) {
      if (visited.has(task.taskId)) throw new Error('任务树存在循环引用');
      if (depth > 5) throw new Error('项目任务最多五层');
      visited.add(task.taskId);
      rows.push({ task, depth });
      walk(task.taskId, depth + 1);
    }
  };
  walk(0, 1);
  if (visited.size !== tasks.length) throw new Error('任务树存在循环引用');
  return rows;
}

export function projectTaskDescendants(tasks: ProjectWbsTask[], sourceId: number): Set<number> {
  const rows = projectTaskRows(tasks);
  const index = rows.findIndex(row => row.task.taskId === sourceId);
  if (index < 0) throw new Error('待移动任务不存在，请刷新后重试');
  const descendants = new Set<number>([sourceId]);
  for (let cursor = index + 1; cursor < rows.length && rows[cursor].depth > rows[index].depth; cursor++) {
    descendants.add(rows[cursor].task.taskId);
  }
  return descendants;
}

export function moveProjectTask(tasks: ProjectWbsTask[], sourceId: number, move: ProjectTaskMove): StoredProjectTask[] {
  const ordered = projectTaskRows(tasks).map(row => ({ ...row.task }));
  const source = ordered.find(task => task.taskId === sourceId);
  if (!source) throw new Error('待移动任务不存在，请刷新后重试');
  const excluded = projectTaskDescendants(ordered, sourceId);
  const target = ordered.find(task => task.taskId === move.targetId);
  if (move.position !== 'root' && (!target || excluded.has(target.taskId))) {
    throw new Error('任务不能移到自身或子任务中');
  }
  if (move.position === 'inside' && target?.isGroupFlag !== 1) throw new Error('只有分组任务可以包含子任务');
  const newParent = move.position === 'root' ? 0 : move.position === 'inside' ? target!.taskId : parentOf(target!);
  const siblings = ordered.filter(task => task.taskId !== sourceId && parentOf(task) === newParent);
  const targetIndex = move.position === 'before' || move.position === 'after'
    ? siblings.findIndex(task => task.taskId === target!.taskId) : siblings.length;
  if (targetIndex < 0) throw new Error('移动位置已变化，请刷新任务树后重试');
  source.parentTaskId = newParent;
  siblings.splice(targetIndex + (move.position === 'after' ? 1 : 0), 0, source);
  siblings.forEach((task, index) => { task.sortNo = index + 1; });
  const previousParent = parentOf(tasks.find(task => task.taskId === sourceId)!);
  if (previousParent !== newParent) {
    ordered.filter(task => parentOf(task) === previousParent).forEach((task, index) => { task.sortNo = index + 1; });
  }
  return projectTaskRows(ordered).map(row => row.task);
}

export function sameProjectTaskPlacement(left: ProjectWbsTask[], right: ProjectWbsTask[]): boolean {
  if (left.length !== right.length) return false;
  const expected = new Map(right.map(task => [task.taskId, task]));
  return left.every(task => {
    const other = expected.get(task.taskId);
    return other != null && parentOf(task) === parentOf(other) && (task.sortNo || 0) === (other.sortNo || 0);
  });
}
