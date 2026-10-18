import React, { useEffect, useState } from 'react';
import { Plus, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, Pagination, PermissionGuard, WarningConfirmDialog } from '@/components/common';
import { TablePageLayout } from '@/components/layout';
import { getCodegenDetail, getCodegenOptions, pageCodegenTables, previewCodegenTable, removeCodegenTables, syncCodegenTable } from '@/services/api/codegen';
import type { CodegenDetail, CodegenOptions, CodegenTable } from '@/services/api/codegen';
import { getErrorMessage } from '@/utils/errorMessage';
import { InfrastructureBadge, InfrastructureField, InfrastructurePageHeader, InfrastructureSelect, InfrastructureTableStateRow } from '../_components/InfrastructurePrimitives';
import { useInfrastructurePage } from '../_components/useInfrastructurePage';
import { ConfigurationDialog } from './ConfigurationDialog';
import { ImportDialog } from './ImportDialog';
import { PreviewDialog } from './PreviewDialog';

export default function CodegenIndexPage() {
  const page = useInfrastructurePage(pageCodegenTables, { pageNum: 1, pageSize: 10, tableName: '', moduleName: '' });
  const [options, setOptions] = useState<CodegenOptions | null>(null);
  const [optionsError, setOptionsError] = useState('');
  const [optionsRevision, setOptionsRevision] = useState(0);
  const [search, setSearch] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [detail, setDetail] = useState<CodegenDetail | null>(null);
  const [preview, setPreview] = useState<{ table: CodegenTable; files: Record<string, string> } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CodegenTable | null>(null);
  const [syncTarget, setSyncTarget] = useState<CodegenTable | null>(null);
  const [busy, setBusy] = useState(false);
  const hasTableRows = !page.loading && !page.error && page.rows.length > 0;

  useEffect(() => {
    let active = true;
    setOptionsError('');
    getCodegenOptions().then((result) => { if (active) setOptions(result); })
      .catch((reason: unknown) => { if (active) { setOptions(null); setOptionsError(getErrorMessage(reason, '生成器选项加载失败')); } });
    return () => { active = false; };
  }, [optionsRevision]);

  const edit = async (table: CodegenTable) => {
    if (!table.tableId || busy) return;
    setBusy(true);
    try { setDetail(await getCodegenDetail(table.tableId)); }
    catch (reason) { toast.error(getErrorMessage(reason, '读取生成配置失败')); }
    finally { setBusy(false); }
  };
  const showPreview = async (table: CodegenTable) => {
    if (!table.tableId || busy) return;
    setBusy(true);
    try { setPreview({ table, files: await previewCodegenTable(table.tableId) }); }
    catch (reason) { toast.error(getErrorMessage(reason, '生成预览失败')); }
    finally { setBusy(false); }
  };
  const sync = async () => {
    if (!syncTarget?.tableId || busy) return;
    setBusy(true);
    try { await syncCodegenTable(syncTarget.tableId); toast.success('表结构已同步，现有字段配置已保留'); page.refresh(); }
    catch (reason) { toast.error(getErrorMessage(reason, '同步表结构失败')); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!deleteTarget?.tableId || busy) return;
    setBusy(true);
    try { await removeCodegenTables([deleteTarget.tableId]); toast.success('生成配置已删除'); page.refresh(); }
    catch (reason) { toast.error(getErrorMessage(reason, '删除配置失败')); }
    finally { setBusy(false); }
  };

  return <div className="admin-source-page space-y-5">
    <InfrastructurePageHeader kicker="开发工具" title="表结构代码生成" description="从数据库表导入结构，维护生成规则，预览并下载后端代码；不会自动执行生成的建表或授权语句。">
      <Button variant="outline" disabled={page.loading} onClick={() => { page.refresh(); setOptionsRevision((value) => value + 1); }}><RefreshCw size={16} />刷新</Button>
      <PermissionGuard permissions={['system:codegen:import']} hidden><Button disabled={!options || busy} onClick={() => setImportOpen(true)}><Plus size={16} />导入表结构</Button></PermissionGuard>
    </InfrastructurePageHeader>
    {optionsError && <p role="alert" className="text-sm text-cf-muted">{optionsError}</p>}
    <TablePageLayout
      filters={<form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); page.setQuery((current) => ({ ...current, tableName: search.trim(), pageNum: 1 })); }}>
        <InfrastructureField label="数据库表名"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索已导入表" /></InfrastructureField>
        <InfrastructureField label="所属模块"><InfrastructureSelect value={page.query.moduleName} options={[{ value: '', label: '全部模块' }, ...(options?.modules || []).map((value) => ({ value, label: value }))]} onValueChange={(value) => page.setQuery((current) => ({ ...current, moduleName: value, pageNum: 1 }))} /></InfrastructureField>
        <Button type="submit" variant="outline"><Search size={16} />查询</Button>
      </form>}
      table={<div className="overflow-x-auto"><table className={`w-full text-sm ${hasTableRows ? 'min-w-[850px]' : 'table-fixed'}`}>
        <thead className={hasTableRows ? undefined : 'hidden sm:table-header-group'}><tr className="border-b text-left text-cf-subtle">{['数据库表', '功能 / 实体', '所属模块', '模板', '操作'].map((heading) => <th key={heading} className="px-4 py-3 font-medium">{heading}</th>)}</tr></thead>
        <tbody>{!hasTableRows ? <InfrastructureTableStateRow colSpan={5} loading={page.loading} title={page.loading ? '正在加载已导入表' : page.error || '尚未导入数据库表'} description={page.error ? '确认生成器已启用后点击刷新' : '先导入表结构，再配置字段和生成规则'} /> : page.rows.map((table) => <tr key={table.tableId} className="border-b last:border-0">
          <td className="px-4 py-3"><p className="font-mono text-xs text-cf-title">{table.tableName}</p><p className="mt-1 text-xs text-cf-subtle">{table.tableComment || '—'}</p></td>
          <td className="px-4 py-3">{table.functionName}<p className="mt-1 font-mono text-xs text-cf-subtle">{table.className}</p></td>
          <td className="px-4 py-3">{table.moduleName}</td><td className="px-4 py-3"><InfrastructureBadge>{table.tplCategory}</InfrastructureBadge></td>
          <td className="px-4 py-3"><div className="flex gap-1">
            <PermissionGuard permissions={['system:codegen:edit']} hidden><Button size="sm" variant="ghost" disabled={busy || !options} onClick={() => void edit(table)}>配置</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => setSyncTarget(table)}>同步</Button></PermissionGuard>
            <PermissionGuard permissions={['system:codegen:preview']} hidden><Button size="sm" variant="ghost" disabled={busy} onClick={() => void showPreview(table)}>预览与产出</Button></PermissionGuard>
            <PermissionGuard permissions={['system:codegen:remove']} hidden><Button size="sm" variant="ghost" disabled={busy} onClick={() => setDeleteTarget(table)}>删除</Button></PermissionGuard>
          </div></td>
        </tr>)}</tbody>
      </table></div>}
      pagination={<Pagination total={page.total} page={page.query.pageNum} pageSize={page.query.pageSize} onPageChange={(pageNum) => page.setQuery((current) => ({ ...current, pageNum }))} onPageSizeChange={(pageSize) => page.setQuery((current) => ({ ...current, pageNum: 1, pageSize }))} />}
    />
    {importOpen && options && <ImportDialog options={options} onClose={() => setImportOpen(false)} onImported={() => { setImportOpen(false); page.refresh(); }} />}
    {detail && options && <ConfigurationDialog key={detail.table.tableId} detail={detail} options={options} onClose={() => setDetail(null)} onSaved={() => { setDetail(null); page.refresh(); }} />}
    {preview && <PreviewDialog key={preview.table.tableId} table={preview.table} files={preview.files} onClose={() => setPreview(null)} />}
    <WarningConfirmDialog open={Boolean(syncTarget)} onClose={() => setSyncTarget(null)} title="同步数据库表结构" message={`重新读取“${syncTarget?.tableName || ''}”的字段结构。`} description="新字段会追加，已删除字段会移除，其余字段的配置保留。" onConfirm={() => void sync()} />
    <WarningConfirmDialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="删除代码生成配置" message={`确认删除“${deleteTarget?.tableName || ''}”的生成配置？`} description="只删除生成器配置，不删除数据库表和已经产出的文件。" severity="danger" onConfirm={() => void remove()} />
  </div>;
}
