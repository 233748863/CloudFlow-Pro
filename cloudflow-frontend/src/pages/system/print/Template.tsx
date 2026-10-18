import React, { useRef, useState } from 'react';
import { Download, Edit, Eye, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button, Input, Pagination, PermissionGuard, Switch, Textarea, WarningConfirmDialog } from '@/components/common';
import { InnerTableSurface, TablePageLayout } from '@/components/layout';
import { downloadPrintTemplate, getPrintTemplate, listPrintTemplates, removePrintTemplate, savePrintTemplate } from '@/services/api/print';
import type { PrintTemplate, PrintTemplateQuery } from '@/services/api/print';
import { getErrorMessage } from '@/utils/errorMessage';
import { InfrastructureBadge, InfrastructureField, InfrastructurePageHeader, InfrastructureSelect, InfrastructureTableStateRow } from '../_components/InfrastructurePrimitives';
import { useInfrastructurePage } from '../_components/useInfrastructurePage';
import { PrintTemplatePreviewDialog } from '@/components/printing/PrintTemplatePreviewDialog';
import { PrintRecordsDialog } from './PrintRecordsDialog';

const bizOptions = [
  { value: 'SALARY_SLIP', label: '工资条' }, { value: 'OFFER', label: '员工 Offer' },
  { value: 'LABOR_CONTRACT', label: '劳动合同' }, { value: 'CERTIFICATE', label: '在职/离职证明' },
  { value: 'BUSINESS_CONTRACT', label: '商务合同' }, { value: 'EXPENSE_CLAIM', label: '报销单' },
  { value: 'PURCHASE_ORDER', label: '采购单' }, { value: 'ASSET_LABEL', label: '资产标签' },
];
const statusOptions = [{ value: 'ENABLED', label: '启用' }, { value: 'DISABLED', label: '停用' }];
const emptyTemplate = (): PrintTemplate => ({
  templateCode: '', templateName: '', bizType: 'SALARY_SLIP', templateFormat: 'HTML', outputFormat: 'PDF',
  templateContent: '', paperSize: 'A4', orientation: 'PORTRAIT', marginTop: 10, marginBottom: 10,
  marginLeft: 10, marginRight: 10, variablesDeclare: '[]', defaultFlag: 0, status: 'ENABLED',
});

export default function PrintTemplatePage() {
  const page = useInfrastructurePage<PrintTemplate, PrintTemplateQuery>(listPrintTemplates, { pageNum: 1, pageSize: 10 });
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<PrintTemplate | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PrintTemplate | null>(null);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const fileReadRevision = useRef(0);
  const updateField = <Key extends keyof PrintTemplate>(key: Key, value: PrintTemplate[Key]) =>
    setForm((current) => current ? { ...current, [key]: value } : current);
  const closeEditor = () => { if (!busy) { fileReadRevision.current++; setForm(null); setFile(null); } };

  const open = async (template?: PrintTemplate, viewing = false) => {
    if (busy) return;
    setBusy(true); fileReadRevision.current++; setFile(null); setReadOnly(viewing);
    try { setForm(template?.templateId ? await getPrintTemplate(template.templateId) : emptyTemplate()); }
    catch (reason) { toast.error(getErrorMessage(reason, '读取模板失败')); }
    finally { setBusy(false); }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form || busy || readOnly) return;
    try {
      const declaration: unknown = JSON.parse(form.variablesDeclare || '[]');
      if (!declaration || typeof declaration !== 'object') throw new Error('变量声明须为 JSON 对象或数组');
      if (form.templateFormat === 'EXCEL' && !file && !form.templateFileUrl) throw new Error('请选择 Excel 模板文件');
    } catch (reason) { toast.error(getErrorMessage(reason, '变量声明格式不正确')); return; }
    setBusy(true);
    try {
      await savePrintTemplate({ ...form, templateCode: form.templateCode.trim(), templateName: form.templateName.trim() }, file);
      toast.success('打印模板已保存'); fileReadRevision.current++;
      setForm(null); setFile(null); page.refresh();
    } catch (reason) { toast.error(getErrorMessage(reason, '保存失败；版本冲突时请关闭后重新打开模板')); }
    finally { setBusy(false); }
  };

  const chooseFile = async (selected?: File) => {
    if (!selected || !form || readOnly || busy) return;
    const revision = ++fileReadRevision.current;
    if (form.templateFormat === 'EXCEL') {
      if (!/\.xlsx?$/i.test(selected.name)) { toast.error('请选择 xls 或 xlsx 文件'); return; }
      setFile(selected); return;
    }
    if (!/\.html?$/i.test(selected.name)) { toast.error('请选择 HTML 文件'); return; }
    setBusy(true);
    try {
      if (selected.size > 4194304) throw new Error('HTML 文件大小不能超过 4 MiB');
      const content = await selected.text();
      if (content.length > 1048576) throw new Error('HTML 内容不能超过 1048576 个字符');
      if (revision === fileReadRevision.current) updateField('templateContent', content);
    } catch (reason) { toast.error(getErrorMessage(reason, 'HTML 文件读取失败')); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!deleteTarget?.templateId || deleteTarget.version == null || busy) return;
    setBusy(true);
    try {
      await removePrintTemplate(deleteTarget.templateId, deleteTarget.version);
      setDeleteTarget(null); page.refresh(); toast.success('模板已删除');
    } catch (reason) { toast.error(getErrorMessage(reason, '删除失败')); }
    finally { setBusy(false); }
  };

  const download = async () => {
    if (!form?.templateId || busy) return;
    setBusy(true);
    try {
      const blob = await downloadPrintTemplate(form.templateId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = blob instanceof File ? blob.name : form.templateCode + '.xlsx';
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) { toast.error(getErrorMessage(reason, '下载模板失败')); }
    finally { setBusy(false); }
  };

  return <section className="admin-source-page">
    <TablePageLayout
      actions={<InfrastructurePageHeader kicker="PRINT TEMPLATES" title="打印模板" description="维护业务模板、纸张和默认版本，使用示例数据预览，并查询业务打印记录。">
        <PermissionGuard permissions={['system:print:record:list']} hidden><Button variant="outline" size="sm" disabled={busy} onClick={() => setRecordsOpen(true)}>打印记录</Button></PermissionGuard>
        <Button variant="outline" size="sm" disabled={page.loading || busy} onClick={page.refresh}><RefreshCw size={16} />刷新</Button>
        <PermissionGuard permissions={['system:print:template:edit']} hidden><Button size="sm" disabled={busy} onClick={() => void open()}><Plus size={16} />新增模板</Button></PermissionGuard>
      </InfrastructurePageHeader>}
      filters={<section className="card admin-users-toolbar"><form className="admin-users-filter-grid" onSubmit={(event) => { event.preventDefault(); page.setQuery((current) => ({ ...current, templateCode: search.trim(), pageNum: 1 })); }}>
        <InfrastructureField label="模板编码"><Input value={search} maxLength={50} onChange={(event) => setSearch(event.target.value)} placeholder="按编码查询" /></InfrastructureField>
        <InfrastructureField label="业务类型"><InfrastructureSelect options={[{ value: 'ALL', label: '全部业务' }, ...bizOptions]} value={page.query.bizType || 'ALL'} onValueChange={(value) => page.setQuery((current) => ({ ...current, bizType: value === 'ALL' ? '' : value, pageNum: 1 }))} /></InfrastructureField>
        <InfrastructureField label="状态"><InfrastructureSelect options={[{ value: 'ALL', label: '全部状态' }, ...statusOptions]} value={page.query.status || 'ALL'} onValueChange={(value) => page.setQuery((current) => ({ ...current, status: value === 'ALL' ? '' : value, pageNum: 1 }))} /></InfrastructureField>
        <div className="admin-users-toolbar-actions"><Button type="submit" size="sm"><Search size={16} />查询</Button><span className="admin-users-filter-count">共 {page.total} 条</span></div>
      </form></section>}
      table={<InnerTableSurface className="flex min-h-0 flex-1 flex-col"><div className="admin-horizontal-scroll"><table className="unity-data-table admin-source-table min-w-[800px]">
        <thead><tr>{['模板', '业务类型', '模板 / 输出', '默认 / 状态', '版本', '操作'].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead>
        <tbody>{page.loading || page.error || !page.rows.length ? <InfrastructureTableStateRow colSpan={6} loading={page.loading} title={page.loading ? '正在加载模板' : page.error || '暂无打印模板'} description={page.error ? '点击刷新重试' : '新增模板或调整筛选条件'} /> : page.rows.map((row) => <tr key={row.templateId}>
          <td><p className="font-medium text-cf-title">{row.templateName}</p><p className="mt-1 font-mono text-xs text-cf-subtle">{row.templateCode}</p></td>
          <td>{bizOptions.find((option) => option.value === row.bizType)?.label || row.bizType}</td><td>{row.templateFormat} / {row.outputFormat}</td>
          <td><div className="flex gap-2">{row.defaultFlag === 1 && <InfrastructureBadge tone="info">默认</InfrastructureBadge>}<InfrastructureBadge tone={row.status === 'ENABLED' ? 'success' : 'neutral'}>{row.status === 'ENABLED' ? '启用' : '停用'}</InfrastructureBadge></div></td>
          <td>{row.version}</td><td><div className="admin-users-row-actions">
            <button type="button" disabled={busy} aria-label="查看模板" data-tooltip="查看模板" onClick={() => void open(row, true)}><Eye size={15} /></button>
            <Button variant="outline" className="min-h-11 min-w-11" disabled={busy || !row.templateId} onClick={() => { if (row.templateId) setPreviewId(row.templateId); }}>示例预览</Button>
            <PermissionGuard permissions={['system:print:template:edit']} hidden>
              <button type="button" disabled={busy} aria-label="编辑模板" data-tooltip="编辑模板" onClick={() => void open(row)}><Edit size={15} /></button>
              <button type="button" disabled={busy} className="danger" aria-label="删除模板" data-tooltip="删除模板" onClick={() => setDeleteTarget(row)}><Trash2 size={15} /></button>
            </PermissionGuard>
          </div></td></tr>)}</tbody>
      </table></div></InnerTableSurface>}
      pagination={<Pagination total={page.total} page={page.query.pageNum} pageSize={page.query.pageSize} onPageChange={(pageNum) => page.setQuery((current) => ({ ...current, pageNum }))} onPageSizeChange={(pageSize) => page.setQuery((current) => ({ ...current, pageSize, pageNum: 1 }))} />}
    />
    <BaseDialog open={Boolean(form)} title={readOnly ? '查看打印模板' : form?.templateId ? '编辑打印模板' : '新增打印模板'} width="wide" onClose={closeEditor} footer={<><Button variant="outline" disabled={busy} onClick={closeEditor}>{readOnly ? '关闭' : '取消'}</Button>{!readOnly && <Button type="submit" form="print-template-form" disabled={busy}>{busy ? '保存中…' : '保存模板'}</Button>}</>}>
      {form && <form id="print-template-form" onSubmit={save}><fieldset disabled={busy || readOnly} className="admin-source-form-grid">
        <InfrastructureField label="模板名称"><Input required maxLength={100} value={form.templateName} onChange={(event) => updateField('templateName', event.target.value)} /></InfrastructureField>
        <InfrastructureField label="模板编码"><Input required maxLength={50} value={form.templateCode} onChange={(event) => updateField('templateCode', event.target.value)} /></InfrastructureField>
        <InfrastructureField label="业务类型" hint="标准业务编码或自定义大写编码"><Input required maxLength={50} list="print-biz-types" pattern="[A-Z][A-Z0-9_]*" value={form.bizType} onChange={(event) => updateField('bizType', event.target.value.toUpperCase())} /><datalist id="print-biz-types">{bizOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</datalist></InfrastructureField>
        <InfrastructureField label="模板格式"><InfrastructureSelect disabled={busy || readOnly} options={[{ value: 'HTML', label: 'HTML' }, { value: 'EXCEL', label: 'Excel' }]} value={form.templateFormat} onValueChange={(value) => { fileReadRevision.current++; setFile(null); setForm((current) => current ? { ...current, templateFormat: value as PrintTemplate['templateFormat'], templateContent: '', templateFileUrl: null, outputFormat: value === 'HTML' ? 'PDF' : 'EXCEL' } : current); }} /></InfrastructureField>
        <InfrastructureField label="输出格式"><InfrastructureSelect disabled={busy || readOnly} options={form.templateFormat === 'HTML' ? [{ value: 'PDF', label: 'PDF' }, { value: 'HTML', label: 'HTML' }] : [{ value: 'EXCEL', label: 'Excel' }, { value: 'PDF', label: 'PDF' }]} value={form.outputFormat} onValueChange={(value) => updateField('outputFormat', value as PrintTemplate['outputFormat'])} /></InfrastructureField>
        <InfrastructureField label="导入模板文件" hint={form.templateFormat === 'HTML' ? 'HTML 内容导入编辑框后保存；最多1048576个字符' : file?.name || (form.templateFileUrl ? '已保存模板文件；可重新上传替换' : '请选择 xls/xlsx，大小遵循文件存储配置')}><Input key={form.templateFormat} type="file" accept={form.templateFormat === 'HTML' ? '.html,.htm' : '.xls,.xlsx'} onChange={(event) => void chooseFile(event.target.files?.[0])} /></InfrastructureField>
        {form.templateFormat === 'HTML' && <InfrastructureField label="HTML 模板内容" hint="保存后可使用示例数据预览受限模板的渲染结果" className="admin-source-form-wide"><Textarea required rows={12} maxLength={1048576} value={form.templateContent || ''} onChange={(event) => updateField('templateContent', event.target.value)} /></InfrastructureField>}
        <InfrastructureField label="纸张规格"><InfrastructureSelect disabled={busy || readOnly} options={['A4', 'A5', 'LETTER', 'CUSTOM'].map((value) => ({ value, label: value === 'CUSTOM' ? '自定义' : value }))} value={form.paperSize} onValueChange={(value) => updateField('paperSize', value as PrintTemplate['paperSize'])} /></InfrastructureField>
        <InfrastructureField label="纸张方向"><InfrastructureSelect disabled={busy || readOnly} options={[{ value: 'PORTRAIT', label: '纵向' }, { value: 'LANDSCAPE', label: '横向' }]} value={form.orientation} onValueChange={(value) => updateField('orientation', value as PrintTemplate['orientation'])} /></InfrastructureField>
        {form.paperSize === 'CUSTOM' && (['paperWidthMm', 'paperHeightMm'] as const).map((key) => <InfrastructureField key={key} label={key === 'paperWidthMm' ? '基础宽度（mm）' : '基础高度（mm）'}><Input type="number" required min="0.01" max="9999.99" step="0.01" value={form[key] ?? ''} onChange={(event) => updateField(key, event.target.value === '' ? null : Number(event.target.value))} /></InfrastructureField>)}
        {([['marginTop', '上边距'], ['marginBottom', '下边距'], ['marginLeft', '左边距'], ['marginRight', '右边距']] as const).map(([key, label]) => <InfrastructureField key={key} label={label + '（mm）'}><Input required type="number" min="0" max="9999.99" step="0.01" value={form[key]} onChange={(event) => updateField(key, event.target.valueAsNumber)} /></InfrastructureField>)}
        <InfrastructureField label="变量声明（JSON）" hint="供配置参考，填写对象或数组" className="admin-source-form-wide"><Textarea rows={4} maxLength={65536} value={form.variablesDeclare || ''} onChange={(event) => updateField('variablesDeclare', event.target.value)} /></InfrastructureField>
        <InfrastructureField label="默认模板" hint="设为默认后，同业务原默认模板会自动取消"><Switch disabled={busy || readOnly} checked={form.defaultFlag === 1} onCheckedChange={(checked) => setForm((current) => current ? { ...current, defaultFlag: checked ? 1 : 0, status: checked ? 'ENABLED' : current.status } : current)} /></InfrastructureField>
        <InfrastructureField label="状态"><InfrastructureSelect disabled={busy || readOnly} options={statusOptions} value={form.status} onValueChange={(value) => setForm((current) => current ? { ...current, status: value as PrintTemplate['status'], defaultFlag: value === 'DISABLED' ? 0 : current.defaultFlag } : current)} /></InfrastructureField>
        <InfrastructureField label="备注" className="admin-source-form-wide"><Textarea rows={2} maxLength={500} value={form.remark || ''} onChange={(event) => updateField('remark', event.target.value)} /></InfrastructureField>
      </fieldset>{form.templateFormat === 'EXCEL' && form.templateId && form.templateFileUrl && <div className="mt-4"><Button type="button" variant="outline" disabled={busy} onClick={() => void download()}><Download size={16} />下载已保存模板</Button></div>}</form>}
    </BaseDialog>
    {previewId !== null && <PrintTemplatePreviewDialog key={previewId} templateId={previewId} onClose={() => setPreviewId(null)} />}
    {recordsOpen && <PermissionGuard permissions={['system:print:record:list']} hidden><PrintRecordsDialog onClose={() => setRecordsOpen(false)} bizOptions={bizOptions} /></PermissionGuard>}
    <WarningConfirmDialog open={Boolean(deleteTarget)} onClose={() => { if (!busy) setDeleteTarget(null); }} title="删除打印模板" message={'确认删除“' + (deleteTarget?.templateName || '') + '”？'} description="删除后该模板将无法继续用于打印，模板编码仍保留占用。" severity="danger" onConfirm={() => void remove()} />
  </section>;
}
