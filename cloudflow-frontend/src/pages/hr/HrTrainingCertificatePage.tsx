import React, { useCallback, useEffect, useState } from 'react';
import { Award, Download, Plus, RefreshCcw, RotateCcw, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  EmployeeSelector,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/common';
import { TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { BaseDialog } from '@/components/common/BaseDialog';
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

  const handleRevoke = async (row: HrTrainingCertificate) => {
    const reason = window.prompt('撤销原因：', '');
    if (reason == null) return;
    try { await revokeTrainingCertificate(row.id, reason); toast.success('已撤销'); await load(); } catch (error) { toast.error(getErrorMessage(error, '撤销失败')); }
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

  return (
    <>
      <div className="mb-3 flex justify-end gap-2">
        {!mine ? <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1 h-3 w-3" />颁发证书</Button> : null}
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCcw className="mr-1 h-3 w-3" />刷新</Button>
      </div>
      <TableSurfaceCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>证书号</TableHead>
              <TableHead>课程</TableHead>
              <TableHead>班次</TableHead>
              <TableHead>颁发日期</TableHead>
              <TableHead>到期日期</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-slate-400">加载中...</TableCell></TableRow>
            ) : rows.length ? rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-xs">{row.certNo}</TableCell>
                <TableCell>{`#${row.courseId}`}</TableCell>
                <TableCell>{row.sessionId ? `#${row.sessionId}` : '-'}</TableCell>
                <TableCell>{formatDateValue(row.issueDate)}</TableCell>
                <TableCell>{formatDateValue(row.expireDate)}</TableCell>
                <TableCell>{row.status === 'VALID' ? '有效' : '已撤销'}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    {row.pdfFileId ? (
                      <Button size="sm" variant="ghost" onClick={() => void handleDownload(row)}>
                        <Download className="mr-1 h-3 w-3" />下载
                      </Button>
                    ) : null}
                    {!mine && row.status === 'VALID' ? (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => void handleRegenerate(row)}>
                          <RotateCcw className="mr-1 h-3 w-3" />重生 PDF
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void handleRevoke(row)}>
                          <XCircle className="mr-1 h-3 w-3" />撤销
                        </Button>
                      </>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-slate-400">暂无证书</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableSurfaceCard>

      <BaseDialog open={open} title="颁发证书" onClose={() => setOpen(false)}
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>取消</Button><Button onClick={() => void handleIssue()}>颁发</Button></div>}>
        <div className="space-y-3">
          <div><Label>员工</Label><EmployeeSelector single value={form.employeeId || null} onChange={(id) => setForm((p) => ({ ...p, employeeId: id ?? 0 }))} placeholder="选择员工" /></div>
          <div><Label>课程 ID</Label><Input type="number" value={form.courseId || ''} onChange={(e) => setForm((p) => ({ ...p, courseId: Number(e.target.value) }))} /></div>
          <div><Label>班次 ID（可选）</Label><Input type="number" value={form.sessionId || ''} onChange={(e) => setForm((p) => ({ ...p, sessionId: Number(e.target.value) || undefined }))} /></div>
          <div><Label>模板 ID（可选）</Label><Input type="number" value={form.templateId || ''} onChange={(e) => setForm((p) => ({ ...p, templateId: Number(e.target.value) || undefined }))} /></div>
        </div>
      </BaseDialog>
    </>
  );
};

export const HrTrainingCertificatePage: React.FC = () => (
  <div className="p-6">
    <div className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-slate-50">
      <Award className="h-5 w-5" />培训证书
    </div>
    <Tabs defaultValue="mine">
      <TabsList>
        <TabsTrigger value="mine">我的证书</TabsTrigger>
        <TabsTrigger value="all">全员证书</TabsTrigger>
      </TabsList>
      <TabsContent value="mine"><CertificateList mine /></TabsContent>
      <TabsContent value="all"><CertificateList mine={false} /></TabsContent>
    </Tabs>
  </div>
);

export default HrTrainingCertificatePage;
