import React, { useState } from 'react';
import { Button } from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { oaGet, oaPost, type OaProjectTemplate, type OaProjectTemplateTask, type TemplateDetail } from '@/services/api/oaOperations';
import { OperationsPage, OpsTable, labelOf, useRemote, useMutation, useAccess } from '@/components/oa/operations/OperationsKit';
import { RecordEditor, FormFields, optionsOf, enabledStatuses } from '@/components/oa/operations/RecordEditor';

export default function ProjectTemplatePage() {
  const can = useAccess(); const mutation = useMutation(); const [detail, setDetail] = useState<TemplateDetail | null>(null); const [task, setTask] = useState<OaProjectTemplateTask | null>(null);
  const list = useRemote(() => oaGet<OaProjectTemplate[]>('/project-templates'));
  const editable = can('oa:project-template:edit');
  return <OperationsPage title="项目模板" description="复用任务树、里程碑和相对排期；应用模板时依据项目开始日期生成计划。" loading={list.loading} error={list.error} refresh={list.refresh} actions={editable && <Button onClick={() => setDetail({ template: { status: 'ACTIVE' }, tasks: [] })}>新建模板</Button>}>
    <OpsTable headers={['模板编码', '模板名称', '项目类型', '状态', '操作']} empty={!list.data?.length}>{list.data?.map(item => <tr key={item.templateId}><td>{item.templateCode}</td><td>{item.templateName}</td><td>{item.projectType || '通用'}</td><td>{labelOf(enabledStatuses, item.status)}</td><td><Button variant="link" disabled={mutation.busy} onClick={() => void mutation.run(() => oaGet<TemplateDetail>('/project-templates/' + item.templateId), setDetail, '')}>查看模板</Button></td></tr>)}</OpsTable>
    <BaseDialog open={!!detail} title="项目模板详情" width="extra-wide" onClose={() => setDetail(null)} footer={<><Button variant="outline" onClick={() => setDetail(null)}>关闭</Button>{editable && <Button disabled={mutation.busy || !detail?.tasks.length} onClick={() => detail && void mutation.run(() => oaPost('/project-templates', detail), () => { list.refresh(); setDetail(null); })}>保存模板</Button>}</>}>
      {detail && <div className="oa-operations space-y-4"><FormFields value={detail.template} onChange={value => setDetail({ ...detail, template: value })} disabled={!editable} fields={[
        { key: 'templateCode', label: '模板编码', required: true, maxLength: 50 }, { key: 'templateName', label: '模板名称', required: true, maxLength: 200 }, { key: 'projectType', label: '项目类型', maxLength: 50 },
        { key: 'status', label: '状态', type: 'select', options: enabledStatuses }, { key: 'description', label: '用途说明', type: 'textarea', wide: true },
      ]} />
        <OpsTable headers={['任务', '上级任务', '里程碑', '偏移 / 持续天数', '权重 / 计划工时', '操作']} empty={!detail.tasks.length}>{detail.tasks.map(item => <tr key={item.templateTaskId}><td>{item.subject}</td><td>{detail.tasks.find(parent => parent.templateTaskId === item.parentTemplateTaskId)?.subject || '根节点'}</td><td>{item.isMilestoneFlag ? '是' : '否'}</td><td>{item.startOffsetDays || 0} / {item.durationDays ?? 1}</td><td>{item.taskWeight || 1} / {item.plannedHours || 0}</td><td>{editable && <div className="oa-ops-actions"><Button variant="link" onClick={() => setTask(item)}>编辑</Button><Button variant="link" disabled={detail.tasks.some(child => child.parentTemplateTaskId === item.templateTaskId)} onClick={() => setDetail({ ...detail, tasks: detail.tasks.filter(candidate => candidate.templateTaskId !== item.templateTaskId) })}>移除</Button></div>}</td></tr>)}</OpsTable>
        {editable && <Button variant="outline" onClick={() => setTask({ templateTaskId: Math.min(0, ...detail.tasks.map(item => Number(item.templateTaskId || 0))) - 1, isMilestoneFlag: 0, taskWeight: 1, plannedHours: 0, startOffsetDays: 0, durationDays: 1, sortNo: detail.tasks.length })}>添加模板任务</Button>}
      </div>}
    </BaseDialog>
    <RecordEditor title="模板任务" value={task} onClose={() => setTask(null)} onSave={async value => { if (detail) setDetail({ ...detail, tasks: detail.tasks.some(item => item.templateTaskId === value.templateTaskId) ? detail.tasks.map(item => item.templateTaskId === value.templateTaskId ? value : item) : [...detail.tasks, value] }); }} fields={[
      { key: 'subject', label: '任务名称', required: true, maxLength: 255, wide: true }, { key: 'taskNo', label: '任务编码', maxLength: 50 },
      { key: 'parentTemplateTaskId', label: '上级任务', type: 'select', numeric: true, options: optionsOf(detail?.tasks.filter(item => item.templateTaskId !== task?.templateTaskId && !item.isMilestoneFlag), 'templateTaskId', 'subject') },
      { key: 'isMilestoneFlag', label: '里程碑', type: 'checkbox' }, { key: 'taskWeight', label: '权重', type: 'number', min: 0.01, max: 9999.99, step: 0.01 },
      { key: 'plannedHours', label: '计划工时', type: 'number', min: 0, step: 0.01 }, { key: 'startOffsetDays', label: '距项目开始日偏移天数', type: 'number', step: 1 },
      { key: 'durationDays', label: '持续天数（里程碑允许为 0）', type: 'number', min: 0, step: 1 }, { key: 'assigneeRole', label: '分配角色（OWNER 为项目经理）', maxLength: 50 }, { key: 'sortNo', label: '排序', type: 'number', min: 0, step: 1 },
    ]} />
  </OperationsPage>;
}
