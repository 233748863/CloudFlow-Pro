import React, { useMemo, useState } from 'react';
import { BellRing, Edit, Eye, FileText, Layers, Plus, Power, RefreshCw, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button, Input, Pagination, PermissionGuard, Switch, Textarea, WarningConfirmDialog } from '@/components/common';
import { InnerTableSurface, TablePageLayout } from '@/components/layout';
import {
  addMessageTemplate, getMessageTemplate, listMessageTemplates, previewMessageTemplate,
  removeMessageTemplates, updateMessageTemplate,
} from '@/services/api/message';
import type { MessageCategory, MessageChannelType, MessagePageQuery, MessageStatus, MessageTemplate } from '@/services/api/message';
import { getErrorMessage } from '@/utils/errorMessage';
import { cn } from '@/utils/cn';
import { InfrastructureBadge, InfrastructureDialogPanel, InfrastructureField, InfrastructurePageHeader, InfrastructureSelect, InfrastructureStats, InfrastructureTableStateRow } from '../_components/InfrastructurePrimitives';
import { useInfrastructurePage } from '../_components/useInfrastructurePage';
import { CATEGORY_LABELS, CHANNEL_LABELS, categoryOptions, channelOptions, statusOptions } from './options';

const emptyTemplate = (): MessageTemplate => ({
  templateCode: '', templateName: '', channelType: 'INTERNAL', messageCategory: 'SYSTEM',
  bizModule: 'system', titleTemplate: '', contentTemplate: '', paramsDeclare: '[]',
  forceSendFlag: 0, dedupeWindowSec: 300, status: 'ENABLED',
});
const moduleOptions = [
  { value: 'system', label: '系统' }, { value: 'workflow', label: '工作流' },
  { value: 'oa', label: '办公' }, { value: 'crm', label: '客户管理' }, { value: 'hr', label: '人事' },
];

export default function MessageTemplatePage() {
  const page = useInfrastructurePage<MessageTemplate, MessagePageQuery>(listMessageTemplates, { pageNum: 1, pageSize: 10 });
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<MessageTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MessageTemplate | null>(null);
  const [previewTarget, setPreviewTarget] = useState<MessageTemplate | null>(null);
  const [paramsText, setParamsText] = useState('{}');
  const [preview, setPreview] = useState<{ title: string; content: string } | null>(null);

  const updateField = <Key extends keyof MessageTemplate>(key: Key, value: MessageTemplate[Key]) =>
    setForm((current) => current ? { ...current, [key]: value } : current);

  const openEditor = async (template: MessageTemplate) => {
    if (!template.templateId) return;
    setBusy(true);
    try { setForm(await getMessageTemplate(template.templateId)); }
    catch (reason) { toast.error(getErrorMessage(reason, '读取模板失败')); }
    finally { setBusy(false); }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form || busy) return;
    try {
      const declaration: unknown = JSON.parse(form.paramsDeclare || '[]');
      if (!Array.isArray(declaration) || declaration.some((item) => !item || typeof item.name !== 'string' || !item.name.trim())) {
        toast.error('参数声明须为数组，每项至少包含非空 name');
        return;
      }
    } catch {
      toast.error('参数声明格式有误，请填写合法 JSON 数组');
      return;
    }
    setBusy(true);
    try {
      const payload = { ...form, templateCode: form.templateCode.trim(), templateName: form.templateName.trim(), paramsDeclare: form.paramsDeclare || '[]' };
      if (form.templateId) await updateMessageTemplate(payload);
      else await addMessageTemplate(payload);
      toast.success('消息模板已保存');
      setForm(null);
      page.refresh();
    } catch (reason) { toast.error(getErrorMessage(reason, '保存模板失败')); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!deleteTarget?.templateId || busy) return;
    setBusy(true);
    try {
      await removeMessageTemplates([deleteTarget.templateId]);
      toast.success('模板已删除');
      page.refresh();
    } catch (reason) { toast.error(getErrorMessage(reason, '删除模板失败')); }
    finally { setBusy(false); }
  };

  const openPreview = (template: MessageTemplate) => {
    const sample: Record<string, string> = {};
    try {
      const declaration: unknown = JSON.parse(template.paramsDeclare || '[]');
      if (Array.isArray(declaration)) {
        declaration.forEach((item) => { if (typeof item?.name === 'string') sample[item.name] = ''; });
      }
    } catch { toast.error('模板参数声明格式有误，请先编辑修正'); }
    setParamsText(JSON.stringify(sample, null, 2));
    setPreview(null);
    setPreviewTarget(template);
  };

  const renderPreview = async () => {
    if (!previewTarget || busy) return;
    let params: unknown;
    try { params = JSON.parse(paramsText); }
    catch { toast.error('测试参数格式有误，请填写 JSON 对象'); return; }
    if (!params || Array.isArray(params) || typeof params !== 'object') {
      toast.error('测试参数须为包含参数名和值的对象');
      return;
    }
    setBusy(true);
    setPreview(null);
    try {
      setPreview(await previewMessageTemplate({ templateCode: previewTarget.templateCode, channelType: previewTarget.channelType, params: params as Record<string, unknown> }));
    } catch (reason) { toast.error(getErrorMessage(reason, '模板预览失败')); }
    finally { setBusy(false); }
  };

  const stats = useMemo(
    () => [
      {
        label: '模板总数',
        value: String(page.total),
        meta: `当前页 ${page.rows.length}`,
        icon: <FileText size={18} />,
        tone: 'blue' as const,
      },
      {
        label: '启用中',
        value: String(page.rows.filter((item) => item.status === 'ENABLED').length),
        meta: '本页启用',
        icon: <Power size={18} />,
        tone: 'green' as const,
      },
      {
        label: '强制发送',
        value: String(page.rows.filter((item) => item.forceSendFlag === 1).length),
        meta: '忽略订阅与免打扰',
        icon: <BellRing size={18} />,
        tone: 'amber' as const,
      },
      {
        label: '覆盖渠道',
        value: String(new Set(page.rows.map((item) => item.channelType)).size),
        meta: '本页去重',
        icon: <Layers size={18} />,
        tone: 'violet' as const,
      },
    ],
    [page.rows, page.total],
  );

  return (
    <section className="admin-source-page">
      <TablePageLayout
        actions={
          <div className="grid gap-5">
            <InfrastructurePageHeader kicker="MESSAGE TEMPLATES" title="消息模板" description="统一维护通知文案、消息分类和发送规则；通过参数预览检查最终内容。">
              <Button variant="outline" size="sm" disabled={page.loading} onClick={page.refresh}>
                <RefreshCw size={16} className={cn(page.loading && 'animate-spin')} />
                刷新
              </Button>
              <PermissionGuard permissions={['system:message:template:add']} hidden>
                <Button size="sm" disabled={busy} onClick={() => setForm(emptyTemplate())}><Plus size={16} />新增模板</Button>
              </PermissionGuard>
            </InfrastructurePageHeader>
            <InfrastructureStats items={stats} />
          </div>
        }
        filters={<section className="card admin-users-toolbar">
          <form className="admin-users-filter-grid" onSubmit={(event) => { event.preventDefault(); page.setQuery((current) => ({ ...current, templateCode: search.trim(), pageNum: 1 })); }}>
            <InfrastructureField label="模板编码"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="按编码搜索" /></InfrastructureField>
            <InfrastructureField label="渠道"><InfrastructureSelect value={page.query.channelType || ''} options={[{ value: '', label: '全部渠道' }, ...channelOptions]} onValueChange={(value) => page.setQuery((current) => ({ ...current, channelType: value as MessageChannelType | '', pageNum: 1 }))} /></InfrastructureField>
            <InfrastructureField label="状态"><InfrastructureSelect value={page.query.status || ''} options={[{ value: '', label: '全部状态' }, ...statusOptions]} onValueChange={(value) => page.setQuery((current) => ({ ...current, status: value as MessageStatus | '', pageNum: 1 }))} /></InfrastructureField>
            <div className="admin-users-toolbar-actions">
              <Button type="submit" size="sm"><Search size={16} />查询</Button>
              <span className="admin-users-filter-count">共 {page.total} 条</span>
            </div>
          </form>
        </section>}
        table={<InnerTableSurface className="flex min-h-0 flex-1 flex-col">
          <div className="admin-horizontal-scroll"><table className="unity-data-table admin-source-table min-w-[800px]">
            <thead><tr>{['模板', '渠道 / 分类', '发送规则', '状态', '操作'].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead>
            <tbody>{page.loading || page.error || !page.rows.length ? <InfrastructureTableStateRow colSpan={5} loading={page.loading} title={page.loading ? '正在加载模板' : page.error || '暂无匹配模板'} description={page.error ? '点击刷新重新加载' : '新增模板或调整筛选条件'} /> : page.rows.map((template) => (
              <tr key={template.templateId}>
                <td><p className="font-medium text-cf-title">{template.templateName}</p><p className="mt-1 font-mono text-xs text-cf-subtle">{template.templateCode}</p></td>
                <td>{CHANNEL_LABELS[template.channelType]} / {CATEGORY_LABELS[template.messageCategory]}</td>
                <td><p>{template.forceSendFlag === 1 ? '强制发送' : '遵循用户订阅'}</p><p className="mt-1 text-xs text-cf-subtle">{template.dedupeWindowSec ? `${template.dedupeWindowSec} 秒内去重` : '不去重'}</p></td>
                <td><InfrastructureBadge tone={template.status === 'ENABLED' ? 'success' : 'neutral'}>{template.status === 'ENABLED' ? '启用' : '停用'}</InfrastructureBadge></td>
                <td>
                  <div className="admin-users-row-actions">
                    <button type="button" disabled={busy} data-tooltip="预览模板" aria-label="预览模板" onClick={() => openPreview(template)}><Eye size={15} /></button>
                    <PermissionGuard permissions={['system:message:template:edit']} hidden>
                      <button type="button" disabled={busy} data-tooltip="编辑模板" aria-label="编辑模板" onClick={() => void openEditor(template)}><Edit size={15} /></button>
                    </PermissionGuard>
                    <PermissionGuard permissions={['system:message:template:remove']} hidden>
                      <button type="button" className="danger" disabled={busy} data-tooltip="删除模板" aria-label="删除模板" onClick={() => setDeleteTarget(template)}><Trash2 size={15} /></button>
                    </PermissionGuard>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        </InnerTableSurface>}
        pagination={<Pagination total={page.total} page={page.query.pageNum} pageSize={page.query.pageSize} onPageChange={(pageNum) => page.setQuery((current) => ({ ...current, pageNum }))} onPageSizeChange={(pageSize) => page.setQuery((current) => ({ ...current, pageNum: 1, pageSize }))} />}
      />
      <BaseDialog open={Boolean(form)} title={form?.templateId ? '编辑消息模板' : '新增消息模板'} width="wide" onClose={() => { if (!busy) setForm(null); }} footer={<><Button variant="outline" disabled={busy} onClick={() => setForm(null)}>取消</Button><Button type="submit" form="message-template-form" disabled={busy}>{busy ? '保存中…' : '保存模板'}</Button></>}>
        {form && <form id="message-template-form" onSubmit={save} className="admin-source-form-grid">
          <InfrastructureField label="模板名称"><Input required maxLength={100} value={form.templateName} onChange={(event) => updateField('templateName', event.target.value)} /></InfrastructureField>
          <InfrastructureField label="模板编码"><Input required maxLength={100} value={form.templateCode} onChange={(event) => updateField('templateCode', event.target.value)} /></InfrastructureField>
          <InfrastructureField label="渠道"><InfrastructureSelect value={form.channelType} options={channelOptions} onValueChange={(value) => updateField('channelType', value as MessageChannelType)} /></InfrastructureField>
          <InfrastructureField label="消息分类"><InfrastructureSelect value={form.messageCategory} options={categoryOptions} onValueChange={(value) => updateField('messageCategory', value as MessageCategory)} /></InfrastructureField>
          <InfrastructureField label="所属模块"><InfrastructureSelect value={form.bizModule || 'system'} options={moduleOptions} onValueChange={(value) => updateField('bizModule', value)} /></InfrastructureField>
          <InfrastructureField label="状态"><InfrastructureSelect value={form.status} options={statusOptions} onValueChange={(value) => updateField('status', value as MessageStatus)} /></InfrastructureField>
          <InfrastructureField label="标题模板" hint="使用 {{参数名}} 插入内容" className="admin-source-form-wide"><Input maxLength={500} value={form.titleTemplate || ''} onChange={(event) => updateField('titleTemplate', event.target.value)} /></InfrastructureField>
          <InfrastructureField label="正文模板" className="admin-source-form-wide"><Textarea required rows={5} value={form.contentTemplate} onChange={(event) => updateField('contentTemplate', event.target.value)} /></InfrastructureField>
          <InfrastructureField label="参数声明" hint={'JSON 数组，例如 [{"name":"userName","required":true,"desc":"姓名"}]'} className="admin-source-form-wide"><Textarea rows={4} className="font-mono" value={form.paramsDeclare || ''} onChange={(event) => updateField('paramsDeclare', event.target.value)} /></InfrastructureField>
          <InfrastructureField label="去重时间（秒）" hint="0 表示不去重"><Input required type="number" min={0} value={form.dedupeWindowSec} onChange={(event) => updateField('dedupeWindowSec', Number(event.target.value))} /></InfrastructureField>
          <InfrastructureField label="强制发送" hint="忽略订阅和免打扰，仅用于必要通知"><Switch aria-label="强制发送" checked={form.forceSendFlag === 1} onCheckedChange={(checked) => updateField('forceSendFlag', checked ? 1 : 0)} /></InfrastructureField>
          <InfrastructureField label="跳转链接模板" className="admin-source-form-wide" hint={form.channelType === 'WECOM' ? '填写本系统详情页面时发送通知卡片；不填写时发送文本，标题与正文合计最多2048字节。卡片展示摘要，完整内容在详情页查看。' : undefined}><Input maxLength={500} value={form.linkUrlTemplate || ''} onChange={(event) => updateField('linkUrlTemplate', event.target.value)} placeholder="站内页面路径，可使用 {{参数名}}" /></InfrastructureField>
          <InfrastructureField label="备注" className="admin-source-form-wide"><Textarea rows={2} maxLength={500} value={form.remark || ''} onChange={(event) => updateField('remark', event.target.value)} /></InfrastructureField>
        </form>}
      </BaseDialog>
      <BaseDialog open={Boolean(previewTarget)} title={`预览已保存模板：${previewTarget?.templateName || ''}`} width="wide" onClose={() => { if (!busy) setPreviewTarget(null); }} footer={<Button disabled={busy} onClick={() => void renderPreview()}>{busy ? '生成预览中…' : '生成预览'}</Button>}>
        <div className="admin-dialog-stack">
          <InfrastructureField label="测试参数" hint="填写参数名和值，不会发送消息"><Textarea rows={5} className="font-mono" value={paramsText} onChange={(event) => { setParamsText(event.target.value); setPreview(null); }} /></InfrastructureField>
          {preview && <InfrastructureDialogPanel title="预览结果" description={preview.title || '无标题'}>
            <p aria-live="polite" className="whitespace-pre-wrap break-words text-sm leading-7 text-cf-muted">{preview.content}</p>
          </InfrastructureDialogPanel>}
        </div>
      </BaseDialog>
      <WarningConfirmDialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="删除消息模板" message={`确认删除“${deleteTarget?.templateName || ''}”？`} description="业务继续引用此编码时会记录发送失败，请确认已停止使用。" severity="danger" onConfirm={() => void remove()} />
    </section>
  );
}
