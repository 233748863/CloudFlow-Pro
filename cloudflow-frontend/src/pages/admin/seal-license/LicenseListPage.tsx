import React, { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Bell, Edit, Eye, FileClock, Plus, RotateCcw, Send, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button, ConfirmDialog, DatePicker, Input, Label, Pagination, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, TableActionHead, TableHead, TableHeader, Textarea, UserSelector } from '@/components/common';
import { TableRowActions } from '@/components/common/table-row-actions';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import AttachmentLinks, { getAttachmentList } from '@/components/AttachmentLinks';
import BusinessTimeline from '@/components/common/BusinessTimeline';
import FileUpload from '@/components/FileUpload';
import { licenseApi, licenseRenewalApi, OaLicense, OaLicenseRenewal } from '@/services/api/sealLicense';
import { useAuth } from '@/context/AuthContext';
import { PageResult } from '@/types';
import type { UserBrief } from '@/types/workflow';
import { getErrorMessage } from '@/utils/errorMessage';

const TYPE_LABELS: Record<string, string> = {
  BUSINESS: '营业执照',
  PERMIT: '许可证',
  QUALIFICATION: '资质证书',
  OTHER: '其他',
};

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: '可用',
  BORROWED: '借出',
  DISABLED: '停用',
};

const EDITABLE_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: STATUS_LABELS.AVAILABLE,
  DISABLED: STATUS_LABELS.DISABLED,
};

const RENEWAL_STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  PENDING: '审批中',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  CANCELLED: '已取消',
};

const emptyForm: OaLicense = {
  licenseCode: '',
  licenseName: '',
  licenseType: 'BUSINESS',
  status: 'AVAILABLE',
  attachmentUrl: '',
};

const emptyRenewalForm: OaLicenseRenewal = {
  licenseId: 0,
  newExpireDate: '',
  renewalReason: '',
  attachmentUrl: '',
};

const EXPIRY_REMINDER_WINDOW_DAYS = 30;

const normalizeRows = <T,>(result: PageResult<T>) => result.rows || result.records || [];

const getStatusBadge = (status?: string) => {
  const toneMap: Record<string, string> = {
    AVAILABLE: 'border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
    BORROWED: 'border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200',
    DISABLED: 'border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${toneMap[status || 'AVAILABLE'] || toneMap.AVAILABLE}`}>
      {STATUS_LABELS[status || 'AVAILABLE'] || status || '-'}
    </span>
  );
};

const isBorrowLocked = (item: Pick<OaLicense, 'status'>) => item.status === 'BORROWED';

const getRenewalStatusBadge = (status?: string) => {
  const toneMap: Record<string, string> = {
    DRAFT: 'border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
    PENDING: 'border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200',
    APPROVED: 'border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
    REJECTED: 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
    CANCELLED: 'border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${toneMap[status || 'DRAFT'] || toneMap.DRAFT}`}>
      {RENEWAL_STATUS_LABELS[status || 'DRAFT'] || status || '-'}
    </span>
  );
};

const getDaysUntil = (date?: string) => {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${date}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.round((target.getTime() - today.getTime()) / 86400000);
};

const canRemindExpiry = (item: Pick<OaLicense, 'expireDate' | 'status'>) => {
  const days = getDaysUntil(item.expireDate);
  return item.status !== 'DISABLED' && days !== null && days <= EXPIRY_REMINDER_WINDOW_DAYS;
};

const getExpiryBadge = (expireDate?: string) => {
  const days = getDaysUntil(expireDate);
  if (days === null) {
    return <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">未维护</span>;
  }
  if (days < 0) {
    return <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">已到期</span>;
  }
  if (days === 0) {
    return <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">今日到期</span>;
  }
  if (days <= 7) {
    return <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-200">{days} 天内</span>;
  }
  if (days <= 30) {
    return <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">{days} 天内</span>;
  }
  return <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">正常</span>;
};

const TableStateRow: React.FC<{ colSpan: number; title: string }> = ({ colSpan, title }) => (
  <tr className="hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-16">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
          <BadgeCheck className="h-4 w-4" />
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
      </div>
    </td>
  </tr>
);

const DetailField: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
    <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{label}</div>
    <div className="mt-1.5 text-sm leading-6 text-slate-900 dark:text-slate-100">{value || '-'}</div>
  </div>
);

export const LicenseListPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<OaLicense[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState({ pageNum: 1, pageSize: 10, licenseName: '', status: '', expiry: '' });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<OaLicense>(emptyForm);
  const [selectedKeeperIds, setSelectedKeeperIds] = useState<string[]>([]);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [detailLicense, setDetailLicense] = useState<OaLicense | null>(null);
  const [renewalDialogOpen, setRenewalDialogOpen] = useState(false);
  const [renewalLicense, setRenewalLicense] = useState<OaLicense | null>(null);
  const [renewalForm, setRenewalForm] = useState<OaLicenseRenewal>(emptyRenewalForm);
  const [renewalRows, setRenewalRows] = useState<OaLicenseRenewal[]>([]);

  const fetchRows = useCallback(async () => {
    try {
      const result = query.expiry
        ? await licenseApi.expiring({ pageNum: query.pageNum, pageSize: query.pageSize, days: Number(query.expiry) })
        : await licenseApi.list({
            pageNum: query.pageNum,
            pageSize: query.pageSize,
            licenseName: query.licenseName || undefined,
            status: query.status || undefined,
          });
      setRows(normalizeRows(result));
      setTotal(result.total || 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '获取证照台账失败'));
    }
  }, [query]);

  const fetchRenewals = useCallback(async (licenseId: number) => {
    try {
      const result = await licenseRenewalApi.list({ pageNum: 1, pageSize: 20, licenseId });
      setRenewalRows(normalizeRows(result));
    } catch (error) {
      toast.error(getErrorMessage(error, '获取续期记录失败'));
    }
  }, []);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const resetForm = () => {
    setForm(emptyForm);
    setSelectedKeeperIds([]);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (item: OaLicense) => {
    setForm({ ...item });
    setSelectedKeeperIds(item.keeperId ? [String(item.keeperId)] : []);
    setDialogOpen(true);
  };

  const handleKeeperSelectionChange = useCallback((userIds: string[]) => {
    setSelectedKeeperIds(userIds);
    if (userIds.length === 0) {
      setForm((prev) => ({
        ...prev,
        keeperId: undefined,
        keeperName: '',
      }));
    }
  }, []);

  const updateKeeper = useCallback((users: UserBrief[]) => {
    const user = users[0];
    if (!user) {
      return;
    }
    setForm((prev) => ({
      ...prev,
      keeperId: Number(user.id) || undefined,
      keeperName: user.name,
    }));
  }, []);

  const save = async () => {
    if (!form.licenseCode.trim() || !form.licenseName.trim()) {
      toast.warning('请填写证照编码和名称');
      return;
    }
    try {
      if (form.licenseId) {
        await licenseApi.edit(form);
      } else {
        await licenseApi.add(form);
      }
      toast.success('保存成功');
      setDialogOpen(false);
      resetForm();
      await fetchRows();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存证照失败'));
    }
  };

  const openRenewalDialog = async (license: OaLicense) => {
    if (!license.licenseId) return;
    setRenewalLicense(license);
    setRenewalForm({
      ...emptyRenewalForm,
      licenseId: license.licenseId,
      oldIssueDate: license.issueDate,
      oldExpireDate: license.expireDate,
      newIssueDate: license.issueDate || '',
    });
    setRenewalDialogOpen(true);
    await fetchRenewals(license.licenseId);
  };

  const saveRenewal = async () => {
    if (!renewalLicense?.licenseId || !renewalForm.newExpireDate || !renewalForm.renewalReason.trim()) {
      toast.warning('请填写新到期日期和续期原因');
      return;
    }
    try {
      const payload = {
        ...renewalForm,
        licenseId: renewalLicense.licenseId,
        licenseName: renewalLicense.licenseName,
      };
      if (payload.id) {
        await licenseRenewalApi.edit(payload);
      } else {
        await licenseRenewalApi.add(payload);
      }
      toast.success('续期申请已保存');
      setRenewalForm({
        ...emptyRenewalForm,
        licenseId: renewalLicense.licenseId,
        oldIssueDate: renewalLicense.issueDate,
        oldExpireDate: renewalLicense.expireDate,
        newIssueDate: renewalLicense.issueDate || '',
      });
      await fetchRenewals(renewalLicense.licenseId);
    } catch (error) {
      toast.error(getErrorMessage(error, '保存续期申请失败'));
    }
  };

  const submitRenewal = async (id?: number) => {
    if (!id || !renewalLicense?.licenseId) return;
    try {
      await licenseRenewalApi.submit(id);
      toast.success('续期申请已提交');
      await fetchRenewals(renewalLicense.licenseId);
    } catch (error) {
      toast.error(getErrorMessage(error, '提交续期申请失败'));
    }
  };

  const cancelRenewal = async (id?: number) => {
    if (!id || !renewalLicense?.licenseId) return;
    try {
      await licenseRenewalApi.cancel(id);
      toast.success('续期申请已取消');
      await fetchRenewals(renewalLicense.licenseId);
    } catch (error) {
      toast.error(getErrorMessage(error, '取消续期申请失败'));
    }
  };

  const removeRenewal = async (id?: number) => {
    if (!id || !renewalLicense?.licenseId) return;
    try {
      await licenseRenewalApi.remove([id]);
      toast.success('续期申请已删除');
      await fetchRenewals(renewalLicense.licenseId);
    } catch (error) {
      toast.error(getErrorMessage(error, '删除续期申请失败'));
    }
  };

  const remindExpiry = async (license: OaLicense) => {
    if (!license.licenseId) return;
    try {
      await licenseApi.remindExpiry(license.licenseId);
      toast.success('到期提醒已发送');
    } catch (error) {
      toast.error(getErrorMessage(error, '发送到期提醒失败'));
    }
  };

  const remove = async () => {
    if (!deleteId) return;
    try {
      await licenseApi.remove([deleteId]);
      toast.success('删除成功');
      setDeleteId(null);
      await fetchRows();
    } catch (error) {
      toast.error(getErrorMessage(error, '删除证照失败'));
    }
  };

  return (
    <div className="space-y-4">
      <TablePageLayout
        className="gap-4"
        filters={(
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="w-full sm:w-[220px]">
                <Input className="h-10" value={query.licenseName} onChange={(event) => setQuery((prev) => ({ ...prev, pageNum: 1, licenseName: event.target.value }))} placeholder="证照名称" />
              </div>
              <div className="w-full sm:w-[160px]">
                <Select value={query.status || 'ALL'} onValueChange={(value) => setQuery((prev) => ({ ...prev, pageNum: 1, status: value === 'ALL' ? '' : value }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="状态" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全部状态</SelectItem>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-[160px]">
                <Select value={query.expiry || 'ALL'} onValueChange={(value) => setQuery((prev) => ({ ...prev, pageNum: 1, expiry: value === 'ALL' ? '' : value }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="到期筛选" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全部有效期</SelectItem>
                    <SelectItem value="30">30天内到期</SelectItem>
                    <SelectItem value="15">15天内到期</SelectItem>
                    <SelectItem value="7">7天内到期</SelectItem>
                    <SelectItem value="0">今日到期</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span>共 {total} 条</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Button variant="outline" size="sm" onClick={() => setQuery({ pageNum: 1, pageSize: 10, licenseName: '', status: '', expiry: '' })}>
                <RotateCcw size={14} className="mr-1.5" />
                清空条件
              </Button>
              <Button size="sm" onClick={openCreate} disabled={!hasPermission('oa:license:add')}>
                <Plus size={14} className="mr-1.5" />
                新增证照
              </Button>
            </div>
          </div>
        )}
        table={(<TableSurfaceCard>
          <div className="flex min-h-[40rem] flex-col">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px]">
                <TableHeader className="sticky top-0 z-10">
                  <tr>
                    <TableHead className="px-4 py-3 text-left">编码</TableHead>
                    <TableHead className="px-4 py-3 text-left">名称 / 类型</TableHead>
                    <TableHead className="px-4 py-3 text-left">编号 / 签发机构</TableHead>
                    <TableHead className="px-4 py-3 text-left">有效期</TableHead>
                    <TableHead className="px-4 py-3 text-left">到期状态</TableHead>
                    <TableHead className="px-4 py-3 text-left">附件</TableHead>
                    <TableHead className="px-4 py-3 text-left">状态</TableHead>
                    <TableActionHead className="w-44 px-4 py-3 text-right">操作</TableActionHead>
                  </tr>
                </TableHeader>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.length === 0 ? (
                    <TableStateRow colSpan={8} title="暂无证照" />
                  ) : rows.map((item) => (
                    <tr key={item.licenseId} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                      <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">{item.licenseCode}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{item.licenseName}</div>
                        <div className="mt-1 text-xs text-slate-400">{TYPE_LABELS[item.licenseType] || item.licenseType}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        <div>{item.licenseNo || '-'}</div>
                        <div className="mt-1 text-xs text-slate-400">{item.issuer || '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        <div>{item.issueDate || '-'}</div>
                        <div className="mt-1 text-xs text-slate-400">{item.expireDate || '-'}</div>
                      </td>
                      <td className="px-4 py-3">{getExpiryBadge(item.expireDate)}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        {getAttachmentList(item.attachmentUrl).length ? `${getAttachmentList(item.attachmentUrl).length} 个` : '-'}
                      </td>
                      <td className="px-4 py-3">{getStatusBadge(item.status)}</td>
                      <td className="px-4 py-3 text-right">
                        <TableRowActions
                          align="end"
                          actions={[
                            { label: '详情', icon: <Eye size={14} />, onClick: () => setDetailLicense(item), tone: 'neutral' },
                            { label: '编辑', icon: <Edit size={14} />, onClick: () => openEdit(item), tone: 'primary', hidden: isBorrowLocked(item), permissionKey: 'oa:license:edit' },
                            { label: '到期提醒', icon: <Bell size={14} />, onClick: () => void remindExpiry(item), tone: 'warning', hidden: !canRemindExpiry(item), permissionKey: 'oa:license:remind' },
                            { label: '续期', icon: <FileClock size={14} />, onClick: () => void openRenewalDialog(item), tone: 'success', hidden: item.status === 'DISABLED' || isBorrowLocked(item), permissionKey: 'oa:license-renewal:add' },
                            { label: '删除', icon: <Trash2 size={14} />, onClick: () => item.licenseId && setDeleteId(item.licenseId), tone: 'danger', hidden: isBorrowLocked(item), permissionKey: 'oa:license:remove' },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TableSurfaceCard>)}
        pagination={total > 0 ? (
          <Pagination total={total} page={query.pageNum} pageSize={query.pageSize} showPageSizeSelector={false} showJump={false} onPageChange={(pageNum) => setQuery((prev) => ({ ...prev, pageNum }))} onPageSizeChange={() => {}} />
        ) : null}
      />

      <BaseDialog
        open={dialogOpen}
        title={form.licenseId ? '编辑证照' : '新增证照'}
        onClose={() => { setDialogOpen(false); resetForm(); }}
        maxWidthClassName="w-full sm:max-w-5xl"
        panelClassName="max-h-[92vh]"
        bodyClassName="max-h-[74vh] overflow-y-auto px-4 py-4 sm:px-6 sm:py-5"
        footer={(
          <>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>取消</Button>
            <Button onClick={() => void save()} disabled={form.licenseId ? !hasPermission('oa:license:edit') : !hasPermission('oa:license:add')}>保存</Button>
          </>
        )}
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70">
              <h4 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">基础信息</h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>编码</Label>
                  <Input className="h-11" value={form.licenseCode} onChange={(event) => setForm((prev) => ({ ...prev, licenseCode: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>名称</Label>
                  <Input className="h-11" value={form.licenseName} onChange={(event) => setForm((prev) => ({ ...prev, licenseName: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>类型</Label>
                  <Select value={form.licenseType} onValueChange={(value) => setForm((prev) => ({ ...prev, licenseType: value }))}>
                    <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>状态</Label>
                  <Select value={form.status || 'AVAILABLE'} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value as OaLicense['status'] }))}>
                    <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(EDITABLE_STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>证照编号</Label>
                  <Input className="h-11" value={form.licenseNo || ''} onChange={(event) => setForm((prev) => ({ ...prev, licenseNo: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>签发机构</Label>
                  <Input className="h-11" value={form.issuer || ''} onChange={(event) => setForm((prev) => ({ ...prev, issuer: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>签发日期</Label>
                  <DatePicker className="h-11" type="date" value={form.issueDate || ''} onChange={(event) => setForm((prev) => ({ ...prev, issueDate: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>到期日期</Label>
                  <DatePicker className="h-11" type="date" value={form.expireDate || ''} onChange={(event) => setForm((prev) => ({ ...prev, expireDate: event.target.value }))} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>存放位置</Label>
                  <Input className="h-11" value={form.location || ''} onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))} />
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70">
              <div className="space-y-2">
                <Label>证照附件</Label>
                <FileUpload value={form.attachmentUrl || ''} onChange={(urls) => setForm((prev) => ({ ...prev, attachmentUrl: urls }))} maxCount={5} />
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70">
              <div className="space-y-2">
                <Label>备注</Label>
                <Textarea className="min-h-[140px] resize-none" value={form.remark || ''} onChange={(event) => setForm((prev) => ({ ...prev, remark: event.target.value }))} />
              </div>
            </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
            <section className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="space-y-2">
                <Label>保管人</Label>
                <UserSelector
                  value={selectedKeeperIds}
                  onChange={handleKeeperSelectionChange}
                  onUsersChange={updateKeeper}
                  multiple={false}
                  placeholder="搜索姓名、邮箱或部门"
                  dropdownPlacement="bottom"
                />
              </div>
              {form.keeperName ? (
                <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950">
                  <div className="font-medium text-slate-900 dark:text-slate-100">{form.keeperName}</div>
                </div>
              ) : null}
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70">
              <h4 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">证照摘要</h4>
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500 dark:text-slate-400">类型</dt>
                  <dd className="font-medium text-slate-900 dark:text-slate-100">{TYPE_LABELS[form.licenseType] || '-'}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500 dark:text-slate-400">状态</dt>
                  <dd className="font-medium text-slate-900 dark:text-slate-100">{STATUS_LABELS[form.status || 'AVAILABLE'] || '-'}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500 dark:text-slate-400">到期日期</dt>
                  <dd className="font-medium text-slate-900 dark:text-slate-100">{form.expireDate || '-'}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500 dark:text-slate-400">位置</dt>
                  <dd className="max-w-[12rem] truncate font-medium text-slate-900 dark:text-slate-100">{form.location || '-'}</dd>
                </div>
              </dl>
            </section>
          </aside>
        </div>
      </BaseDialog>

      <BaseDialog
        open={Boolean(detailLicense)}
        title={detailLicense?.licenseName || '证照详情'}
        onClose={() => setDetailLicense(null)}
        width="wide"
        headerAside={detailLicense ? getStatusBadge(detailLicense.status) : null}
        footer={<Button variant="outline" onClick={() => setDetailLicense(null)}>关闭</Button>}
      >
        {detailLicense ? (
          <div className="space-y-4">
            <div className="grid gap-x-6 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
              <DetailField label="证照编码" value={detailLicense.licenseCode} />
              <DetailField label="证照类型" value={TYPE_LABELS[detailLicense.licenseType] || detailLicense.licenseType} />
              <DetailField label="证照编号" value={detailLicense.licenseNo} />
              <DetailField label="签发机构" value={detailLicense.issuer} />
              <DetailField label="签发日期" value={detailLicense.issueDate} />
              <DetailField label="到期日期" value={detailLicense.expireDate} />
              <DetailField label="保管人" value={detailLicense.keeperName} />
              <DetailField label="存放位置" value={detailLicense.location} />
              <DetailField label="创建时间" value={detailLicense.createTime} />
            </div>
            <div className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
              <div className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">附件</div>
              <AttachmentLinks value={detailLicense.attachmentUrl} />
            </div>
            {detailLicense.remark ? (
              <div className="rounded-xl border border-slate-200 px-4 py-4 text-sm leading-6 text-slate-600 dark:border-slate-800 dark:text-slate-300">
                {detailLicense.remark}
              </div>
            ) : null}
            <BusinessTimeline businessType="LICENSE" businessId={detailLicense.licenseId} />
          </div>
        ) : null}
      </BaseDialog>

      <BaseDialog
        open={renewalDialogOpen}
        title={renewalLicense ? `${renewalLicense.licenseName} 续期` : '证照续期'}
        onClose={() => { setRenewalDialogOpen(false); setRenewalLicense(null); setRenewalRows([]); }}
        width="wide"
        footer={(
          <>
            <Button variant="outline" onClick={() => { setRenewalDialogOpen(false); setRenewalLicense(null); setRenewalRows([]); }}>关闭</Button>
            <Button onClick={() => void saveRenewal()} disabled={!hasPermission(renewalForm.id ? 'oa:license-renewal:edit' : 'oa:license-renewal:add')}>保存续期草稿</Button>
          </>
        )}
      >
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label>原签发日期</Label><Input className="h-11" value={renewalLicense?.issueDate || '-'} disabled /></div>
            <div className="space-y-2"><Label>原到期日期</Label><Input className="h-11" value={renewalLicense?.expireDate || '-'} disabled /></div>
            <div className="space-y-2"><Label>新签发日期</Label><DatePicker className="h-11" type="date" value={renewalForm.newIssueDate || ''} onChange={(event) => setRenewalForm((prev) => ({ ...prev, newIssueDate: event.target.value }))} /></div>
            <div className="space-y-2"><Label>新到期日期</Label><DatePicker className="h-11" type="date" value={renewalForm.newExpireDate || ''} onChange={(event) => setRenewalForm((prev) => ({ ...prev, newExpireDate: event.target.value }))} /></div>
          </div>
          <div className="space-y-2"><Label>续期原因</Label><Textarea className="min-h-[100px] resize-none" value={renewalForm.renewalReason} onChange={(event) => setRenewalForm((prev) => ({ ...prev, renewalReason: event.target.value }))} /></div>
          <div className="space-y-2"><Label>续期附件</Label><FileUpload value={renewalForm.attachmentUrl || ''} onChange={(urls) => setRenewalForm((prev) => ({ ...prev, attachmentUrl: urls }))} maxCount={5} /></div>
          <div className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
            <div className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">续期记录</div>
            <div className="space-y-3">
              {renewalRows.length ? renewalRows.map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-100 px-3 py-3 dark:border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.renewalNo || '-'}</div>
                      <div className="mt-1 text-xs text-slate-400">{item.oldExpireDate || '-'} → {item.newExpireDate || '-'}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getRenewalStatusBadge(item.status)}
                      <TableRowActions
                        align="end"
                        actions={[
                          { label: '编辑', icon: <Edit size={14} />, onClick: () => setRenewalForm({ ...item }), tone: 'primary', hidden: item.status !== 'DRAFT', permissionKey: 'oa:license-renewal:edit' },
                          { label: '提交', icon: <Send size={14} />, onClick: () => void submitRenewal(item.id), tone: 'success', hidden: item.status !== 'DRAFT', permissionKey: 'oa:license-renewal:submit' },
                          { label: '取消', icon: <XCircle size={14} />, onClick: () => void cancelRenewal(item.id), tone: 'warning', hidden: item.status !== 'PENDING', permissionKey: 'oa:license-renewal:cancel' },
                          { label: '删除', icon: <Trash2 size={14} />, onClick: () => void removeRenewal(item.id), tone: 'danger', hidden: item.status !== 'DRAFT' && item.status !== 'REJECTED' && item.status !== 'CANCELLED', permissionKey: 'oa:license-renewal:remove' },
                        ]}
                      />
                    </div>
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.renewalReason || '-'}</div>
                  {getAttachmentList(item.attachmentUrl).length ? <div className="mt-3"><AttachmentLinks value={item.attachmentUrl} compact /></div> : null}
                </div>
              )) : <div className="py-8 text-center text-sm text-slate-400">暂无续期记录</div>}
            </div>
          </div>
        </div>
      </BaseDialog>

      <ConfirmDialog open={Boolean(deleteId)} title="删除证照" message="删除后当前台账记录不可恢复；已有借用记录时后端会转为逻辑删除。" confirmText="删除" danger onConfirm={() => void remove()} onCancel={() => setDeleteId(null)} />
    </div>
  );
};

export default LicenseListPage;


