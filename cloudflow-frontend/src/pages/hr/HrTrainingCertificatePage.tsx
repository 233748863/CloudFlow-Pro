import React, { useCallback, useEffect, useState } from 'react';
import { Ban, Download, Plus, RefreshCcw, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  BaseDialog,
  Button,
  ConfirmDialog,
  EmployeeSelector,
  Input,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@/components/common';
import { DictBadge } from '@/components/common/DictBadge';
import { TablePageLayout, InnerTableSurface } from '@/components/layout/TablePageLayout';
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

  return (
    <div className="admin-source-content-grid">
      <section className="card admin-users-toolbar">
        <div className="admin-users-filter-grid">
          <div className="admin-users-toolbar-actions">
            <span className="admin-users-filter-count">{`共 ${rows.length} 张`}</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCcw className="mr-1.5 h-4 w-4" />刷新
          </Button>
          {!mine ? (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />颁发证书
            </Button>
          ) : null}
        </div>
      </section>

      <InnerTableSurface>
        <div className="admin-horizontal-scroll">
          <table className="unity-data-table admin-source-table min-w-[840px]">
            <thead>
              <tr>
                <th>证书号</th>
                <th>课程</th>
                <th>班次</th>
                <th>颁发日期</th>
                <th>到期日期</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="admin-settings-empty">加载中...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="admin-settings-empty">暂无证书</td></tr>
              ) : rows.map((row) => (
                <tr key={row.id}>
                  <td className="font-mono">{row.certNo}</td>
                  <td>{row.courseName || `#${row.courseId}`}</td>
                  <td>{row.sessionId ? `#${row.sessionId}` : '-'}</td>
                  <td>{formatDateValue(row.issueDate)}</td>
                  <td>{formatDateValue(row.expireDate)}</td>
                  <td><DictBadge dictType="hr_training_certificate_status" value={String(row.status || '')} /></td>
                  <td>
                    <div className="admin-users-row-actions">
                      {row.pdfFileId ? (
                        <button type="button" title="下载" onClick={() => void handleDownload(row)}>
                          <Download size={15} />
                        </button>
                      ) : null}
                      {!mine && row.status === 'VALID' ? (
                        <button type="button" title="重生 PDF" onClick={() => void handleRegenerate(row)}>
                          <RotateCcw size={15} />
                        </button>
                      ) : null}
                      {!mine && row.status === 'VALID' ? (
                        <button type="button" className="danger" title="撤销" onClick={() => { setRevokeTarget(row); setRevokeReason(''); }}>
                          <Ban size={15} />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </InnerTableSurface>

      <BaseDialog open={open} title="颁发证书" onClose={() => setOpen(false)} bodyClassName="admin-dialog-stack"
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>取消</Button><Button onClick={() => void handleIssue()}>颁发</Button></div>}>
        <>
          <div className="admin-dialog-field"><Label>员工</Label><EmployeeSelector single value={form.employeeId || null} onChange={(id) => setForm((p) => ({ ...p, employeeId: id ?? 0 }))} placeholder="选择员工" /></div>
          <div className="admin-dialog-field"><Label>课程 ID</Label><Input type="number" value={form.courseId || ''} onChange={(e) => setForm((p) => ({ ...p, courseId: Number(e.target.value) }))} /></div>
          <div className="admin-dialog-field"><Label>班次 ID（可选）</Label><Input type="number" value={form.sessionId || ''} onChange={(e) => setForm((p) => ({ ...p, sessionId: Number(e.target.value) || undefined }))} /></div>
          <div className="admin-dialog-field"><Label>模板 ID（可选）</Label><Input type="number" value={form.templateId || ''} onChange={(e) => setForm((p) => ({ ...p, templateId: Number(e.target.value) || undefined }))} /></div>
        </>
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
  <section className="admin-source-page">
    <TablePageLayout
      actions={
        <>
          <header className="admin-source-header">
            <div>
              <p className="admin-source-kicker">TRAINING CERTIFICATES</p>
              <h2>培训证书</h2>
              <span>查看个人证书，维护全员证书颁发、PDF 生成和撤销状态</span>
            </div>
          </header>
          <section className="admin-source-stat-grid">
            <article className="card admin-source-stat admin-source-tone-blue">
              <div className="admin-source-stat-icon"><Download size={18} /></div>
              <div><p>我的证书</p><strong>个人</strong><span>可下载已生成 PDF</span></div>
            </article>
            <article className="card admin-source-stat admin-source-tone-green">
              <div className="admin-source-stat-icon"><Plus size={18} /></div>
              <div><p>全员证书</p><strong>管理</strong><span>颁发、重生和撤销</span></div>
            </article>
          </section>
        </>
      }
      table={
        <Tabs defaultValue="mine" className="admin-source-content-grid">
          <TabsList className="admin-source-tabs w-full justify-start overflow-x-auto lg:w-auto">
            <TabsTrigger value="mine" className="flex-1 lg:flex-none">我的证书</TabsTrigger>
            <TabsTrigger value="all" className="flex-1 lg:flex-none">全员证书</TabsTrigger>
          </TabsList>
          <TabsContent value="mine"><CertificateList mine /></TabsContent>
          <TabsContent value="all"><CertificateList mine={false} /></TabsContent>
        </Tabs>
      }
    />
  </section>
);

export default HrTrainingCertificatePage;
