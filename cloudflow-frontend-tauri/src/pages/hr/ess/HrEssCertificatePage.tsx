import React, { useCallback, useEffect, useState } from 'react';
import { getConfigIntSync } from '../../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../../constants/sysConfig';
import { FileBadge, LoaderCircle, Plus, RefreshCcw, RotateCcw } from 'lucide-react';
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
  TableActionHead,
  TableHead,
  TableHeader,
} from '@/components/common';
import { TableRowActions } from '@/components/common/table-row-actions';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { FilterBar } from '@/components/layout';
import { getErrorMessage } from '@/utils/errorMessage';
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

  const filters = (
    <FilterBar
      search={{
        value: query.keyword,
        onChange: (value) => setQuery((q) => ({ ...q, keyword: value })),
        onSubmit: () => setQuery((q) => ({ ...q, pageNum: 1 })),
        placeholder: '搜索申请号/用途',
        widthClassName: 'w-full sm:w-[220px]',
      }}
      filters={[
        <div key="status" className="w-full sm:w-40">
          <Select value={query.status || '__all'} onValueChange={(v) => setQuery((q) => ({ ...q, pageNum: 1, status: v === '__all' ? '' : v }))}>
            <SelectTrigger className="h-10"><SelectValue placeholder="全部状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">全部状态</SelectItem>
              {certStatusOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>,
      ]}
      stats={[{ label: '', value: `共 ${total} 条` }]}
      actions={[
        ...(hasFilters
          ? [
              <Button key="reset" variant="outline" size="sm" onClick={() => setQuery((q) => ({ ...q, pageNum: 1, keyword: '', status: '' }))}>
                <RotateCcw className="mr-1.5 h-4 w-4" />清空条件
              </Button>,
            ]
          : []),
        <Button key="refresh" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCcw className="mr-1.5 h-4 w-4" />刷新
        </Button>,
        <Button key="add" size="sm" onClick={() => { setForm(defaultForm); setDialogOpen(true); }}>
          <Plus className="mr-1.5 h-4 w-4" />申请证明
        </Button>,
      ]}
    />
  );

  const table = (
    <TableSurfaceCard fill>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px]">
          <TableHeader className="sticky top-0 z-10">
            <tr>
              <TableHead>申请号</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>用途</TableHead>
              <TableHead>接收单位</TableHead>
              <TableHead>份数</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>开具时间</TableHead>
              <TableActionHead className="text-right">操作</TableActionHead>
            </tr>
          </TableHeader>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-16 text-center text-sm text-slate-400">
                  <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-16 text-center text-sm text-slate-400">暂无申请</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                  <td className="px-4 py-3 font-mono text-xs">{row.requestNo}</td>
                  <td className="px-4 py-3 text-sm"><DictLabel dictType="hr_certificate_type" value={String(row.certificateType ?? '')} fallback="-" /></td>
                  <td className="px-4 py-3 text-sm">{row.purpose || '-'}</td>
                  <td className="px-4 py-3 text-sm">{row.recipientOrg || '-'}</td>
                  <td className="px-4 py-3 text-sm">{row.copies ?? 1}</td>
                  <td className="px-4 py-3 text-sm">{getCertificateStatusLabel(row.status)}</td>
                  <td className="px-4 py-3 text-sm">{formatDateTimeValue(row.issuedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <TableRowActions
                      align="end"
                      actions={[
                        { key: 'download', label: '下载', semantic: 'view', onClick: () => void handleDownload(row), hidden: !(row.status === 'ISSUED' && row.pdfFileId) },
                        { key: 'cancel', label: '取消', semantic: 'void', onClick: () => setPendingCancel(row), hidden: !hasWorkflowStatus(row.status, 'DRAFT', 'PENDING', 'APPROVING') },
                      ]}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </TableSurfaceCard>
  );

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
    <div className="space-y-4">
      <TablePageLayout filters={filters} table={table} pagination={pagination} />

      <BaseDialog
        open={dialogOpen}
        title={<span className="flex items-center gap-2"><FileBadge className="h-4 w-4" />申请证明</span>}
        onClose={() => setDialogOpen(false)}
        width="normal"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>取消</Button>
            <Button onClick={() => void handleSubmit()} disabled={submitting}>{submitting ? '提交中...' : '提交申请'}</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
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
          <div>
            <Label>用途 <span className="text-rose-500">*</span></Label>
            <Input value={form.purpose} onChange={(event) => setForm((prev) => ({ ...prev, purpose: event.target.value }))} />
          </div>
          <div>
            <Label>接收单位</Label>
            <Input value={form.recipientOrg} onChange={(event) => setForm((prev) => ({ ...prev, recipientOrg: event.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>份数</Label>
              <Input
                type="number"
                min={1}
                value={form.copies ?? 1}
                onChange={(event) => setForm((prev) => ({ ...prev, copies: Number(event.target.value) || 1 }))}
              />
            </div>
            <div>
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
          <div>
            <Label>备注</Label>
            <Input value={form.remark} onChange={(event) => setForm((prev) => ({ ...prev, remark: event.target.value }))} />
          </div>
        </div>
      </BaseDialog>

      <ConfirmDialog
        open={!!pendingCancel}
        title="取消证明申请"
        message={`确认取消申请「${pendingCancel?.requestNo}」？取消后流程将终止。`}
        danger
        onCancel={() => setPendingCancel(null)}
        onConfirm={handleCancel}
      />
    </div>
  );
};

export default HrEssCertificatePage;
