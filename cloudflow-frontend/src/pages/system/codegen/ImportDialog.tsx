import React, { useState } from 'react';
import { toast } from 'sonner';
import { BaseDialog, Button, Input, Pagination } from '@/components/common';
import { importCodegenTables, pageDatabaseTables } from '@/services/api/codegen';
import type { CodegenOptions } from '@/services/api/codegen';
import { getErrorMessage } from '@/utils/errorMessage';
import { InfrastructureField, InfrastructureSelect, InfrastructureTableStateRow, infrastructureCheckboxClassName } from '../_components/InfrastructurePrimitives';
import { useInfrastructurePage } from '../_components/useInfrastructurePage';

export function ImportDialog({ options, onClose, onImported }: {
  options: CodegenOptions;
  onClose: () => void;
  onImported: () => void;
}) {
  const page = useInfrastructurePage(pageDatabaseTables, { pageNum: 1, pageSize: 10, tableName: '' });
  const [search, setSearch] = useState('');
  const [moduleName, setModuleName] = useState(options.modules[0] || 'system');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const importSelected = async () => {
    if (!selected.length || busy) return;
    setBusy(true);
    try {
      await importCodegenTables(selected, moduleName);
      toast.success(`已导入 ${selected.length} 张表的结构`);
      onImported();
    } catch (reason) { toast.error(getErrorMessage(reason, '导入表结构失败')); }
    finally { setBusy(false); }
  };

  return (
    <BaseDialog open title="导入数据库表结构" description="仅导入配置，不修改数据库表与业务数据。已导入的表不会重复列出。" width="wide" onClose={() => { if (!busy) onClose(); }} footer={<><Button variant="outline" disabled={busy} onClick={onClose}>取消</Button><Button disabled={!selected.length || busy} onClick={() => void importSelected()}>{busy ? '导入中…' : `导入所选（${selected.length}）`}</Button></>}>
      <form className="mb-4 grid items-end gap-3 sm:grid-cols-3" onSubmit={(event) => { event.preventDefault(); page.setQuery((current) => ({ ...current, tableName: search.trim(), pageNum: 1 })); }}>
        <InfrastructureField label="数据库表名"><Input value={search} onChange={(event) => setSearch(event.target.value)} /></InfrastructureField>
        <InfrastructureField label="归属模块"><InfrastructureSelect value={moduleName} options={options.modules.map((value) => ({ value, label: value }))} onValueChange={setModuleName} /></InfrastructureField>
        <Button type="submit" variant="outline" disabled={page.loading}>查询表</Button>
      </form>
      <div className="overflow-x-auto"><table className="w-full min-w-[540px] text-sm">
        <thead><tr className="border-b text-left text-cf-subtle"><th className="w-12 px-3 py-3"><input type="checkbox" className={infrastructureCheckboxClassName} aria-label="选择本页数据库表" disabled={page.loading || !page.rows.length || busy} checked={page.rows.length > 0 && page.rows.every((table) => selected.includes(table.tableName))} onChange={(event) => setSelected((current) => event.target.checked ? Array.from(new Set([...current, ...page.rows.map((table) => table.tableName)])) : current.filter((tableName) => !page.rows.some((table) => table.tableName === tableName)))} /></th><th className="px-3 py-3">数据库表名</th><th className="px-3 py-3">表说明</th></tr></thead>
        <tbody>{page.loading || page.error || !page.rows.length ? <InfrastructureTableStateRow colSpan={3} loading={page.loading} title={page.loading ? '正在读取数据库表' : page.error || '没有可导入的表'} /> : page.rows.map((table) => <tr key={table.tableName} className="border-b last:border-0"><td className="px-3 py-3"><input type="checkbox" className={infrastructureCheckboxClassName} aria-label={`导入 ${table.tableName}`} disabled={busy} checked={selected.includes(table.tableName)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, table.tableName] : current.filter((tableName) => tableName !== table.tableName))} /></td><td className="px-3 py-3 font-mono text-xs">{table.tableName}</td><td className="px-3 py-3">{table.tableComment || '—'}</td></tr>)}</tbody>
      </table></div>
      <Pagination total={page.total} page={page.query.pageNum} pageSize={page.query.pageSize} onPageChange={(pageNum) => page.setQuery((current) => ({ ...current, pageNum }))} onPageSizeChange={(pageSize) => page.setQuery((current) => ({ ...current, pageNum: 1, pageSize }))} />
    </BaseDialog>
  );
}
