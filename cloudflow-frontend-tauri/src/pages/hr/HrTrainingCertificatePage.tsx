import React, { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  BaseDialog,
  Button,
  ConfirmDialog,
  EmployeeSelector,
  Input,
  Label,
  TableHead,
  TableHeader,
  TableRowActions,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@/components/common';
import { TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { FilterBar } from '@/components/layout';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  HrTrainingCertificate,
  HrTrainingCertificateIssuePayload,
  listTrainingCertificates,
  listMyTrainingCertificates,
  issueTrainingCertificate,
  revokeTrainingCertificate,
  regenerateTrainingCertificatePdf,
  downloadTrainingCertificatePdf,
} from '@/services/api/hr';
import { normalizeRows, formatDateValue } from './hrShared';

const CertificateList: React.FC<{ mine: boolean }> = ({ mine }) => {
  const [rows, setRows] = useState<HrTrainingCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<HrTrainingCertificateIssuePayload>({ employeeId: 0, courseId: 0 });
  const [revokeTarget, setRevokeTarget] = useState<HrTrainingCertificate | null>(null);
  const [revokeReason, setRevokeReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fetcher = mine ? listMyTrainingCertificates : listTrainingCertificates;
      const res = await fetcher({ pageSize: 200 });
      setRows(normalizeRows<HrTrainingCertificate>(res));
    } catch (error) {
      toast.error(getErrorMessage(error, '证书加载失败'));
    } finally {
      setLoading(false);
    }
  }, [mine]);

  useEffect(() => { void load(); }, [load]);

  const handleIssue = async () => {
    if (!form.employeeId || !form.courseId) {
      toast.error('请填写员工 ID 与课程 ID');
      return;
    }
    try {
      await issueTrainingCertificate(form);
      toast.success('已颁发');
      setOpen(false);
      setForm({ employeeId: 0, courseId: 0 });
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '颁发失败'));
    }
  };

  const handleRevokeConfirm = async () => {
    if (!revokeTarget) return;
    try {
      await revokeTrainingCertificate(revokeTarget.id, revokeReason || undefined);
      toast.success('已撤销');
      setRevokeTarget(null);
      setRevokeReason('');
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '撤销失败'));
    }
  };

  const handleRegenerate = async (row: HrTrainingCertificate) => {
    try { await regenerateTrainingCertificatePdf(row.id); toast.success('PDF 已重新生成'); await load(); } catch (error) { toast.error(getErrorMessage(error, '重生失败')); }
  };

  const handleDownload = async (row: HrTrainingCertificate) => {
    try {
      const blob = await downloadTrainingCertificatePdf(row.id);
      const url = window.URL.createObjectURL(blob as unknown as Blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${row.certNo}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(getErrorMessage(error, 'PDF 下载失败'));
    }
  };

  const filters = (
    <FilterBar
      stats={[{ label: '', value: `共 ${rows.length} 张` }]}
      actions={[
        <Button key="refresh" size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCcw className="mr-1.5 h-4 w-4" />刷新
        </Button>,
        ...(!mine ? [
          <Button key="issue" size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />颁发证书
          </Button>,
        ] : []),
      ]}
    />
  );

  const table = (
    <TableSurfaceCard>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[840px]">
          <TableHeader className="sticky top-0 z-10">
            <tr>
              <TableHead>证书号</TableHead>
              <TableHead>课程</TableHead>
              <TableHead>班次</TableHead>
              <TableHead>颁发日期</TableHead>
              <TableHead>到期日期</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </tr>
          </TableHeader>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr><td colSpan={7} className="py-10 text-center text-sm text-slate-400">加载中…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="py-10 text-center text-sm text-slate-400">暂无证书</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                <td className="px-4 py-3 font-mono text-xs">{row.certNo}</td>
                <td className="px-4 py-3 text-sm">{`#${row.courseId}`}</td>
                <td className="px-4 py-3 text-sm">{row.sessionId ? `#${row.sessionId}` : '-'}</td>
                <td className="px-4 py-3 text-xs">{formatDateValue(row.issueDate)}</td>
                <td className="px-4 py-3 text-xs">{formatDateValue(row.expireDate)}</td>
                <td className="px-4 py-3 text-sm">{row.status === 'VALID' ? '有效' : '已撤销'}</td>
                <td className="px-4 py-3">
                  <TableRowActions
                    actions={[
                      { key: 'download', semantic: 'export', label: '下载', onClick: () => void handleDownload(row), hidden: !row.pdfFileId },
                      { key: 'regen', semantic: 'reset', label: '重生 PDF', onClick: () => void handleRegenerate(row), hidden: mine || row.status !== 'VALID' },
                      { key: 'revoke', semantic: 'void', label: '撤销', onClick: () => { setRevokeTarget(row); setRevokeReason(''); }, hidden: mine || row.status !== 'VALID' },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TableSurfaceCard>
  );

  return (
    <div className="space-y-4">
      {filters}
      {table}

      <BaseDialog open={open} title="颁发证书" onClose={() => setOpen(false)}
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>取消</Button><Button onClick={() => void handleIssue()}>颁发</Button></div>}>
        <div className="space-y-3">
          <div><Label>员工</Label><EmployeeSelector single value={form.employeeId || null} onChange={(id) => setForm((p) => ({ ...p, employeeId: id ?? 0 }))} placeholder="选择员工" /></div>
          <div><Label>课程 ID</Label><Input type="number" value={form.courseId || ''} onChange={(e) => setForm((p) => ({ ...p, courseId: Number(e.target.value) }))} /></div>
          <div><Label>班次 ID（可选）</Label><Input type="number" value={form.sessionId || ''} onChange={(e) => setForm((p) => ({ ...p, sessionId: Number(e.target.value) || undefined }))} /></div>
          <div><Label>模板 ID（可选）</Label><Input type="number" value={form.templateId || ''} onChange={(e) => setForm((p) => ({ ...p, templateId: Number(e.target.value) || undefined }))} /></div>
        </div>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        title="撤销证书"
        message={revokeTarget ? `确认撤销证书 ${revokeTarget.certNo}?可填写撤销原因。` : ''}
        danger
        confirmText="确认撤销"
        onCancel={() => { setRevokeTarget(null); setRevokeReason(''); }}
        onConfirm={() => void handleRevokeConfirm()}
      >
        <div>
          <Label>撤销原因(可选)</Label>
          <Textarea rows={3} value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} placeholder="填写撤销原因" />
        </div>
      </ConfirmDialog>
    </div>
  );
};

export const HrTrainingCertificatePage: React.FC = () => (
  <div className="space-y-4">
    <Tabs defaultValue="mine" className="space-y-4">
      <TabsList className="w-full justify-start overflow-x-auto lg:w-auto">
        <TabsTrigger value="mine" className="flex-1 lg:flex-none">我的证书</TabsTrigger>
        <TabsTrigger value="all" className="flex-1 lg:flex-none">全员证书</TabsTrigger>
      </TabsList>
      <TabsContent value="mine"><CertificateList mine /></TabsContent>
      <TabsContent value="all"><CertificateList mine={false} /></TabsContent>
    </Tabs>
  </div>
);

export default HrTrainingCertificatePage;
