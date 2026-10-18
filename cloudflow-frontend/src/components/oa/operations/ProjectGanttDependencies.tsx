import React, { useEffect, useId, useState } from 'react';
import type { ProjectDependency, ProjectWbsTask } from '@/services/api/project';

export const projectDependencyLabels: Record<string, string> = {
  FINISH_TO_START: '前置完成后开始',
  START_TO_START: '前置开始后开始',
  FINISH_TO_FINISH: '前置完成后完成',
};

interface DependencyLine {
  id: number;
  predecessorId: number;
  successorId: number;
  type: string;
  title: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}

export default function ProjectGanttDependencies({ container, dependencies, tasks }: {
  container: React.RefObject<HTMLDivElement | null>;
  dependencies: ProjectDependency[];
  tasks: ProjectWbsTask[];
}) {
  const markerId = 'project-dependency-' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [layout, setLayout] = useState<{ width: number; height: number; lines: DependencyLine[] }>({ width: 0, height: 0, lines: [] });
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let active = true;
    let frame = 0;
    const measure = () => {
      if (!active) return;
      const bounds = element.getBoundingClientRect();
      const lines: DependencyLine[] = [];
      for (const dependency of dependencies) {
        if (!dependency.dependencyId || !dependency.predecessorTaskId || !dependency.successorTaskId) continue;
        const source = element.querySelector<HTMLElement>(`[data-gantt-task="${dependency.predecessorTaskId}"]`);
        const target = element.querySelector<HTMLElement>(`[data-gantt-task="${dependency.successorTaskId}"]`);
        if (!source || !target) continue;
        const sourceBounds = source.getBoundingClientRect();
        const targetBounds = target.getBoundingClientRect();
        if (!sourceBounds.width || !targetBounds.width) continue;
        const type = dependency.dependencyType || 'FINISH_TO_START';
        const predecessor = tasks.find(task => task.taskId === dependency.predecessorTaskId);
        const successor = tasks.find(task => task.taskId === dependency.successorTaskId);
        lines.push({ id: dependency.dependencyId, predecessorId: dependency.predecessorTaskId,
          successorId: dependency.successorTaskId, type,
          title: `${predecessor?.subject || '前置任务'} → ${successor?.subject || '后置任务'}；${projectDependencyLabels[type] || type}；间隔 ${dependency.lagDays || 0} 天`,
          sourceX: (type === 'START_TO_START' ? sourceBounds.left : sourceBounds.right) - bounds.left,
          sourceY: sourceBounds.top + sourceBounds.height / 2 - bounds.top,
          targetX: (type === 'FINISH_TO_FINISH' ? targetBounds.right : targetBounds.left) - bounds.left,
          targetY: targetBounds.top + targetBounds.height / 2 - bounds.top });
      }
      const next = { width: element.scrollWidth, height: element.scrollHeight, lines };
      setLayout(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    element.querySelectorAll('[data-gantt-task]').forEach(task => observer.observe(task));
    schedule();
    void document.fonts.ready.then(schedule);
    return () => { active = false; observer.disconnect(); cancelAnimationFrame(frame); };
  }, [container, dependencies, tasks]);
  if (!layout.width || !layout.height || !layout.lines.length) return null;
  return <svg className="pointer-events-none absolute left-0 top-0 z-20" width={layout.width} height={layout.height}
    role="img" aria-label="任务依赖连线" viewBox={`0 0 ${layout.width} ${layout.height}`}>
    <defs><marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--cf-fg-muted)" />
    </marker></defs>
    {layout.lines.map(line => {
      const midpoint = line.targetX > line.sourceX + 24 ? (line.sourceX + line.targetX) / 2
        : Math.min(layout.width - 8, Math.max(line.sourceX, line.targetX) + 16);
      return <path key={line.id} data-dependency-id={line.id} data-predecessor={line.predecessorId}
        data-successor={line.successorId} data-dependency-type={line.type}
        data-source-x={line.sourceX} data-target-x={line.targetX}
        d={`M ${line.sourceX} ${line.sourceY} H ${midpoint} V ${line.targetY} H ${line.targetX}`}
        fill="none" stroke="var(--cf-fg-muted)" strokeWidth="1.5" markerEnd={`url(#${markerId})`}>
        <title>{line.title}</title>
      </path>;
    })}
  </svg>;
}
