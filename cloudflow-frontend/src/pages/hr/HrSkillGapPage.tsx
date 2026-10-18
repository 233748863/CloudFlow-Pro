import React, { useState } from 'react';
import { BaseDialog, Button } from '@/components/common';
import { Hr09Access, Hr09Page, useHr09Resource } from './components/Hr09Shared';
import { hrSkillApi } from '@/services/api/hr/skills';
import type { SkillEmployeeGap } from '@/services/api/hr/skillTypes';
import { SkillGapDetail, SkillList, SkillPicker, SkillSearch, useSkillQuery } from './skills/SkillShared';

function GapWorkspace() {
  const { query, change } = useSkillQuery();
  const [position, setPosition] = useState<{ id: string; name: string }>();
  const [selected, setSelected] = useState<SkillEmployeeGap>();
  const resource = useHr09Resource(signal => hrSkillApi.gaps(query, signal), [JSON.stringify(query)]);
  return <div className="skill-workspace"><Hr09Page title="岗位技能差距" description="仅查询管理范围内在岗员工；已过期或失效的证据按未认证计算，不恢复更早记录。"><div className="grid items-end gap-3 sm:grid-cols-2"><SkillSearch label="员工姓名或工号" value={query.keyword || ''} onChange={keyword => change({ keyword })} refresh={resource.refresh} /><div className="flex items-end gap-2"><div className="min-w-0 flex-1"><SkillPicker kind="position" label="岗位筛选" value={position} onChange={value => { setPosition(value); change({ positionId: value.id }); }} /></div>{position && <Button variant="outline" onClick={() => { setPosition(undefined); change({ positionId: undefined }); }}>清除</Button>}</div></div><SkillList resource={resource} query={query} onPage={pageNum => change({ pageNum })} rowKey={row => row.employeeId} columns={[
    { key: 'employee', label: '员工', render: row => row.employeeName },
    { key: 'position', label: '岗位', render: row => row.positionName || '尚未配置' },
    { key: 'gaps', label: '技能差距', render: row => row.skills.length ? `${row.skills.filter(skill => skill.gap > 0).length} 项待补足 / 共 ${row.skills.length} 项` : '岗位尚无技能要求' },
    { key: 'action', label: '操作', render: row => <Button variant="outline" onClick={() => setSelected(row)} aria-label={`查看${row.employeeName}技能差距`}>查看差距与课程</Button> },
  ]} />{selected && <BaseDialog open title={`${selected.employeeName} · 技能差距`} onClose={() => setSelected(undefined)} width="wide"><div className="skill-workspace"><SkillGapDetail record={selected} /></div></BaseDialog>}</Hr09Page></div>;
}

export default function HrSkillGapPage() {
  return <Hr09Access permission="hr:skill:gap"><GapWorkspace /></Hr09Access>;
}
