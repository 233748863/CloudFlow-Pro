import { useEffect, useRef, useState } from 'react';
import { Button, Input, Pagination } from '@/components/common';
import { listImLocalDepartments, readImRemoteDepartments } from '@/services/api/im';
import type { ImConfig, ImDepartmentOption, ImPage, ImSyncScope } from '@/services/api/im';
import { getErrorMessage } from '@/utils/errorMessage';
import { InfrastructureSelect } from './InfrastructurePrimitives';

const identifier = (value: number) => Number.isSafeInteger(value) && value > 0;
export function imScopeError(scope: ImSyncScope | null): string {
  if (!scope) return '';
  if (!identifier(scope.localRootDeptId)) return '请选择本地接入部门';
  if (!scope.remoteDepartmentIds.length || scope.remoteDepartmentIds.length > 100 || scope.remoteDepartmentIds.some(value => !identifier(value))
    || new Set(scope.remoteDepartmentIds).size !== scope.remoteDepartmentIds.length) return '请选择1至100个不同的企业微信部门';
  const choices = Object.entries(scope.primaryDepartments ?? {});
  if (choices.length > 10000 || new Set(choices.map(([person]) => person.toLowerCase())).size !== choices.length
    || choices.some(([person, department]) => !/^[A-Za-z0-9_.@=-]{1,128}$/.test(person) || !identifier(department))) return '请核对成员主部门选择，成员账号不可重复';
  return '';
}

function validateOptions(rows: ImDepartmentOption[]) {
  if (rows.some(row => !identifier(row.id) || !Number.isSafeInteger(row.parentId) || row.parentId < 0 || typeof row.name !== 'string')) {
    throw new Error('部门编号超出页面支持范围或数据不完整，已停止选择，请联系管理员核对');
  }
  return rows;
}

export default function ImScopeFields({ value, onChange, config, disabled, canConnect, onFailure }: {
  value: ImSyncScope | null; onChange: (scope: ImSyncScope | null) => void; config: ImConfig | null;
  disabled: boolean; canConnect: boolean; onFailure: (failure: unknown) => void;
}) {
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [local, setLocal] = useState<ImPage<ImDepartmentOption> | null>(null);
  const [localLoading, setLocalLoading] = useState(false);
  const [remote, setRemote] = useState<ImDepartmentOption[]>([]);
  const [remoteKeyword, setRemoteKeyword] = useState('');
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [error, setError] = useState('');
  const [person, setPerson] = useState('');
  const [primary, setPrimary] = useState('');
  const [primaryPage, setPrimaryPage] = useState(1);
  const remoteRequest = useRef<AbortController | null>(null);
  const enabled = value !== null;
  useEffect(() => () => remoteRequest.current?.abort(), []);
  useEffect(() => {
    if (!enabled || disabled) return;
    const cancellation = new AbortController();
    setLocalLoading(true);
    const timer = window.setTimeout(() => {
      void listImLocalDepartments({ keyword, pageNum: page, pageSize: 50 }, cancellation.signal).then(result => {
        if (!cancellation.signal.aborted) setLocal({ ...result, rows: validateOptions(result.rows) });
      }).catch(failure => {
        if (!cancellation.signal.aborted) { setLocal(null); setError(getErrorMessage(failure, '本地部门读取失败，请调整搜索后重试')); onFailure(failure); }
      }).finally(() => { if (!cancellation.signal.aborted) setLocalLoading(false); });
    }, 250);
    return () => { window.clearTimeout(timer); cancellation.abort(); };
  }, [enabled, disabled, keyword, page]);
  const readRemote = async () => {
    if (disabled || remoteLoading || !config || config.status !== 'ENABLED' || !canConnect) return;
    const cancellation = new AbortController();
    remoteRequest.current?.abort(); remoteRequest.current = cancellation;
    setRemoteLoading(true); setRemote([]); setError('');
    try {
      const result = await readImRemoteDepartments(config.configId, config.version, cancellation.signal);
      if (!cancellation.signal.aborted) {
        if (result.configId !== config.configId || result.version !== config.version) throw new Error('部门候选对应的配置已变化，请关闭编辑并刷新');
        setRemote(validateOptions(result.departments));
      }
    } catch (failure) {
      if (!cancellation.signal.aborted) { setError(getErrorMessage(failure, '授权部门读取失败，本次未改变已选范围')); onFailure(failure); }
    } finally { if (!cancellation.signal.aborted) setRemoteLoading(false); }
  };
  const change = (patch: Partial<ImSyncScope>) => { if (value) onChange({ ...value, ...patch }); };
  const roots = value?.remoteDepartmentIds ?? [];
  const primaryEntries = Object.entries(value?.primaryDepartments ?? {});
  const name = (id: number) => remote.find(department => department.id === id)?.name ?? `部门 #${id}`;
  const localOptions = (local?.rows ?? []).map(department => ({ value: String(department.id), label: `${department.name} · #${department.id}` }));
  if (value?.localRootDeptId && !localOptions.some(option => option.value === String(value.localRootDeptId))) {
    localOptions.unshift({ value: String(value.localRootDeptId), label: `已保存本地部门 #${value.localRootDeptId}` });
  }
  const filtered = remote.filter(department => !remoteKeyword || `${department.name} ${department.id}`.includes(remoteKeyword));
  const addPrimary = () => {
    if (!value || disabled) return;
    const account = person.trim();
    if (!/^[A-Za-z0-9_.@=-]{1,128}$/.test(account) || !identifier(Number(primary))) { setError('请填写预览中的成员账号并选择主部门'); return; }
    if (primaryEntries.some(([key]) => key.toLowerCase() === account.toLowerCase())) { setError('该成员已有主部门选择，请先移除旧选择'); return; }
    if (primaryEntries.length >= 10000) { setError('最多保存10000个成员主部门选择'); return; }
    change({ primaryDepartments: { ...value.primaryDepartments, [account]: Number(primary) } }); setPerson(''); setPrimary(''); setError('');
  };
  return <fieldset className="im-scope-fields space-y-4">
    <legend className="mb-2 text-sm font-medium">组织同步范围</legend>
    <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={enabled} disabled={disabled} onChange={event => onChange(event.target.checked
      ? { localRootDeptId: 0, remoteDepartmentIds: [], primaryDepartments: {} } : null)} />设置组织同步范围</label>
    <p className="text-xs text-cf-subtle">只保存范围，不执行同步或开启定时任务；远端所选部门包含其全部下级部门。</p>
    {value && <>
      <div className="card space-y-3 p-4">
        <label className="block space-y-2 text-sm">搜索本地部门<Input maxLength={30} value={keyword} disabled={disabled} onChange={event => { setKeyword(event.target.value); setPage(1); }} /></label>
        <label className="block space-y-2 text-sm"><span>本地接入部门</span><InfrastructureSelect aria-label="本地接入部门" placeholder="选择一个本地部门" value={value.localRootDeptId ? String(value.localRootDeptId) : ''} options={localOptions} disabled={disabled || localLoading} onValueChange={selected => change({ localRootDeptId: Number(selected) })} /></label>
        <p role="status" className="text-xs text-cf-subtle">{localLoading ? '正在读取本地部门…' : `搜索结果 ${local?.total ?? 0} 个，每页50个；选中部门本身不会被覆盖。`}</p>
        <Pagination total={local?.total ?? 0} page={page} pageSize={50} showPageSizeSelector={false} onPageSizeChange={() => setPage(1)} onPageChange={next => { if (!disabled && !localLoading) setPage(next); }} />
      </div>
      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-medium">企业微信部门</p><Button type="button" variant="outline" disabled={disabled || remoteLoading || !canConnect || config?.status !== 'ENABLED'} onClick={() => void readRemote()}>{remoteLoading ? '读取部门中…' : '读取已保存配置的授权部门'}</Button></div>
        <p className="text-xs text-cf-subtle">需先保存并启用应用配置，再显式读取；修改密钥或企业/应用后，请先保存并重新打开编辑。本次仅读取部门，不读取员工。</p>
        <div className="flex flex-wrap gap-2" aria-label="已选远端部门">{roots.map(id => <Button key={id} type="button" variant="outline" disabled={disabled || remoteLoading} aria-label={`移除远端部门 ${id}`} onClick={() => change({ remoteDepartmentIds: roots.filter(selected => selected !== id) })}>{name(id)} ×</Button>)}</div>
        <p className="text-xs text-cf-subtle">已选 {roots.length} / 100 个部门；未读取到候选时保留原选择。</p>
        {remote.length > 0 && <><label className="block space-y-2 text-sm">搜索企业微信部门<Input value={remoteKeyword} maxLength={100} disabled={disabled} onChange={event => setRemoteKeyword(event.target.value)} /></label>
          <div className="max-h-72 space-y-1 overflow-y-auto" aria-label="授权部门候选">{filtered.slice(0, 100).map(department => <label key={department.id} className="flex min-h-11 items-center gap-3 rounded p-2 text-sm"><input type="checkbox" checked={roots.includes(department.id)} disabled={disabled || remoteLoading || roots.length >= 100 && !roots.includes(department.id)} onChange={event => change({ remoteDepartmentIds: event.target.checked ? [...roots, department.id] : roots.filter(id => id !== department.id) })} /><span className="min-w-0 break-all">{department.name} · #{department.id}</span></label>)}</div>
          <p className="text-xs text-cf-subtle">匹配 {filtered.length} 个，当前显示前 {Math.min(100, filtered.length)} 个；可继续搜索名称或编号。</p></>}
      </div>
      <div className="card space-y-3 p-4">
        <p className="text-sm font-medium">多部门成员的主部门</p><p className="text-xs text-cf-subtle">从预览冲突报告复制成员账号，再明确选择主部门；不符合实际成员归属时，下一次预览仍会报告冲突。</p>
        <label className="block space-y-2 text-sm">企业微信成员账号<Input value={person} maxLength={128} disabled={disabled} onChange={event => setPerson(event.target.value)} /></label>
        <InfrastructureSelect aria-label="成员主部门" placeholder="先读取授权部门，再选择" value={primary} options={remote.map(department => ({ value: String(department.id), label: `${department.name} · #${department.id}` }))} disabled={disabled || remote.length === 0} onValueChange={setPrimary} />
        <Button type="button" variant="outline" disabled={disabled || !person.trim() || !primary} onClick={addPrimary}>添加主部门选择</Button>
        <ul className="space-y-2">{primaryEntries.slice((primaryPage - 1) * 20, primaryPage * 20).map(([account, department]) => <li key={account} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="min-w-0 break-all">{account} → {name(department)}</span><Button type="button" variant="outline" disabled={disabled} aria-label={`移除成员主部门 ${account}`} onClick={() => {
          change({ primaryDepartments: Object.fromEntries(primaryEntries.filter(([key]) => key !== account)) }); setPrimaryPage(1);
        }}>移除</Button></li>)}</ul>
        {primaryEntries.length > 20 && <Pagination total={primaryEntries.length} page={primaryPage} pageSize={20} showPageSizeSelector={false} onPageSizeChange={() => setPrimaryPage(1)} onPageChange={setPrimaryPage} />}
      </div>
    </>}
    {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
  </fieldset>;
}
