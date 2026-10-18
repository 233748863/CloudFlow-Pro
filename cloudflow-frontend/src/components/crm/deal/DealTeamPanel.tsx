import React, { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button, ConfirmDialog, Input, Textarea, UserSelector } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { dealTeams, type DealBusiness, type DealRole, type DealTeam } from '@/services/api/crm/dealTeams';
import { getErrorMessage } from '@/utils/errorMessage';
import { Field, money, OpsSelect } from '../operations/OperationsKit';
import { dealRoleLabels, teamDraft, teamPayload, teamPreview, type DealTeamDraftMember } from './dealTeamDraft';
import './dealTeam.css';

export function DealTeamPanel({ bizType, bizId, businessVersion, onDirtyChange, onBusyChange, onSaved }: {
  bizType: DealBusiness; bizId: number; businessVersion?: number; onDirtyChange?: (value: boolean) => void; onBusyChange?: (value: boolean) => void; onSaved?: () => void;
}) {
  const { hasPermission } = useAuth();
  const canRead = hasPermission('crm:deal-team:query');
  const canManage = hasPermission('crm:deal-team:manage');
  const [team, setTeam] = useState<DealTeam>();
  const [members, setMembers] = useState<DealTeamDraftMember[]>([]);
  const [remark, setRemark] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [latest, setLatest] = useState<DealTeam>();
  const [discardOpen, setDiscardOpen] = useState(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => (dirty || busy)
    && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  const operation = useRef(false);
  const generation = useRef(0);
  const adopt = (result: DealTeam) => { setTeam(result); setMembers(teamDraft(result)); setRemark(''); setDirty(false); setLatest(undefined); };
  const load = async (version?: number, preserveDraft = false) => {
    if (operation.current || !canRead) return;
    operation.current = true; setLoading(true); setError('');
    const requestGeneration = generation.current;
    try {
      const result = await dealTeams.read(bizType, bizId, version);
      if (requestGeneration !== generation.current) return;
      if (preserveDraft) setLatest(result); else adopt(result);
    } catch (failure) { if (requestGeneration === generation.current) setError(getErrorMessage(failure, '团队读取失败')); }
    finally { if (requestGeneration === generation.current) { operation.current = false; setLoading(false); } }
  };
  useEffect(() => {
    generation.current += 1; operation.current = false; setTeam(undefined); setMembers([]); setDirty(false);
    setRemark(''); setLatest(undefined); setBusy(false); setLoading(false); setError(''); setDiscardOpen(false);
    void load();
    return () => { generation.current += 1; operation.current = false; };
  }, [bizType, bizId, canRead]);
  useEffect(() => { if (team && !dirty && !operation.current) void load(); }, [businessVersion]);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange?.(busy || loading); }, [busy, loading, onBusyChange]);
  useEffect(() => () => { onDirtyChange?.(false); onBusyChange?.(false); }, [onDirtyChange, onBusyChange]);
  useEffect(() => { if (busy && blocker.state === 'blocked') { blocker.reset(); toast.info('团队正在保存，请等待结果后再离开'); } }, [busy, blocker]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty || busy) event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);
  const editable = canManage && !!team && !team.historical && !busy && !loading;
  const preview = team ? teamPreview(team.amount, members) : undefined;
  const patch = (index: number, changes: Partial<DealTeamDraftMember>) => { setMembers(previous => previous.map((member, currentIndex) => currentIndex === index ? { ...member, ...changes } : member)); setDirty(true); };
  const save = async () => {
    if (!editable || operation.current || !team) return;
    operation.current = true; setBusy(true); setError(''); setLatest(undefined);
    const requestGeneration = generation.current;
    try {
      const result = await dealTeams.save(bizType, bizId, teamPayload(team, members, remark));
      if (requestGeneration !== generation.current) return;
      adopt(result); toast.success('团队已保存，既有业绩分配保持不变'); onSaved?.();
    } catch (failure) { if (requestGeneration === generation.current) setError(getErrorMessage(failure, '团队保存失败，草稿已保留')); }
    finally { if (requestGeneration === generation.current) { operation.current = false; setBusy(false); } }
  };
  if (!canRead) return <p role="alert">无权查看分成团队。</p>;
  return <section className="crm-deal-team space-y-4" aria-label="销售团队分成">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><h3 className="flex items-center gap-2 font-semibold text-cf-title"><Users size={18} />销售团队分成</h3><p className="mt-1 text-sm text-cf-muted">团队分成不会增加客户或工资数据权限，既有业绩按发生时的团队记录保留。</p></div>
      <Button variant="outline" disabled={dirty || busy || loading} onClick={() => void load()}>重新读取团队</Button>
    </header>
    {loading && <p role="status">正在核对团队版本…</p>}
    {error && <div className="crm-ops-warning space-y-2"><p role="alert">{error} {dirty && '未保存的团队草稿仍保留。'}</p>
      {dirty && <Button variant="outline" disabled={busy || loading} onClick={() => void load(undefined, true)}>核对最新团队，保留草稿</Button>}</div>}
    {latest && <aside className="crm-ops-warning space-y-3" aria-label="团队版本冲突核对">
      <p>当前服务器团队版本 {latest.teamVersion}，业务版本 {latest.businessVersion}；原草稿基于团队版本 {team?.teamVersion}。</p>
      <ul>{teamDraft(latest).map(member => <li key={member.salesUserId}>{member.salesUserName} · {dealRoleLabels[member.roleType]} · {member.percentage}%</li>)}</ul>
      <Button variant="outline" disabled={busy || loading} onClick={() => { setTeam(latest); setLatest(undefined); setError(''); }}>已核对，基于此版本继续编辑草稿</Button>
    </aside>}
    {team && <>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="团队版本"><OpsSelect label="团队版本" value={team.teamVersion} disabled={dirty || busy || loading}
        options={Object.fromEntries(team.versions.map(version => [version, `${version === 0 ? '负责人默认分配' : `版本 ${version}`}${version === team.currentTeamVersion ? '（当前）' : '（历史只读）'}`]))}
        onChange={version => void load(Number(version))} /></Field>
        <div className="crm-deal-summary"><span>{team.historical ? '该团队版本金额快照' : '当前业务金额'}（{team.currency}）</span><strong>{money(team.amount)}</strong><small>业务版本 {team.businessVersion} · {members.length} 名成员</small></div></div>
      {team.historical && <p className="crm-ops-warning">正在查看历史团队，仅供核对；当前团队为版本 {team.currentTeamVersion}。</p>}
      <div className="space-y-3">{members.map((member, index) => <article key={member.salesUserId} className="crm-deal-member" aria-label={`团队成员 ${member.salesUserName}`}>
        <div className="min-w-0"><strong className="break-words text-cf-title">{member.salesUserName}</strong><p className="text-xs text-cf-muted">用户 #{member.salesUserId}{member.deptId ? ` · 部门 #${member.deptId}` : ' · 保存时由人事核验部门'}</p></div>
        <Field label="团队角色"><OpsSelect label={`团队角色 ${member.salesUserName}`} value={member.roleType} disabled={!editable} options={dealRoleLabels} onChange={value => patch(index, { roleType: value as DealRole })} /></Field>
        <Field label="分成比例（%）"><Input aria-label={`分成比例 ${member.salesUserName}`} inputMode="decimal" value={member.percentage} disabled={!editable} onChange={event => patch(index, { percentage: event.target.value })} /></Field>
        <div><span className="text-xs text-cf-muted">{dirty ? '分配预览' : '该版本分配金额'}</span><p className="font-semibold text-cf-title">{money(dirty ? preview?.amounts[index] : team.members[index]?.allocatedAmount)}</p></div>
        {canManage && !team.historical && <Button variant="outline" disabled={!editable} aria-label={`移除团队成员 ${member.salesUserName}`} onClick={() => { setMembers(previous => previous.filter(current => current.salesUserId !== member.salesUserId)); setDirty(true); }}><Trash2 size={16} /></Button>}
      </article>)}</div>
      {canManage && !team.historical && <fieldset disabled={!editable} className="space-y-3">
        <Field label="添加团队成员"><UserSelector single value={null} disabled={!editable || members.length >= 200} onChange={(id, selected) => {
          if (!id) return;
          const userId = Number(id);
          if (members.some(member => member.salesUserId === userId)) { setError('该用户已在团队中'); return; }
          setMembers(previous => [...previous, { salesUserId: userId, salesUserName: selected?.name || `用户 #${userId}`, roleType: 'CO_SELLER', percentage: '0.00' }]); setDirty(true);
        }} /></Field>
        <Field label="调整说明"><Textarea aria-label="团队调整说明" value={remark} maxLength={500} onChange={event => { setRemark(event.target.value); setDirty(true); }} /></Field>
      </fieldset>}
      {preview?.error ? <p role={dirty ? 'alert' : undefined} className="crm-ops-warning">{preview.error}</p> : <p className="text-sm text-cf-muted">比例合计 {preview?.total}%；按分四舍五入，尾差 {preview?.remainder} 元归主责。此处为业绩分配预览，实际到账后另行核定提成。</p>}
      {canManage && !team.historical && <div className="flex flex-wrap items-center gap-3"><Button disabled={!editable || !dirty || !!preview?.error} onClick={() => void save()}>{busy ? '正在保存团队…' : '保存分成团队'}</Button><Button variant="outline" disabled={!editable || !dirty} onClick={() => setDiscardOpen(true)}>放弃团队草稿</Button><span className="text-sm text-cf-muted">{dirty ? '有未保存草稿' : '显示已读取版本'}</span></div>}
    </>}
    <ConfirmDialog open={(discardOpen || blocker.state === 'blocked') && !busy && !loading} title="放弃未保存的团队草稿？"
      message={blocker.state === 'blocked' ? '离开后将丢弃本次未保存草稿，已保存的团队保持不变。' : '放弃草稿后重新读取已保存的团队，既有业绩保持不变。'}
      confirmText={blocker.state === 'blocked' ? '放弃草稿并离开' : '放弃草稿并重新读取'} cancelText="继续编辑" danger
      onCancel={() => { setDiscardOpen(false); if (blocker.state === 'blocked') blocker.reset(); }}
      onConfirm={() => { if (busy || loading) return; setDiscardOpen(false); if (blocker.state === 'blocked') blocker.proceed(); else { if (team) adopt(team); setError(''); void load(); } }} />
  </section>;
}
