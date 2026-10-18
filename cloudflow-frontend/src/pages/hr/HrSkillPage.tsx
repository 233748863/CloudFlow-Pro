import React, { useState } from 'react';
import { Button } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { Hr09Access, Hr09Page } from './components/Hr09Shared';
import { SkillCatalog } from './skills/SkillCatalog';
import { SkillCourseConfiguration, SkillPositionConfiguration } from './skills/SkillConfiguration';
import { SkillAssessments } from './skills/SkillAssessments';

function SkillWorkspace() {
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState('catalog');
  const tabs = [
    { key: 'catalog', label: '技能目录', permission: 'hr:skill:list' },
    { key: 'positions', label: '岗位要求', permission: 'hr:skill:manage' },
    { key: 'courses', label: '课程目标', permission: 'hr:skill:manage' },
    { key: 'assessments', label: '员工评估', permission: 'hr:skill:assess' },
  ].filter(item => hasPermission(item.permission));
  const active = tabs.some(item => item.key === tab) ? tab : 'catalog';
  return <div className="skill-workspace"><Hr09Page title="技能目录" description="按统一五级定义维护能力要求，并用真实培训、考试、证书和人工核实形成技能证据。"><nav aria-label="技能管理功能" className="flex flex-wrap gap-2">{tabs.map(item => <Button key={item.key} variant={active === item.key ? 'default' : 'outline'} aria-current={active === item.key ? 'page' : undefined} onClick={() => setTab(item.key)}>{item.label}</Button>)}</nav><div key={active}>{active === 'catalog' ? <SkillCatalog /> : active === 'positions' ? <SkillPositionConfiguration /> : active === 'courses' ? <SkillCourseConfiguration /> : <SkillAssessments mine={false} />}</div></Hr09Page></div>;
}

export default function HrSkillPage() {
  return <Hr09Access permission="hr:skill:list"><SkillWorkspace /></Hr09Access>;
}
