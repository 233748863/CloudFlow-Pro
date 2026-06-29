import React, { useCallback, useEffect, useState } from 'react';
import { getConfigIntSync } from '../../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../../constants/sysConfig';
import { BadgeCheck, Bell, Edit, Eye, FileClock, Plus, RefreshCw, RotateCcw, Search, Send, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button, ConfirmDialog, DatePicker, Input, Label, Pagination, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea, UserSelector } from '@/components/common';
import AttachmentLinks, { getAttachmentList } from '@/components/AttachmentLinks';
import BusinessTimeline from '@/components/common/BusinessTimeline';
import FileUpload from '@/components/FileUpload';
import { licenseApi, licenseRenewalApi, OaLicense, OaLicenseRenewal } from '@/services/api/sealLicense';
import { useAuth } from '@/context/AuthContext';
import { PageResult } from '@/types';
import type { UserBrief } from '@/types/workflow';
import { getErrorMessage } from '@/utils/errorMessage';
import { useDict } from '@/hooks/useDict';
import { DictBadge } from '@/components/common/DictBadge';
import { TableRowActions } from '@/components/common/table-row-actions';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

const EDITABLE_LICENSE_STATUSES = ['AVAILABLE', 'DISABLED'] as const;

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

const getStatusBadge = (status?: string) => (
  <DictBadge dictType="oa_license_status" value={String(status || 'AVAILABLE')} fallback="可用" />
);

const isBorrowLocked = (item: Pick<OaLicense, 'status'>) => item.status === 'BORROWED';

const getRenewalStatusBadge = (status?: string) => (
  <DictBadge dictType="oa_renewal_status" value={String(status || 'DRAFT')} fallback="草稿" />
);

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
    return <span className="rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-2.5 py-1 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">未维护</span>;
  }
  if (days < 0) {
    return <span className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">已到期</span>;
  }
  if (days === 0) {
    return <span className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">今日到期</span>;
  }
  if (days <= 7) {
    return <span className="rounded-md border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-200">{days} 天内</span>;
  }
  if (days <= 30) {
    return <span className="rounded-md border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">{days} 天内</span>;
  }
  return <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">正常</span>;
};

const TableStateRow: React.FC<{ colSpan: number; title: string }> = ({ colSpan, title }) => (
  <tr className="hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-10">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="admin-source-stat-icon mb-3">
          <BadgeCheck className="h-4 w-4" />
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
      </div>
    </td>
  </tr>
);

const DialogPanel: React.FC<{
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}> = ({ title, description, actions, children, className, bodyClassName }) => (
  <section className={['table-scroll-container admin-inner-table-surface', className].filter(Boolean).join(' ')}>
    {title || description || actions ? (
      <div className="admin-source-section-head border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div>
          {title ? <strong>{title}</strong> : null}
          {description ? <span>{description}</span> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    ) : null}
    <div className={['p-4', bodyClassName].filter(Boolean).join(' ')}>{children}</div>
  </section>
);

const DetailField: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="admin-license-detail-item">
    <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{label}</div>
    <div className="mt-1.5 text-sm leading-6 text-slate-900 dark:text-slate-100">{value || '-'}</div>
  </div>
);

export const LicenseListPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const typeDict = useDict('oa_license_type');
  const statusDict = useDict('oa_license_status');
  const [rows, setRows] = useState<OaLicense[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState({ pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10), licenseName: '', status: '', expiry: '' });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<OaLicense>(emptyForm);
  const [selectedKeeperIds, setSelectedKeeperIds] = useState<string[]>([]);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [detailLicense, setDetailLicense] = useState<OaLicense | null>(null);
  const [renewalDialogOpen, setRenewalDialogOpen] = useState(false);
  const [renewalLicense, setRenewalLicense] = useState<OaLicense | null>(null);
  const [renewalForm, setRenewalForm] = useState<OaLicenseRenewal>(emptyRenewalForm);
  const [renewalRows, setRenewalRows] = useState<OaLicenseRenewal[]>([]);
  const activeFilterCount = [query.licenseName, query.status, query.expiry].filter(Boolean).length;
  const stats = [
    { label: '证照总数', value: String(total), meta: `当前页 ${rows.length}`, icon: <BadgeCheck size={18} />, tone: 'blue' },
    { label: '可用证照', value: String(rows.filter((item) => item.status === 'AVAILABLE').length), meta: '可借用', icon: <BadgeCheck size={18} />, tone: 'green' },
    { label: '借用中', value: String(rows.filter((item) => item.status === 'BORROWED').length), meta: '已占用', icon: <FileClock size={18} />, tone: 'violet' },
    { label: '到期提醒', value: String(rows.filter(canRemindExpiry).length), meta: '30 天内', icon: <Bell size={18} />, tone: 'amber' },
  ];

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

  const pageActions = (
    <>
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">LICENSE LEDGER</p>
          <h2>证照台账</h2>
          <span>维护证照编码、保管人、有效期和续期记录</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={() => void fetchRows()}>
            <RefreshCw size={16} />
            刷新
          </Button>
          <Button size="sm" onClick={openCreate} disabled={!hasPermission('oa:license:add')}>
            <Plus size={16} />
            新增证照
          </Button>
        </div>
      </header>

      <section className="admin-source-stat-grid">
        {stats.map((stat) => (
          <article key={stat.label} className={`card admin-source-stat admin-source-tone-${stat.tone}`}>
            <div className="admin-source-stat-icon">{stat.icon}</div>
            <div>
              <p>{stat.label}</p>
              <strong>{stat.value}</strong>
              <span>{stat.meta}</span>
            </div>
          </article>
        ))}
      </section>
    </>
  );

  const pageFilters = (
    <section className="card admin-users-toolbar">
      <div className="admin-seal-license-filter-grid">
        <label className="admin-source-search">
          <span className="input-label">证照名称</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input
              value={query.licenseName}
              onChange={(event) => setQuery((prev) => ({ ...prev, pageNum: 1, licenseName: event.target.value }))}
              placeholder="按证照名称搜索"
              type="search"
            />
          </div>
        </label>
        <label>
          <span className="input-label">状态</span>
          <Select value={query.status || 'ALL'} onValueChange={(value) => setQuery((prev) => ({ ...prev, pageNum: 1, status: value === 'ALL' ? '' : value }))}>
            <SelectTrigger className="h-[42px]"><SelectValue placeholder="状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部状态</SelectItem>
              {statusDict.getOptions().map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <label>
          <span className="input-label">到期筛选</span>
          <Select value={query.expiry || 'ALL'} onValueChange={(value) => setQuery((prev) => ({ ...prev, pageNum: 1, expiry: value === 'ALL' ? '' : value }))}>
            <SelectTrigger className="h-[42px]"><SelectValue placeholder="到期筛选" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部有效期</SelectItem>
              <SelectItem value="30">30天内到期</SelectItem>
              <SelectItem value="15">15天内到期</SelectItem>
              <SelectItem value="7">7天内到期</SelectItem>
              <SelectItem value="0">今日到期</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <div className="admin-users-toolbar-actions">
          <span className="admin-users-filter-count">筛选 {activeFilterCount} 项</span>
          <Button variant="outline" size="sm" onClick={() => setQuery({ pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10), licenseName: '', status: '', expiry: '' })} disabled={activeFilterCount === 0}>
            <RotateCcw size={14} />
            重置
          </Button>
        </div>
      </div>
    </section>
  );

  const pageTable = (
    <InnerTableSurface className="admin-license-list-table-panel">
      <table className="unity-data-table admin-source-table admin-seal-license-table min-w-[1180px]">
          <thead>
            <tr>
              <th>编码</th>
              <th>名称 / 类型</th>
              <th>编号 / 签发机构</th>
              <th>有效期</th>
              <th>到期状态</th>
              <th>附件</th>
              <th>状态</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <TableStateRow colSpan={8} title="暂无证照" />
            ) : rows.map((item) => (
              <tr key={item.licenseId}>
                <td>{item.licenseCode}</td>
                <td>
                  <div className="font-medium text-slate-900 dark:text-slate-100">{item.licenseName}</div>
                  <div className="mt-1 text-xs text-slate-400">{typeDict.getLabel(item.licenseType) || item.licenseType}</div>
                </td>
                <td>
                  <div>{item.licenseNo || '-'}</div>
                  <div className="mt-1 text-xs text-slate-400">{item.issuer || '-'}</div>
                </td>
                <td>
                  <div>{item.issueDate || '-'}</div>
                  <div className="mt-1 text-xs text-slate-400">{item.expireDate || '-'}</div>
                </td>
                <td>{getExpiryBadge(item.expireDate)}</td>
                <td>{getAttachmentList(item.attachmentUrl).length ? `${getAttachmentList(item.attachmentUrl).length} 个` : '-'}</td>
                <td>{getStatusBadge(item.status)}</td>
                <td>
                  <TableRowActions
                    iconOnly
                    buttonLayout="compact"
                    maxVisibleActions={2}
                    overflowLabel="更多"
                    actions={[
                      { key: 'detail', label: '详情', icon: <Eye size={15} />, isPrimary: true, onClick: () => setDetailLicense(item) },
                      { key: 'edit', label: '编辑', icon: <Edit size={15} />, priority: 'secondary', hidden: isBorrowLocked(item), permissionKey: 'oa:license:edit', onClick: () => openEdit(item) },
                      { key: 'remind', label: '到期提醒', icon: <Bell size={15} />, priority: 'secondary', tone: 'warning', hidden: !canRemindExpiry(item), permissionKey: 'oa:license:remind', onClick: () => void remindExpiry(item) },
                      { key: 'renewal', label: '续期', icon: <FileClock size={15} />, priority: 'secondary', tone: 'info', hidden: item.status === 'DISABLED' || isBorrowLocked(item), permissionKey: 'oa:license-renewal:add', onClick: () => void openRenewalDialog(item) },
                      { key: 'delete', label: '删除', icon: <Trash2 size={15} />, danger: true, hidden: isBorrowLocked(item), permissionKey: 'oa:license:remove', onClick: () => item.licenseId && setDeleteId(item.licenseId) },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
      </table>
    </InnerTableSurface>
  );

  const pagePagination = total > 0 ? (
    <Pagination
      total={total}
      page={query.pageNum}
      pageSize={query.pageSize}
      showPageSizeSelector={false}
      showJump={false}
      onPageChange={(pageNum) => setQuery((prev) => ({ ...prev, pageNum }))}
      onPageSizeChange={() => {}}
    />
  ) : null;

  return (
    <>
      <section className="admin-source-page admin-seal-license-page admin-license-list-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={dialogOpen}
        title={form.licenseId ? '编辑证照' : '新增证照'}
        onClose={() => { setDialogOpen(false); resetForm(); }}
        maxWidthClassName="w-full sm:max-w-5xl"
        panelClassName="max-h-[92vh]"
        bodyClassName="admin-dialog-stack max-h-[74vh] overflow-y-auto px-4 py-4 sm:px-6 sm:py-5"
        footer={(
          <>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>取消</Button>
            <Button onClick={() => void save()} disabled={form.licenseId ? !hasPermission('oa:license:edit') : !hasPermission('oa:license:add')}>保存</Button>
          </>
        )}
      >
        <div className="admin-dialog-stack">
            <DialogPanel title="基础信息" bodyClassName="grid gap-4 sm:grid-cols-2">
              <div className="admin-dialog-field">
                <Label>编码</Label>
                <Input className="h-11" value={form.licenseCode} onChange={(event) => setForm((prev) => ({ ...prev, licenseCode: event.target.value }))} />
              </div>
              <div className="admin-dialog-field">
                <Label>名称</Label>
                <Input className="h-11" value={form.licenseName} onChange={(event) => setForm((prev) => ({ ...prev, licenseName: event.target.value }))} />
              </div>
              <div className="admin-dialog-field">
                <Label>类型</Label>
                <Select value={form.licenseType} onValueChange={(value) => setForm((prev) => ({ ...prev, licenseType: value }))}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>{typeDict.getOptions().map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="admin-dialog-field">
                <Label>状态</Label>
                <Select value={form.status || 'AVAILABLE'} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value as OaLicense['status'] }))}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>{EDITABLE_LICENSE_STATUSES.map((value) => <SelectItem key={value} value={value}>{statusDict.getLabel(value)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="admin-dialog-field">
                <Label>证照编号</Label>
                <Input className="h-11" value={form.licenseNo || ''} onChange={(event) => setForm((prev) => ({ ...prev, licenseNo: event.target.value }))} />
              </div>
              <div className="admin-dialog-field">
                <Label>签发机构</Label>
                <Input className="h-11" value={form.issuer || ''} onChange={(event) => setForm((prev) => ({ ...prev, issuer: event.target.value }))} />
              </div>
              <div className="admin-dialog-field">
                <Label>签发日期</Label>
                <DatePicker className="h-11" type="date" value={form.issueDate || ''} onChange={(event) => setForm((prev) => ({ ...prev, issueDate: event.target.value }))} />
              </div>
              <div className="admin-dialog-field">
                <Label>到期日期</Label>
                <DatePicker className="h-11" type="date" value={form.expireDate || ''} onChange={(event) => setForm((prev) => ({ ...prev, expireDate: event.target.value }))} />
              </div>
              <div className="admin-dialog-field sm:col-span-2">
                <Label>存放位置</Label>
                <Input className="h-11" value={form.location || ''} onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))} />
              </div>
            </DialogPanel>

            <DialogPanel title="证照附件">
              <div className="admin-dialog-field">
                <Label>证照附件</Label>
                <FileUpload value={form.attachmentUrl || ''} onChange={(urls) => setForm((prev) => ({ ...prev, attachmentUrl: urls }))} maxCount={5} />
              </div>
            </DialogPanel>

            <DialogPanel title="备注">
              <div className="admin-dialog-field">
                <Label>备注</Label>
                <Textarea className="min-h-[140px] resize-none" value={form.remark || ''} onChange={(event) => setForm((prev) => ({ ...prev, remark: event.target.value }))} />
              </div>
            </DialogPanel>

            <DialogPanel title="保管人">
              <div className="admin-dialog-field">
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
                <div className="admin-dialog-value-note mt-3">
                  <div className="font-medium text-slate-900 dark:text-slate-100">{form.keeperName}</div>
                </div>
              ) : null}
            </DialogPanel>

            <DialogPanel title="证照摘要">
              <dl className="admin-dialog-stack text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500 dark:text-slate-400">类型</dt>
                  <dd className="font-medium text-slate-900 dark:text-slate-100">{typeDict.getLabel(form.licenseType) || '-'}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500 dark:text-slate-400">状态</dt>
                  <dd className="font-medium text-slate-900 dark:text-slate-100">{statusDict.getLabel(form.status || 'AVAILABLE') || '-'}</dd>
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
            </DialogPanel>
        </div>
      </BaseDialog>

      <BaseDialog
        open={Boolean(detailLicense)}
        title={detailLicense?.licenseName || '证照详情'}
        onClose={() => setDetailLicense(null)}
        width="wide"
        headerAside={detailLicense ? getStatusBadge(detailLicense.status) : null}
        bodyClassName="admin-dialog-stack"
        footer={<Button variant="outline" onClick={() => setDetailLicense(null)}>关闭</Button>}
      >
        {detailLicense ? (
          <div className="admin-dialog-stack">
            <DialogPanel title="证照主信息" bodyClassName="admin-license-detail-grid">
              <DetailField label="证照编码" value={detailLicense.licenseCode} />
              <DetailField label="证照类型" value={typeDict.getLabel(detailLicense.licenseType) || detailLicense.licenseType} />
              <DetailField label="证照编号" value={detailLicense.licenseNo} />
              <DetailField label="签发机构" value={detailLicense.issuer} />
              <DetailField label="签发日期" value={detailLicense.issueDate} />
              <DetailField label="到期日期" value={detailLicense.expireDate} />
              <DetailField label="保管人" value={detailLicense.keeperName} />
              <DetailField label="存放位置" value={detailLicense.location} />
              <DetailField label="创建时间" value={detailLicense.createTime} />
            </DialogPanel>
            <DialogPanel title="附件">
              <AttachmentLinks value={detailLicense.attachmentUrl} />
            </DialogPanel>
            {detailLicense.remark ? (
              <DialogPanel title="备注">
                <div className="admin-dialog-value-note">
                  {detailLicense.remark}
                </div>
              </DialogPanel>
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
        bodyClassName="admin-dialog-stack"
        footer={(
          <>
            <Button variant="outline" onClick={() => { setRenewalDialogOpen(false); setRenewalLicense(null); setRenewalRows([]); }}>关闭</Button>
            <Button onClick={() => void saveRenewal()} disabled={!hasPermission(renewalForm.id ? 'oa:license-renewal:edit' : 'oa:license-renewal:add')}>保存续期草稿</Button>
          </>
        )}
      >
        <div className="admin-dialog-stack">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="admin-dialog-field"><Label>原签发日期</Label><Input className="h-11" value={renewalLicense?.issueDate || '-'} disabled /></div>
            <div className="admin-dialog-field"><Label>原到期日期</Label><Input className="h-11" value={renewalLicense?.expireDate || '-'} disabled /></div>
            <div className="admin-dialog-field"><Label>新签发日期</Label><DatePicker className="h-11" type="date" value={renewalForm.newIssueDate || ''} onChange={(event) => setRenewalForm((prev) => ({ ...prev, newIssueDate: event.target.value }))} /></div>
            <div className="admin-dialog-field"><Label>新到期日期</Label><DatePicker className="h-11" type="date" value={renewalForm.newExpireDate || ''} onChange={(event) => setRenewalForm((prev) => ({ ...prev, newExpireDate: event.target.value }))} /></div>
          </div>
          <div className="admin-dialog-field"><Label>续期原因</Label><Textarea className="min-h-[100px] resize-none" value={renewalForm.renewalReason} onChange={(event) => setRenewalForm((prev) => ({ ...prev, renewalReason: event.target.value }))} /></div>
          <div className="admin-dialog-field"><Label>续期附件</Label><FileUpload value={renewalForm.attachmentUrl || ''} onChange={(urls) => setRenewalForm((prev) => ({ ...prev, attachmentUrl: urls }))} maxCount={5} /></div>
          <DialogPanel title="续期记录">
            <div className="admin-dialog-stack">
              {renewalRows.length ? renewalRows.map((item) => (
                <div key={item.id} className="admin-license-renewal-card">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.renewalNo || '-'}</div>
                      <div className="mt-1 text-xs text-slate-400">{item.oldExpireDate || '-'} → {item.newExpireDate || '-'}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getRenewalStatusBadge(item.status)}
                      <div className="admin-users-row-actions">
                        {item.status === 'DRAFT' && hasPermission('oa:license-renewal:edit') ? <button type="button" title="编辑" onClick={() => setRenewalForm({ ...item })}><Edit size={15} /></button> : null}
                        {item.status === 'DRAFT' && hasPermission('oa:license-renewal:submit') ? <button type="button" title="提交" onClick={() => void submitRenewal(item.id)}><Send size={15} /></button> : null}
                        {item.status === 'PENDING' && hasPermission('oa:license-renewal:cancel') ? <button type="button" title="取消" onClick={() => void cancelRenewal(item.id)}><XCircle size={15} /></button> : null}
                        {item.status && ['DRAFT', 'REJECTED', 'CANCELLED'].includes(item.status) && hasPermission('oa:license-renewal:remove') ? <button type="button" className="danger" title="删除" onClick={() => void removeRenewal(item.id)}><Trash2 size={15} /></button> : null}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.renewalReason || '-'}</div>
                  {getAttachmentList(item.attachmentUrl).length ? <div className="mt-3"><AttachmentLinks value={item.attachmentUrl} compact /></div> : null}
                </div>
              )) : <div className="py-6 text-center text-sm text-slate-400">暂无续期记录</div>}
            </div>
          </DialogPanel>
        </div>
      </BaseDialog>

      <ConfirmDialog open={Boolean(deleteId)} title="删除证照" message="删除后当前台账记录不可恢复；已有借用记录时后端会转为逻辑删除。" confirmText="删除" danger onConfirm={() => void remove()} onCancel={() => setDeleteId(null)} />
    </>
  );
};

export default LicenseListPage;
