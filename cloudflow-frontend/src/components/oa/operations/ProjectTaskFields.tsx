import React from 'react';
import type { OaProjectTask } from '@/services/api/oaOperations';
import { FormFields, optionsOf, taskStatuses } from './RecordEditor';

export default function ProjectTaskFields({ task, tasks, onChange }: { task: OaProjectTask; tasks: OaProjectTask[]; onChange: (task: OaProjectTask) => void }) {
  const parents = tasks.filter(item => item.isGroupFlag && String(item.taskId) !== String(task.taskId) && (!task.levelPath || !item.levelPath?.startsWith(task.levelPath)));
  return <div className="oa-operations space-y-4"><p className="oa-ops-warning">分组进度由子任务加权汇总；里程碑默认权重为 3。累计工时包含迁移保留的期初工时和已审批工时，分组同时汇总子任务；期初工时不可手工修改。</p><FormFields value={{ ...task, openingActualHours: task.openingActualHours ?? 0, actualHours: task.actualHours ?? 0 }} onChange={onChange} fields={[
    { key: 'subject', label: '任务名称', required: true, maxLength: 255, wide: true }, { key: 'taskNo', label: '任务编号（留空自动生成）', maxLength: 50 },
    { key: 'parentTaskId', label: '上级分组（留空为根节点）', type: 'select', numeric: true, options: optionsOf(parents, 'taskId', 'subject') },
    { key: 'isGroupFlag', label: '分组任务', type: 'checkbox', when: value => !value.isMilestoneFlag }, { key: 'isMilestoneFlag', label: '里程碑', type: 'checkbox', when: value => !value.isGroupFlag },
    { key: 'assigneeId', label: '负责人', type: 'user' }, { key: 'priority', label: '优先级', type: 'select', numeric: true, options: { '0': '低', '1': '普通', '2': '高' } },
    { key: 'status', label: '状态', type: 'select', options: taskStatuses, disabled: !!task.isGroupFlag }, { key: 'progress', label: '进度（0–100%）', type: 'number', min: 0, max: 100, step: 0.01, disabled: !!task.isGroupFlag },
    { key: 'taskWeight', label: '计算权重', type: 'number', min: 0.01, max: 9999.99, step: 0.01 }, { key: 'plannedHours', label: '计划工时（小时）', type: 'number', min: 0, max: 99999999.99, step: 0.01 },
    { key: 'plannedStart', label: '计划开始', type: 'datetime-local' }, { key: 'plannedEnd', label: '计划结束', type: 'datetime-local' },
    { key: 'openingActualHours', label: '本任务期初工时（小时）', type: 'number', disabled: true }, { key: 'actualHours', label: '累计实际工时（小时）', type: 'number', disabled: true },
    { key: 'sortNo', label: '同层排序', type: 'number', min: 0, step: 1 }, { key: 'description', label: '任务说明', type: 'textarea', wide: true },
  ]} /></div>;
}
