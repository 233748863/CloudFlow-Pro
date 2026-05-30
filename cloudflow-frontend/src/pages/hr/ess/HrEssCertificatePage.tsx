import React, { useCallback, useEffect, useState } from 'react';
import { Download, FileBadge, Plus, RefreshCcw, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/common';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { BaseDialog } from '@/components/common/BaseDialog';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  HrCertificateRequest,
  HrCertificateRequestPayload,
  listCertificateRequests,
  submitCertificateRequest,
  cancelCertificateRequest,
  downloadCertificatePdf,
} from '@/services/api/hr';
import { normalizeRows, enumLabel, formatDateTimeValue, hasWorkflowStatus } from '../hrShared';
import { getCertificateStatusLabel } from '@/utils/enumLabels';

const certificateTypeLabel: Record<string, string> = {
  EMPLOYMENT: '在职证明',
  INCOME: '收入证明',
  SOCIAL_INSURANCE: '社保证明',
  CUSTOM: '其他',
};


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
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<HrCertificateRequestPayload>(defaultForm);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listCertificateRequests({ pageSize: 200 });
      setRows(normalizeRows<HrCertificateRequest>(res));
    } catch (error) {
      toast.error(getErrorMessage(error, '证明记录加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

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

  const handleCancel = async (id: number) => {
    try {
      await cancelCertificateRequest(id);
      toast.success('已取消');
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

  return (
    <div className="p-6">
      <TablePageLayout
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={() => { setForm(defaultForm); setDialogOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />申请证明
            </Button>
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCcw className="mr-2 h-4 w-4" />刷新
            </Button>
          </div>
        }
        table={
          <TableSurfaceCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>申请号</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>用途</TableHead>
                  <TableHead>接收单位</TableHead>
                  <TableHead>份数</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>开具时间</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-slate-400">加载中...</TableCell></TableRow>
                ) : rows.length ? (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">{row.requestNo}</TableCell>
                      <TableCell>{enumLabel(certificateTypeLabel, row.certificateType)}</TableCell>
                      <TableCell>{row.purpose || '-'}</TableCell>
                      <TableCell>{row.recipientOrg || '-'}</TableCell>
                      <TableCell>{row.copies ?? 1}</TableCell>
                      <TableCell>{getCertificateStatusLabel(row.status)}</TableCell>
                      <TableCell>{formatDateTimeValue(row.issuedAt)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {row.status === 'ISSUED' && row.pdfFileId ? (
                            <Button size="sm" variant="ghost" onClick={() => void handleDownload(row)}>
                              <Download className="mr-1 h-3 w-3" />下载
                            </Button>
                          ) : null}
                          {hasWorkflowStatus(row.status, 'DRAFT', 'PENDING', 'APPROVING') ? (
                            <Button size="sm" variant="ghost" onClick={() => void handleCancel(row.id)}>
                              <XCircle className="mr-1 h-3 w-3" />取消
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-slate-400">暂无申请</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableSurfaceCard>
        }
      />

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
                {Object.entries(certificateTypeLabel).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
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
    </div>
  );
};

export default HrEssCertificatePage;
