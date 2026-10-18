import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileSpreadsheet, RefreshCw, Upload } from 'lucide-react';
import { Button, Pagination, PermissionGuard, Table, TableBody, TableHeader, TableRow } from '@/components/common';
import { ImportDialog } from '@/components/import/ImportDialog';
import { InnerTableSurface, TablePageLayout } from '@/components/layout';
import { useAuth } from '@/context/AuthContext';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { importServiceNames, importStatusNames, isImportRunning, listImportTasks, loadImportBusinesses } from '@/services/api/importTask';
import type { ImportBusiness, ImportService, ImportTask } from '@/services/api/importTask';
import { getErrorMessage } from '@/utils/errorMessage';
import { InfrastructureBadge, InfrastructurePageHeader, InfrastructureSelect, InfrastructureTableStateRow } from './_components/InfrastructurePrimitives';

function ImportWorkspace() {
  const [searchParams] = useSearchParams();
  const requestedBizType = searchParams.get('bizType') || '';
  const requestedTaskId = Number(searchParams.get('taskId'));
  const openedLink = useRef('');
  const { hasPermission } = useAuth();
  const breakpoint = useBreakpoint();
  const [businesses, setBusinesses] = useState<ImportBusiness[]>([]);
  const [unavailable, setUnavailable] = useState<ImportService[]>([]);
  const [service, setService] = useState<ImportService | ''>('');
  const [bizType, setBizType] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [pageNum, setPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [rows, setRows] = useState<ImportTask[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [dialog, setDialog] = useState<{ service: ImportService; bizType: string; taskId?: number } | null>(null);
  const serviceBusinesses = useMemo(() => businesses.filter((business) => business.service === service), [businesses, service]);
  const selectedBusiness = serviceBusinesses.find((business) => business.bizType === bizType) || serviceBusinesses[0];

  useEffect(() => {
    const controller = new AbortController();
    loadImportBusinesses(controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setBusinesses(result.businesses);
      setUnavailable(result.unavailable);
      setService((current) => result.businesses.some((business) => business.service === current) ? current : result.businesses[0]?.service || '');
      const requested = result.businesses.find((business) => business.bizType === requestedBizType);
      const marker = `${requestedBizType}:${requestedTaskId}`;
      if (requested && openedLink.current !== marker) {
        openedLink.current = marker;
        setService(requested.service);
        setBizType(requested.bizType);
        setPageNum(1);
        if (Number.isSafeInteger(requestedTaskId) && requestedTaskId > 0) setDialog({ service: requested.service, bizType: requested.bizType, taskId: requestedTaskId });
      }
      if (result.businesses.length === 0) { setLoading(false); setRows([]); setTotal(0); }
    });
    return () => controller.abort();
  }, [revision, requestedBizType, requestedTaskId]);

  useEffect(() => {
    if (!service) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setLoading(true);
    setError('');
    const load = async () => {
      try {
        const result = await listImportTasks(service, { pageNum, pageSize, bizType: bizType === 'ALL' ? undefined : bizType, status: status === 'ALL' ? undefined : status }, controller.signal);
        if (controller.signal.aborted) return;
        setRows(result.rows); setTotal(result.total);
        if (pageNum > 1 && result.rows.length === 0 && result.total > 0) setPageNum(Math.max(1, Math.ceil(result.total / pageSize)));
        if (result.rows.some(isImportRunning)) timer = setTimeout(load, 2500);
      } catch (reason) {
        if (!controller.signal.aborted) { setRows([]); setError(getErrorMessage(reason, '导入任务加载失败')); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [service, bizType, status, pageNum, pageSize, revision]);

  const refresh = () => setRevision((value) => value + 1);
  return <section className="admin-source-page">
    <TablePageLayout
      actions={<InfrastructurePageHeader kicker="BATCH IMPORT" title="批量导入" description="查看本人导入任务，核对校验结果、下载错误文件或继续未处理的数据。">
        <Button variant="outline" size="sm" onClick={refresh}><RefreshCw size={16} />刷新</Button>
        {selectedBusiness && hasPermission('system:import:execute') ? <Button size="sm" onClick={() => setDialog({ service: selectedBusiness.service, bizType: selectedBusiness.bizType })}><Upload size={16} />导入{selectedBusiness.bizName}</Button> : null}
      </InfrastructurePageHeader>}
      filters={<div className="card space-y-3 p-4">
        {unavailable.length ? <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">{unavailable.map((item) => importServiceNames[item]).join('、')}服务暂不可用，相关任务暂未展示。</p> : null}
        {breakpoint === 'mobile' ? <p className="flex items-center gap-2 text-sm text-cf-muted"><FileSpreadsheet size={16} />手机端可查看进度，请到桌面端导入和核对文件。</p> : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <label><span className="input-label">业务模块</span><InfrastructureSelect aria-label="业务模块" value={service || undefined} placeholder="暂无可用业务" options={[...new Set(businesses.map((business) => business.service))].map((value) => ({ value, label: importServiceNames[value] }))} onValueChange={(value) => { setService(value as ImportService); setBizType('ALL'); setPageNum(1); }} /></label>
          <label><span className="input-label">导入业务</span><InfrastructureSelect aria-label="导入业务" value={bizType} options={[{ value: 'ALL', label: '全部业务' }, ...serviceBusinesses.map((business) => ({ value: business.bizType, label: business.bizName }))]} onValueChange={(value) => { setBizType(value); setPageNum(1); }} /></label>
          <label><span className="input-label">任务状态</span><InfrastructureSelect aria-label="任务状态" value={status} options={[{ value: 'ALL', label: '全部状态' }, ...Object.entries(importStatusNames).map(([value, label]) => ({ value, label }))]} onValueChange={(value) => { setStatus(value); setPageNum(1); }} /></label>
        </div>
      </div>}
      table={<InnerTableSurface><Table className="admin-source-table" aria-label="导入任务列表">
        <TableHeader><TableRow>{['业务 / 文件', '任务编号', '状态', '进度', '成功 / 失败', '创建时间', '操作'].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</TableRow></TableHeader>
        <TableBody>{loading ? <InfrastructureTableStateRow colSpan={7} title="正在加载导入任务" loading /> : error ? <InfrastructureTableStateRow colSpan={7} title={error} /> : rows.length === 0 ? <InfrastructureTableStateRow colSpan={7} title={businesses.length ? '暂无导入任务' : '暂无有权限的导入业务'} description="导入记录按当前登录人和所选模块展示。" /> : rows.map((task) => {
          const count = ['UPLOADED', 'VALIDATING', 'VALIDATED'].includes(task.status) ? task.validRows + task.invalidRows : task.successRows + task.failRows;
          return <TableRow key={task.taskId}>
            <td className="px-4 py-3"><div className="font-medium">{task.bizName}</div><div className="max-w-64 truncate text-xs text-cf-subtle">{task.fileName}</div></td>
            <td className="break-all px-4 py-3 text-xs">{task.taskNo}</td>
            <td className="px-4 py-3"><InfrastructureBadge tone={task.status === 'SUCCESS' ? 'success' : task.status === 'FAILED' ? 'danger' : task.status === 'PARTIAL' ? 'warning' : 'neutral'}>{importStatusNames[task.status]}</InfrastructureBadge></td>
            <td className="px-4 py-3 tabular-nums">{count} / {task.totalRows}</td>
            <td className="px-4 py-3 tabular-nums">{task.successRows} / {task.failRows}</td>
            <td className="whitespace-nowrap px-4 py-3 text-xs">{task.createTime}</td>
            <td className="px-4 py-3"><Button size="sm" variant="ghost" onClick={() => { if (service) setDialog({ service, bizType: task.bizType, taskId: task.taskId }); }}>查看任务</Button></td>
          </TableRow>;
        })}</TableBody>
      </Table></InnerTableSurface>}
      pagination={<Pagination total={total} page={pageNum} pageSize={pageSize} onPageChange={setPageNum} onPageSizeChange={(value) => { setPageSize(value); setPageNum(1); }} />}
    />
    {dialog ? <ImportDialog open {...dialog} onClose={() => { setDialog(null); refresh(); }} onSuccess={refresh} /> : null}
  </section>;
}

export default function ImportPage() {
  return <PermissionGuard permissions={['system:import:list']}><ImportWorkspace /></PermissionGuard>;
}
