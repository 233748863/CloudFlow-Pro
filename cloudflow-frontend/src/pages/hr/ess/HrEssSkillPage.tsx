import React from 'react';
import { Button } from '@/components/common';
import { Hr09Access, Hr09Page, Hr09State, useHr09Resource } from '../components/Hr09Shared';
import { hrSkillApi } from '@/services/api/hr/skills';
import { SkillAssessments } from '../skills/SkillAssessments';
import { SkillGapDetail } from '../skills/SkillShared';

function MineWorkspace() {
  const recommendations = useHr09Resource(signal => hrSkillApi.recommendations(signal), []);
  return <div className="skill-workspace"><Hr09Page title="我的技能" description="查看本人的技能证据、岗位差距和可报名课程；技能自报需由他人核实后生效。"><section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold text-cf-title">岗位差距与课程</h2><Button variant="outline" onClick={recommendations.refresh}>刷新岗位差距</Button></div>{recommendations.loading ? <Hr09State loading title="正在读取本人岗位差距" /> : recommendations.error ? <Hr09State error title="本人岗位差距读取失败" description={recommendations.error.message} onRetry={recommendations.refresh} /> : recommendations.data ? <SkillGapDetail record={recommendations.data} /> : <Hr09State error title="未收到完整岗位信息" onRetry={recommendations.refresh} />}</section><section className="space-y-3"><h2 className="text-base font-semibold text-cf-title">本人技能证据</h2><SkillAssessments mine onChanged={recommendations.refresh} /></section></Hr09Page></div>;
}

export default function HrEssSkillPage() {
  return <Hr09Access permission="hr:skill:own"><MineWorkspace /></Hr09Access>;
}
