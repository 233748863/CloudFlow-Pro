import React, { useCallback, useEffect, useState } from 'react';
import { getConfigIntSync } from '../../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../../constants/sysConfig';
import { Download, FileBadge, LoaderCircle, Plus, RefreshCcw, RotateCcw, Search, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  BaseDialog,
  Button,
  ConfirmDialog,
  Input,
  Label,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/common';
import { getErrorMessage } from '@/utils/errorMessage';
import { TablePageLayout, InnerTableSurface } from '@/components/layout/TablePageLayout';
import {
  HrCertificateRequest,
  HrCertificateRequestPayload,
  listCertificateRequests,
  submitCertificateRequest,
  cancelCertificateRequest,
  downloadCertificatePdf,
} from '@/services/api/hr';
import { normalizeRows, formatDateTimeValue, hasWorkflowStatus } from '../hrShared';
import { getCertificateStatusLabel } from '@/utils/enumLabels';
import { DictLabel } from '@/components/common/DictLabel';
import { useDict } from '@/hooks/useDict';

const defaultForm: HrCertificateRequestPayload = {
  certificateType: 'EMPLOYMENT',
  purpose: '',
  language: 'zh-CN',
  recipientOrg: '',
  copies: 1,
  remark: '',
};

export const HrEssCertificatePage: React.FC = () => {
  const [rows, setRows] = useState<HrCertificateRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState({ keyword: '', status: '', pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<HrCertificateRequestPayload>(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [pendingCancel, setPendingCancel] = useState<HrCertificateRequest | null>(null);
  const certTypeOptions = useDict('hr_certificate_type').getOptions();
  const certStatusOptions = useDict('hr_certificate_status').getOptions();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { pageNum: query.pageNum, pageSize: query.pageSize };
      if (query.keyword) params.keyword = query.keyword;
      if (query.status) params.status = query.status;
      const res = await listCertificateRequests(params);
      setRows(normalizeRows<HrCertificateRequest>(res));
      setTotal(res?.total ?? 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '证明记录加载失败'));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async () => {
    if (!form.purpose?.trim()) {
      toast.error('请填写用途');
      return;
    }
    setSubmitting(true);
    try {
      await submitCertificateRequest(form);
      toast.success('证明申请已提交');
      setDialogOpen(false);
      setForm(defaultForm);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '证明申请提交失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!pendingCancel) return;
    try {
      await cancelCertificateRequest(pendingCancel.id);
      toast.success('已取消');
      setPendingCancel(null);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '取消失败'));
    }
  };

  const handleDownload = async (row: HrCertificateRequest) => {
    try {
      const blob = await downloadCertificatePdf(row.id);
      const url = window.URL.createObjectURL(blob as unknown as Blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${row.requestNo}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(getErrorMessage(error, 'PDF 下载失败'));
    }
  };

  const hasFilters = Boolean(query.keyword || query.status);
  const draftCount = rows.filter((row) => hasWorkflowStatus(row.status, 'DRAFT')).length;
  const pendingCount = rows.filter((row) => hasWorkflowStatus(row.status, 'PENDING', 'APPROVING')).length;
  const issuedCount = rows.filter((row) => row.status === 'ISSUED').length;

  const pagination = total > 0 ? (
    <Pagination
      page={query.pageNum}
      pageSize={query.pageSize}
      total={total}
      onPageChange={(pageNum) => setQuery((q) => ({ ...q, pageNum }))}
      onPageSizeChange={(pageSize) => setQuery((q) => ({ ...q, pageSize, pageNum: 1 }))}
    />
  ) : null;

  return (
    <>
      <section className="admin-source-page">
        <TablePageLayout
          actions={
            <>
              <header className="admin-source-header">
                <div>
                  <p className="admin-source-kicker">certificate request</p>
                  <h2>证明申请</h2>
                  <span>申请在职证明等人事证明，跟踪审批状态并下载已开具文件。</span>
                </div>
                <div className="admin-source-controls">
                  <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
                    <RefreshCcw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />刷新
                  </Button>
                  <Button size="sm" onClick={() => { setForm(defaultForm); setDialogOpen(true); }}>
                    <Plus className="h-4 w-4" />申请证明
                  </Button>
                </div>
              </header>
        
              <section className="admin-source-stat-grid">
                <article className="card admin-source-stat admin-source-tone-blue">
                  <span className="admin-source-stat-icon"><FileBadge size={18} /></span>
                  <div><p>申请总数</p><strong>{total}</strong><span>当前查询范围</span></div>
                </article>
                <article className="card admin-source-stat admin-source-tone-amber">
                  <span className="admin-source-stat-icon"><RotateCcw size={18} /></span>
                  <div><p>草稿</p><strong>{draftCount}</strong><span>待补充提交</span></div>
                </article>
                <article className="card admin-source-stat admin-source-tone-violet">
                  <span className="admin-source-stat-icon"><Search size={18} /></span>
                  <div><p>审批中</p><strong>{pendingCount}</strong><span>待处理申请</span></div>
                </article>
                <article className="card admin-source-stat admin-source-tone-green">
                  <span className="admin-source-stat-icon"><Download size={18} /></span>
                  <div><p>已开具</p><strong>{issuedCount}</strong><span>可下载文件</span></div>
                </article>
              </section>
            </>
          }
          filters={
            <section className="card admin-users-toolbar">
              <form
                className="admin-users-filter-grid"
                onSubmit={(event) => {
                  event.preventDefault();
                  setQuery((q) => ({ ...q, pageNum: 1 }));
                }}
              >
                <label>
                  <span>申请号 / 用途</span>
                  <div className="admin-source-search-field">
                    <Search size={16} />
                    <Input
                      value={query.keyword}
                      onChange={(event) => setQuery((q) => ({ ...q, keyword: event.target.value }))}
                      className="cf-control"
                      placeholder="搜索申请号/用途"
                    />
                  </div>
                </label>
                <label>
                  <span>状态</span>
                  <Select value={query.status || '__all'} onValueChange={(v) => setQuery((q) => ({ ...q, pageNum: 1, status: v === '__all' ? '' : v }))}>
                    <SelectTrigger className="cf-control"><SelectValue placeholder="全部状态" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">全部状态</SelectItem>
                      {certStatusOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
                <div className="admin-users-toolbar-actions">
                  <Button type="submit" size="sm">查询</Button>
                  {hasFilters ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => setQuery((q) => ({ ...q, pageNum: 1, keyword: '', status: '' }))}>
                      <RotateCcw className="h-4 w-4" />清空条件
                    </Button>
                  ) : null}
                  <span className="admin-users-filter-count">共 {total} 条</span>
                </div>
              </form>
            </section>
          }
          table={
            <InnerTableSurface className="flex min-h-0 flex-1 flex-col">
              <div className="admin-horizontal-scroll">
                <table className="unity-data-table admin-source-table min-w-[1000px]">
                  <thead>
                    <tr>
                      <th>申请号</th>
                      <th>类型</th>
                      <th>用途</th>
                      <th>接收单位</th>
                      <th>份数</th>
                      <th>状态</th>
                      <th>开具时间</th>
                      <th className="text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={8} className="py-10 text-center text-sm text-cf-faint">
                          <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
                        </td>
                      </tr>
                    ) : rows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-10 text-center text-sm text-cf-faint">暂无申请</td>
                      </tr>
                    ) : (
                      rows.map((row) => (
                        <tr key={row.id}>
                          <td className="font-mono text-xs">{row.requestNo}</td>
                          <td className="text-sm"><DictLabel dictType="hr_certificate_type" value={String(row.certificateType ?? '')} fallback="-" /></td>
                          <td className="text-sm">{row.purpose || '-'}</td>
                          <td className="text-sm">{row.recipientOrg || '-'}</td>
                          <td className="text-sm">{row.copies ?? 1}</td>
                          <td className="text-sm">{getCertificateStatusLabel(row.status)}</td>
                          <td className="text-sm">{formatDateTimeValue(row.issuedAt)}</td>
                          <td>
                            <div className="admin-users-row-actions">
                              {row.status === 'ISSUED' && row.pdfFileId ? (
                                <button type="button" data-tooltip="下载" aria-label="下载" onClick={() => void handleDownload(row)}><Download size={15} /></button>
                              ) : null}
                              {hasWorkflowStatus(row.status, 'DRAFT', 'PENDING', 'APPROVING') ? (
                                <button type="button" className="danger" data-tooltip="取消" aria-label="取消" onClick={() => setPendingCancel(row)}><XCircle size={15} /></button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </InnerTableSurface>
          }
          pagination={pagination}
        />
      </section>

      <BaseDialog
        open={dialogOpen}
        title={<span className="flex items-center gap-2"><FileBadge className="h-4 w-4" />申请证明</span>}
        onClose={() => setDialogOpen(false)}
        width="normal"
        bodyClassName="admin-dialog-stack"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>取消</Button>
            <Button onClick={() => void handleSubmit()} disabled={submitting}>{submitting ? '提交中...' : '提交申请'}</Button>
          </div>
        }
      >
        <>
          <div className="admin-dialog-field">
            <Label>证明类型</Label>
            <Select value={form.certificateType} onValueChange={(value) => setForm((prev) => ({ ...prev, certificateType: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {certTypeOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="admin-dialog-field">
            <Label>用途 <span className="text-rose-500">*</span></Label>
            <Input value={form.purpose} onChange={(event) => setForm((prev) => ({ ...prev, purpose: event.target.value }))} />
          </div>
          <div className="admin-dialog-field">
            <Label>接收单位</Label>
            <Input value={form.recipientOrg} onChange={(event) => setForm((prev) => ({ ...prev, recipientOrg: event.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="admin-dialog-field">
              <Label>份数</Label>
              <Input
                type="number"
                min={1}
                value={form.copies ?? 1}
                onChange={(event) => setForm((prev) => ({ ...prev, copies: Number(event.target.value) || 1 }))}
              />
            </div>
            <div className="admin-dialog-field">
              <Label>语言</Label>
              <Select value={form.language} onValueChange={(value) => setForm((prev) => ({ ...prev, language: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="zh-CN">中文</SelectItem>
                  <SelectItem value="en-US">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="admin-dialog-field">
            <Label>备注</Label>
            <Input value={form.remark} onChange={(event) => setForm((prev) => ({ ...prev, remark: event.target.value }))} />
          </div>
        </>
      </BaseDialog>

      <ConfirmDialog
        open={!!pendingCancel}
        title="取消证明申请"
        message={`确认取消申请「${pendingCancel?.requestNo}」？取消后流程将终止。`}
        danger
        onCancel={() => setPendingCancel(null)}
        onConfirm={handleCancel}
      />
    </>
  );
};

export default HrEssCertificatePage;
