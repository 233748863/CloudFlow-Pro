import React, { useState } from 'react';
import { Button, ListResultFooter } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { Hr09Input, Hr09Page, Hr09Select, Hr09State, asOptions, useHr09Resource } from '../components/Hr09Shared';
import { hrAppraisalApi } from '@/services/api/hr/appraisals';
import type { AppraisalQuery } from '@/services/api/hr/appraisalTypes';
import { AppraisalRows, appraisalMethods, appraisalStages, appraisalTypes } from './AppraisalShared';
import { AppraisalDraftEditor } from './AppraisalDraft';
import { AppraisalDetailDialog } from './AppraisalDetail';
import { AppraisalOwnInvitations } from './AppraisalEvaluation';

function AppraisalCycleList({ mine }: { mine: boolean }) {
  const { hasPermission } = useAuth();
  const [query, setQuery] = useState<AppraisalQuery>({ pageNum: 1, pageSize: 10 });
  const [create, setCreate] = useState(false);
  const [selected, setSelected] = useState<string>();
  const resource = useHr09Resource(signal => hrAppraisalApi.list(query, mine, signal), [mine, JSON.stringify(query)]);
  return <section className="space-y-4"><div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto]"><Hr09Input label="周期名称搜索" maxLength={100} value={query.keyword || ''} onChange={event => setQuery({ ...query, keyword: event.target.value, pageNum: 1 })} /><Hr09Select label="周期阶段" value={query.status || ''} placeholder="全部阶段" options={asOptions(appraisalStages)} onChange={status => setQuery({ ...query, status, pageNum: 1 })} /><Button variant="outline" onClick={resource.refresh}>刷新周期列表</Button></div>
    {!mine && hasPermission('hr:appraisal:manage') && <Button onClick={() => setCreate(true)}>创建绩效周期</Button>}
    {resource.loading ? <Hr09State loading title="正在读取绩效周期" /> : resource.error ? <Hr09State error title="周期列表读取失败" description={resource.error.message} onRetry={resource.refresh} /> : resource.data && <><AppraisalRows rows={resource.data.rows} rowKey={row => row.cycleId} columns={[
      { key: 'name', label: '绩效周期', render: row => <>{row.cycleName}<p className="mt-1 text-xs text-cf-subtle">{appraisalTypes[row.cycleType]} · {appraisalMethods[row.evaluationMethod]}</p></> },
      { key: 'date', label: '起止日期', render: row => `${row.startDate} 至 ${row.endDate}` },
      { key: 'stage', label: '阶段 / 可见人数', render: row => `${appraisalStages[row.status]} · ${row.visibleParticipants} 人` },
      { key: 'actions', label: '操作', render: row => <Button variant="outline" aria-label={`查看${row.cycleName}详情`} onClick={() => setSelected(row.cycleId)}>查看详情</Button> },
    ]} /><ListResultFooter summary={`共 ${resource.data.total} 个周期`} total={resource.data.total} page={query.pageNum || 1} pageSize={10} onPageChange={pageNum => setQuery({ ...query, pageNum })} /></>}
    {create && <AppraisalDraftEditor onClose={() => setCreate(false)} onSaved={cycleId => { setCreate(false); resource.refresh(); if (cycleId) setSelected(cycleId); }} />}
    {selected && <AppraisalDetailDialog key={selected} cycleId={selected} mine={mine} onClose={() => setSelected(undefined)} onChanged={resource.refresh} />}
  </section>;
}

export function AppraisalWorkspace({ mine }: { mine: boolean }) {
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState('cycles');
  const invitations = mine && hasPermission('hr:appraisal:respond');
  return <div className="appraisal-workspace"><Hr09Page title={mine ? '我的绩效周期' : '绩效周期'} description={mine ? '查看本人目标与最终结果，并处理发给本人的评价邀请。' : '从确认参评名单到评分、校准和完成，保留每个阶段的实际依据。'}>
    {invitations && <nav aria-label="本人绩效功能" className="flex flex-wrap gap-2"><Button variant={tab === 'cycles' ? 'default' : 'outline'} aria-current={tab === 'cycles' ? 'page' : undefined} onClick={() => setTab('cycles')}>我的周期</Button><Button variant={tab === 'invitations' ? 'default' : 'outline'} aria-current={tab === 'invitations' ? 'page' : undefined} onClick={() => setTab('invitations')}>受邀评分</Button></nav>}
    {invitations && tab === 'invitations' ? <AppraisalOwnInvitations /> : <AppraisalCycleList mine={mine} />}
  </Hr09Page></div>;
}
