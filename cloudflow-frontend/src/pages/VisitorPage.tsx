import React, { useEffect, useState } from 'react';
import { getConfigIntSync, useConfigValue } from '../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE, SYS_VISITOR_WORKFLOW_ENABLED } from '../constants/sysConfig';
import {
  Building2,
  CheckCircle,
  LogIn,
  LogOut,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, ConfirmDialog, Pagination } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/utils/errorMessage';
import { visitorApi, Visitor } from '../services/api/visitor';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import {
  Button,
  DatePicker,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/components/common';
import { useDict } from '@/hooks/useDict';
import { DictBadge } from '@/components/common/DictBadge';
import { UserSelector } from '@/components/common/UserSelector';

const createDefaultForm = (): Visitor => ({
  visitorName: '',
  visitReason: '',
  hostId: 0,
  visitDate: '',
  visitorPhone: '',
  visitorCompany: '',
  visitorCount: 1,
  visitArea: '',
  carPlate: '',
  hostName: '',
});

const InlineState: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}> = ({ title, description, icon, className }) => (
  <div className={['flex flex-col items-center justify-center px-6 py-10 text-center', className].filter(Boolean).join(' ')}>
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-cyan-100 bg-[#effbfe] text-[#0d95b5] dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-200">
      {icon || <UserCheck className="h-4 w-4" />}
    </div>
    <div className="text-sm font-medium text-cf-title">{title}</div>
    {description ? <div className="mt-2 text-xs leading-6 text-cf-subtle">{description}</div> : null}
  </div>
);

const TableStateRow: React.FC<{
  colSpan: number;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  loading?: boolean;
}> = ({ colSpan, title, description, icon, loading = false }) => (
  <tr className="hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-10">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-cyan-100 bg-[#effbfe] text-[#0d95b5] dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-200">
          {loading ? <RotateCcw className="h-4 w-4 animate-spin" /> : icon || <UserCheck className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-cf-title">{title}</div>
        {description ? <div className="mt-2 text-xs leading-6 text-cf-subtle">{description}</div> : null}
      </div>
    </td>
  </tr>
);

export const VisitorPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const statusDict = useDict('oa_visitor_status');
  const [list, setList] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({
    status: '',
    visitorName: '',
    visitDate: '',
    pageNum: 1,
    pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
  });
  const [visitorNameInput, setVisitorNameInput] = useState('');
  const [visitDateInput, setVisitDateInput] = useState('');
  const [total, setTotal] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Visitor | null>(null);
  const [formData, setFormData] = useState<Visitor>(createDefaultForm());
  const [passVisitor, setPassVisitor] = useState<Visitor | null>(null);
  const [passQrCodeUrl, setPassQrCodeUrl] = useState('');
  const [passQrCodeLoading, setPassQrCodeLoading] = useState(false);
  const [passQrCodeError, setPassQrCodeError] = useState('');
  const [visitorWorkflowEnabledValue] = useConfigValue(SYS_VISITOR_WORKFLOW_ENABLED, 'false');
  const visitorWorkflowEnabled = visitorWorkflowEnabledValue.toLowerCase() === 'true';

  useEffect(() => {
    void fetchList();
  }, [searchParams]);

  useEffect(() => {
    if (!passVisitor?.visitorId || !passVisitor.passCode) {
      setPassQrCodeUrl('');
      setPassQrCodeError('');
      setPassQrCodeLoading(false);
      return;
    }

    let cancelled = false;
    let objectUrl = '';

    const loadQrCode = async () => {
      setPassQrCodeUrl('');
      setPassQrCodeError('');
      setPassQrCodeLoading(true);

      try {
        const blob = await visitorApi.qrCode(passVisitor.visitorId!);
        const contentType = blob.type.toLowerCase();
        if (blob.size === 0) {
          throw new Error('二维码图片为空');
        }
        if (contentType && !contentType.startsWith('image/')) {
          throw new Error('二维码接口未返回图片');
        }
        if (cancelled) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setPassQrCodeUrl(objectUrl);
      } catch (error) {
        if (!cancelled) {
          setPassQrCodeError(getErrorMessage(error, '二维码加载失败'));
        }
      } finally {
        if (!cancelled) {
          setPassQrCodeLoading(false);
        }
      }
    };

    void loadQrCode();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [passVisitor?.visitorId, passVisitor?.passCode]);

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await visitorApi.list(searchParams);
      setList(res.records || res.rows || []);
      setTotal(res.total || 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '获取访客列表失败'));
      setList([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setFormData(createDefaultForm());
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!formData.visitorName || !formData.visitReason || !formData.visitDate || !formData.hostId) {
      toast.error('请填写访客信息并选择被访者');
      return;
    }

    setSaving(true);
    try {
      await visitorApi.add(formData);
      toast.success(visitorWorkflowEnabled ? '预约已提交审批' : '预约成功');
      setShowDialog(false);
      setFormData(createDefaultForm());
      void fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async (id: number) => {
    try {
      await visitorApi.confirm(id);
      toast.success('已确认');
      void fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '操作失败'));
    }
  };

  const handleCheckIn = async (id: number) => {
    try {
      await visitorApi.checkIn(id);
      toast.success('已签到');
      void fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '操作失败'));
    }
  };

  const handleCheckOut = async (id: number) => {
    try {
      await visitorApi.checkOut(id);
      toast.success('已签退');
      void fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '操作失败'));
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget?.visitorId) {
      return;
    }

    try {
      await visitorApi.cancel(cancelTarget.visitorId);
      toast.success('已取消');
      setCancelTarget(null);
      void fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '操作失败'));
    }
  };

  const applySearch = () => {
    setSearchParams((prev) => ({
      ...prev,
      visitorName: visitorNameInput.trim(),
      visitDate: visitDateInput,
      pageNum: 1,
    }));
  };

  const handleResetFilters = () => {
    setVisitorNameInput('');
    setVisitDateInput('');
    setSearchParams({
      status: '',
      visitorName: '',
      visitDate: '',
      pageNum: 1,
      pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
    });
  };

  const currentStatusLabel = searchParams.status
    ? statusDict.getLabel(searchParams.status) || '未配置状态'
    : '全部状态';
  const hasActiveFilters = Boolean(searchParams.status || searchParams.visitorName || searchParams.visitDate);
  const pendingCount = list.filter((item) => ['PENDING', 'APPROVING', 'APPROVAL_FAILED'].includes(item.status || '')).length;
  const activeCount = list.filter((item) => item.status === 'CONFIRMED' || item.status === 'ARRIVED').length;
  const finishedCount = list.filter((item) => item.status === 'CHECKED_OUT' || item.status === 'FINISHED' || item.status === 'COMPLETED').length;

  const pageActions = (
    <>
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">visitor access</p>
          <h2>访客预约</h2>
          <span>管理访客预约、通行码、签到签退和取消流程。</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={() => void fetchList()} disabled={loading}>
            <RotateCcw size={14} className={loading ? 'animate-spin' : ''} />刷新
          </Button>
          <Button size="sm" onClick={handleAdd} disabled={!hasPermission('oa:visitor:add')}>
            <Plus size={14} />新增预约
          </Button>
        </div>
      </header>

      <section className="admin-source-stat-grid">
        <article className="card admin-source-stat admin-source-tone-blue">
          <span className="admin-source-stat-icon"><UserCheck size={18} /></span>
          <div><p>预约总数</p><strong>{total}</strong><span>当前查询范围</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-amber">
          <span className="admin-source-stat-icon"><CheckCircle size={18} /></span>
          <div><p>待处理</p><strong>{pendingCount}</strong><span>待确认或审批</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-green">
          <span className="admin-source-stat-icon"><LogIn size={18} /></span>
          <div><p>进行中</p><strong>{activeCount}</strong><span>已确认或已签到</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-violet">
          <span className="admin-source-stat-icon"><LogOut size={18} /></span>
          <div><p>已完成</p><strong>{finishedCount}</strong><span>已签退记录</span></div>
        </article>
      </section>
    </>
  );

  const pageFilters = (
    <section className="card admin-users-toolbar">
      <form
        className="admin-users-filter-grid"
        onSubmit={(event) => {
          event.preventDefault();
          applySearch();
        }}
      >
        <label>
          <span>访客姓名</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input
              value={visitorNameInput}
              onChange={(event) => setVisitorNameInput(event.target.value)}
              placeholder="按访客姓名搜索"
              className="cf-control"
            />
          </div>
        </label>
        <label>
          <span>状态</span>
          <Select
            value={searchParams.status || 'ALL'}
            onValueChange={(value) => setSearchParams((prev) => ({
              ...prev,
              status: value === 'ALL' ? '' : value,
              pageNum: 1,
            }))}
          >
            <SelectTrigger className="cf-control">
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部状态</SelectItem>
              {statusDict.getOptions().map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label>
          <span>来访日期</span>
          <DatePicker
            className="cf-control"
            type="date"
            value={visitDateInput}
            onChange={(event) => setVisitDateInput(event.target.value)}
          />
        </label>
        <div className="admin-users-toolbar-actions">
          <Button type="submit" size="sm"><Search size={14} />搜索</Button>
          {hasActiveFilters ? (
            <Button type="button" variant="outline" size="sm" onClick={handleResetFilters}>
              清空筛选
            </Button>
          ) : null}
          {hasActiveFilters ? (
            <span className="admin-users-filter-count">
              {`${currentStatusLabel} / ${searchParams.visitorName || '全部访客'} / ${searchParams.visitDate || '全部日期'}`}
            </span>
          ) : null}
        </div>
      </form>
    </section>
  );

  const pageTable = (
    <InnerTableSurface>
      <table className="unity-data-table admin-source-table min-w-[1020px]">
          <thead>
            <tr>
              <th>访客</th>
              <th>单位</th>
              <th>来访日期</th>
              <th>被访人</th>
              <th>来访事由</th>
              <th>通行码</th>
              <th>状态</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableStateRow colSpan={8} title="正在加载访客记录..." loading />
            ) : list.length === 0 ? (
              <TableStateRow colSpan={8} title="暂无访客记录" />
            ) : (
              list.map((item) => (
                <tr key={item.visitorId}>
                  <td>
                    <div className="text-sm font-semibold text-cf-title">{item.visitorName}</div>
                    <div className="mt-1 text-xs text-cf-subtle">{item.visitorPhone || '未填写联系电话'}</div>
                  </td>
                  <td className="text-sm">
                    <span className="inline-flex items-center gap-1">
                      <Building2 size={12} className="text-cf-faint" />
                      {item.visitorCompany || '-'}
                    </span>
                  </td>
                  <td className="text-sm">{item.visitDate}</td>
                  <td className="text-sm">{item.hostName || '-'}</td>
                  <td className="max-w-xs text-sm"><span className="line-clamp-1">{item.visitReason}</span></td>
                  <td>
                    {item.passCode ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2.5"
                        onClick={() => setPassVisitor(item)}
                        title={item.passCode}
                      >
                        <QrCode size={14} className="mr-1.5" />查看
                      </Button>
                    ) : (
                      <span className="text-sm text-cf-faint">-</span>
                    )}
                  </td>
                  <td><DictBadge dictType="oa_visitor_status" value={String(item.status || 'PENDING')} /></td>
                  <td>
                    <div className="admin-users-row-actions">
                      {item.status === 'PENDING' && hasPermission('oa:visitor:confirm') ? (
                        <button type="button" data-tooltip="确认" aria-label="确认" onClick={() => handleConfirm(item.visitorId!)}><CheckCircle size={15} /></button>
                      ) : null}
                      {item.status === 'CONFIRMED' && hasPermission('oa:visitor:checkin') ? (
                        <button type="button" data-tooltip="签到" aria-label="签到" onClick={() => handleCheckIn(item.visitorId!)}><LogIn size={15} /></button>
                      ) : null}
                      {item.status === 'ARRIVED' && hasPermission('oa:visitor:checkout') ? (
                        <button type="button" data-tooltip="签退" aria-label="签退" onClick={() => handleCheckOut(item.visitorId!)}><LogOut size={15} /></button>
                      ) : null}
                      {(['PENDING', 'APPROVING', 'APPROVAL_FAILED', 'CONFIRMED'].includes(item.status || '')) && hasPermission('oa:visitor:cancel') ? (
                        <button type="button" className="danger" data-tooltip="取消" aria-label="取消" onClick={() => setCancelTarget(item)}><XCircle size={15} /></button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
      </table>
    </InnerTableSurface>
  );

  const pagePagination = total > 0 ? (
    <Pagination
      total={total}
      page={searchParams.pageNum}
      pageSize={searchParams.pageSize}
      showPageSizeSelector={false}
      showJump={false}
      onPageChange={(page) => setSearchParams((prev) => ({ ...prev, pageNum: page }))}
      onPageSizeChange={() => {}}
    />
  ) : null;

  return (
    <>
      <section className="admin-source-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={Boolean(passVisitor)}
        title={passVisitor?.passCode || '访客通行码'}
        onClose={() => setPassVisitor(null)}
        maxWidthClassName="max-w-md"
        bodyClassName="admin-dialog-stack"
        footer={(
          <Button variant="outline" onClick={() => setPassVisitor(null)}>
            关闭
          </Button>
        )} 
      >
        {passVisitor ? (
          <div className="admin-dialog-stack py-1">
            <div className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-4 py-3 text-sm text-cf-muted dark:border-slate-800 dark:bg-slate-950">
              <div className="font-medium text-cf-title">{passVisitor.visitorName}</div>
              <div className="mt-1 grid gap-1 text-xs text-cf-subtle">
                <span>{passVisitor.visitorCompany || '-'}</span>
                <span>{passVisitor.visitDate || '-'} / {passVisitor.hostName || '-'}</span>
              </div>
            </div>
            <div className="flex flex-col items-center justify-center gap-4 rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-4 py-4 dark:border-slate-800 dark:bg-slate-950">
              {passQrCodeLoading ? (
                <div className="flex h-52 w-52 items-center justify-center rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] p-3 dark:border-slate-800 dark:bg-slate-900">
                  <RotateCcw className="h-5 w-5 animate-spin text-cf-faint" />
                </div>
              ) : passQrCodeError ? (
                <InlineState
                  title="二维码加载失败"
                  description={passQrCodeError}
                  icon={<QrCode className="h-4 w-4" />}
                  className="h-52 w-52 rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-4 py-4 dark:border-slate-800 dark:bg-slate-900"
                />
              ) : passQrCodeUrl ? (
                <img
                  src={passQrCodeUrl}
                  alt="访客通行二维码"
                  className="h-52 w-52 rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] p-3"
                />
              ) : null}
              <div className="font-mono text-sm text-cf-subtle">
                {passVisitor.passCode || '-'}
              </div>
            </div>
          </div>
        ) : null}
      </BaseDialog>

      <BaseDialog
        open={showDialog}
        title="新增访客预约"
        onClose={() => {
          setShowDialog(false);
          setFormData(createDefaultForm());
        }}
        maxWidthClassName="max-w-2xl"
        panelClassName="max-h-[92vh]"
        bodyClassName="admin-dialog-stack max-h-[72vh] overflow-y-auto"
        footer={(
          <>
            <Button
              variant="outline"
              onClick={() => {
                setShowDialog(false);
                setFormData(createDefaultForm());
              }}
            >
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <RotateCcw size={14} className="animate-spin" /> : null}
              {visitorWorkflowEnabled ? '提交审批' : '保存预约'}
            </Button>
          </>
        )}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="admin-dialog-field">
            <Label>访客姓名</Label>
            <Input
              type="text"
              value={formData.visitorName}
              onChange={(event) => setFormData({ ...formData, visitorName: event.target.value })}
              placeholder="请输入访客姓名"
              className="h-11"
            />
          </div>

          <div className="admin-dialog-field">
            <Label>访客电话</Label>
            <Input
              type="text"
              value={formData.visitorPhone || ''}
              onChange={(event) => setFormData({ ...formData, visitorPhone: event.target.value })}
              placeholder="请输入电话号码"
              className="h-11"
            />
          </div>

          <div className="admin-dialog-field">
            <Label>访客单位</Label>
            <Input
              type="text"
              value={formData.visitorCompany || ''}
              onChange={(event) => setFormData({ ...formData, visitorCompany: event.target.value })}
              placeholder="请输入单位名称"
              className="h-11"
            />
          </div>

          <div className="admin-dialog-field">
            <Label>来访人数</Label>
            <Input
              type="number"
              value={formData.visitorCount || 1}
              onChange={(event) => setFormData({
                ...formData,
                visitorCount: parseInt(event.target.value, 10) || 1,
              })}
              min="1"
              className="h-11"
            />
          </div>

          <div className="admin-dialog-field">
            <Label>来访日期</Label>
            <DatePicker
              className="h-11"
              type="date"
              value={formData.visitDate}
              onChange={(event) => setFormData({ ...formData, visitDate: event.target.value })}
            />
          </div>

          <div className="admin-dialog-field">
            <Label>车牌号</Label>
            <Input
              type="text"
              value={formData.carPlate || ''}
              onChange={(event) => setFormData({ ...formData, carPlate: event.target.value })}
              placeholder="选填"
              className="h-11"
            />
          </div>

          <div className="admin-dialog-field md:col-span-2">
            <Label>被访者</Label>
            <UserSelector
              single
              value={formData.hostId ? String(formData.hostId) : null}
              onChange={(id, user) => setFormData({
                ...formData,
                hostId: id ? Number(id) : 0,
                hostName: user?.name || '',
                hostDept: user?.deptName || '',
              })}
              placeholder="搜索姓名或部门选择被访者"
              allowClear
              className="min-h-11"
            />
            {formData.hostId ? (
              <span className="text-xs text-cf-subtle">
                {[formData.hostName, formData.hostDept].filter(Boolean).join(' · ')}
              </span>
            ) : null}
          </div>

          <div className="admin-dialog-field md:col-span-2">
            <Label>来访事由</Label>
            <Textarea
              className="min-h-[120px]"
              value={formData.visitReason}
              onChange={(event) => setFormData({ ...formData, visitReason: event.target.value })}
              placeholder="请输入来访事由"
            />
          </div>
        </div>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="取消预约"
        message={cancelTarget ? `确定取消“${cancelTarget.visitorName}”的预约吗？` : '确定取消这条预约吗？'}
        confirmText="取消预约"
        danger
        onCancel={() => setCancelTarget(null)}
        onConfirm={() => void handleCancel()}
      />
    </>
  );
};

export default VisitorPage;

