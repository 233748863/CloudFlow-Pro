import React, { useState } from 'react';
import { Button } from '@/components/common';
import type { Project } from '@/services/api/project';
import { oaGet, oaPost, type OaProjectTemplate } from '@/services/api/oaOperations';
import { Section, Metric, OpsSelect, money, useRemote, useMutation, useAccess } from './OperationsKit';
import { RecordEditor, optionsOf } from './RecordEditor';

export default function ProjectOperationsPanel({ project, onChanged }: { project: Project; onChanged: () => void }) {
  const can = useAccess(); const mutation = useMutation(); const [templateId, setTemplateId] = useState(''); const [template, setTemplate] = useState<OaProjectTemplate | null>(null);
  const templates = useRemote(() => can('oa:project-template:list') ? oaGet<OaProjectTemplate[]>('/project-templates') : Promise.resolve([]));
  return <Section title="项目工时与模板"><div className="grid gap-3 md:grid-cols-3"><Metric label="累计实际工时（小时）" value={project.actualHours ?? 0} /><Metric label="计费总额（元）" value={money(project.billableAmount)} />{can('oa:activity-cost:list') && <Metric label="人工成本（元）" value={money(project.laborCostAmount)} />}</div>
    <p className="oa-ops-warning mt-3">累计工时包含期初工时和已审批工时；历史期初工时保留原值，不补造计费或人工成本。</p>
    {templates.error && <p role="alert">{templates.error}</p>}
    <div className="oa-ops-actions mt-4">{can('oa:project-template:list') && can('oa:project:edit') && <><OpsSelect label="项目模板" value={templateId} options={optionsOf(templates.data?.filter(item => item.status === 'ACTIVE'), 'templateId', 'templateName')} empty="选择模板" onChange={setTemplateId} /><Button disabled={!templateId || mutation.busy} onClick={() => void mutation.run(() => oaPost('/project-templates/' + templateId + '/apply/' + project.projectId), onChanged)}>应用到空任务树</Button></>}
      {can('oa:project-template:edit') && <Button variant="outline" onClick={() => setTemplate({ templateName: project.projectName + '模板', projectType: project.projectType, status: 'ACTIVE' })}>当前任务树另存模板</Button>}
      {can('oa:project-cost:recalculate') && <Button variant="outline" disabled={mutation.busy} onClick={() => void mutation.run(() => oaPost('/timesheets/projects/' + project.projectId + '/recalculate'), onChanged)}>重算工时与成本</Button>}
    </div>
    <RecordEditor title="从项目保存模板" value={template} onClose={() => setTemplate(null)} onSave={async value => { await oaPost('/project-templates/from-project/' + project.projectId, value); templates.refresh(); }} fields={[
      { key: 'templateCode', label: '模板编码', required: true, maxLength: 50 }, { key: 'templateName', label: '模板名称', required: true, maxLength: 200 }, { key: 'description', label: '用途说明', type: 'textarea', wide: true },
    ]} />
  </Section>;
}
