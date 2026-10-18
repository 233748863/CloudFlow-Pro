import React, { useState } from 'react';
import { Button, Pagination } from '@/components/common';
import { crmOperations, type ActivityDetail } from '@/services/api/crm/operations';
import { ActivityEditor, newActivity } from './ActivityEditor';
import { EmailRecordDialog } from '../email/EmailRecordDialog';
import { emailStates } from '../email/EmailBody';
import { activityStatuses, Empty, labelOf, OpsSelect, Section, ticketStatuses, useAccess, useMutation, useRemote } from './OperationsKit';

const types = { ACTIVITY: '活动', FOLLOW_UP: '跟进', OPPORTUNITY: '商机阶段', QUOTE: '报价', RECEIVABLE: '回款', TICKET: '工单', EMAIL: '客户邮件' };
const statuses = { ...activityStatuses, ...ticketStatuses, LEAD: '线索阶段', QUALIFIED: '已确认', PROPOSAL: '方案报价', NEGOTIATION: '商务谈判', WON: '赢单', LOST: '输单', DRAFT: '草稿', PENDING: '审批中', APPROVED: '已批准', SENT: '已发送', ACCEPTED: '已接受', EXPIRED: '已过期', RECEIVED: '已回款', PARTIAL_RECEIVED: '部分回款' };
const statusByType: Record<string, Record<string, string>> = { ACTIVITY: activityStatuses, OPPORTUNITY: { OPEN: '进行中', CLOSED: '已结案' }, TICKET: ticketStatuses, EMAIL: emailStates };
const followUpTypes = { PHONE: '电话跟进', VISIT: '拜访跟进' };
export function CustomerTimeline({ customerId }: { customerId: number }) {
  const can = useAccess();
  const mutation = useMutation();
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [activity, setActivity] = useState<ActivityDetail>();
  const [emailId, setEmailId] = useState<number>();
  const source = useRemote(() => crmOperations.timeline(customerId, { type: type || undefined, pageNum: page, pageSize: 20 }), [customerId, type, page]);
  return <Section title="客户经营时间线"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div className="w-48"><OpsSelect label="时间线类型" value={type} empty="全部业务" options={Object.fromEntries(Object.entries(types).filter(([key]) => key !== 'EMAIL' || can('crm:email:list')))} onChange={value => { setType(value); setPage(1); }} /></div><div className="crm-ops-actions"><Button variant="outline" size="sm" onClick={source.refresh}>刷新</Button>{can('crm:activity:add') && <Button size="sm" onClick={() => setActivity(newActivity(customerId))}>安排活动</Button>}</div></div>{source.error && <p role="alert" className="crm-ops-warning">{source.error}</p>}{source.loading ? <Empty text="正在加载时间线" /> : !source.data?.rows.length ? <Empty text="暂无客户经营记录" /> : <ol className="space-y-5 border-l ml-2 pl-6">{source.data.rows.map(item => <li key={`${item.type}:${item.sourceId}`} className="relative"><span className="absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full bg-cf-primary" /><div className="flex flex-wrap justify-between gap-2 text-xs text-cf-muted"><span>{labelOf(types, item.type)} · {item.ownerName || '系统'}</span><time>{item.eventTime}</time></div><div className="mt-1 font-medium">{item.type === 'ACTIVITY' && can('crm:activity:list') ? <button className="text-cf-primary" onClick={() => void mutation.run(() => crmOperations.activity(item.sourceId), setActivity, '')}>{item.title}</button> : item.type === 'EMAIL' && can('crm:email:list') ? <button className="min-h-11 text-cf-primary" onClick={() => setEmailId(item.sourceId)}>{item.title}</button> : item.type === 'FOLLOW_UP' ? labelOf(followUpTypes, item.title) : item.title}<span className="ml-2 text-xs text-cf-muted">{item.status ? labelOf(statusByType[item.type] || statuses, item.status) : ''}</span></div>{item.content && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-cf-muted">{item.type === 'OPPORTUNITY' ? labelOf(statuses, item.content) : item.content}</p>}</li>)}</ol>}<Pagination page={page} pageSize={20} total={source.data?.total || 0} onPageChange={setPage} showPageSizeSelector={false} onPageSizeChange={() => undefined} />{activity && <ActivityEditor key={activity.activity.activityId || 'new'} initial={activity} onClose={() => setActivity(undefined)} onSaved={detail => { setActivity(detail); source.refresh(); }} />}{emailId && <EmailRecordDialog key={emailId} emailId={emailId} onClose={() => setEmailId(undefined)} />}</Section>;
}
