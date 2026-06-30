import React, { useCallback, useEffect, useState } from 'react';
import { getConfigIntSync } from '../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../constants/sysConfig';
import {
  Calendar,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, ListResultFooter } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/utils/errorMessage';
import { dutyScheduleApi, DutySchedule } from '../services/api/dutySchedule';
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
  UserSelector,
} from '@/components/common';
import { useDict } from '@/hooks/useDict';
import { DictBadge } from '@/components/common/DictBadge';
import type { UserBrief } from '@/types/workflow';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

type SearchParams = {
  status: string;
  scheduleType: string;
  pageNum: number;
  pageSize: number;
};

const emptyFormData: DutySchedule = {
  title: '',
  scheduleType: 'DAILY',
  dutyDate: '',
  userId: 0,
  shiftType: 'DAY',
  userName: '',
  location: '',
  dutyContent: '',
};

const emptySwapData = {
  backupUserId: 0,
  backupUserName: '',
  reason: '',
};

const InlineState: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}> = ({ title, description, icon, className }) => (
  <div className={['flex flex-col items-center justify-center px-6 py-10 text-center', className].filter(Boolean).join(' ')}>
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-cyan-100 bg-[#effbfe] text-[#0d95b5] dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-200">
      {icon || <Calendar className="h-4 w-4" />}
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div> : null}
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
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : icon || <Calendar className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        {description ? <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div> : null}
      </div>
    </td>
  </tr>
);

export const DutySchedulePage: React.FC = () => {
  const { hasPermission } = useAuth();
  const statusDict = useDict('hr_duty_status');
  const typeDict = useDict('hr_duty_type');
  const shiftDict = useDict('hr_duty_shift');
  const [list, setList] = useState<DutySchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState<SearchParams>({
    status: '',
    scheduleType: '',
    pageNum: 1,
    pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
  });
  const [filterDraft, setFilterDraft] = useState({ status: '', scheduleType: '' });
  const [total, setTotal] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [showSwapDialog, setShowSwapDialog] = useState(false);
  const [swapId, setSwapId] = useState<number | null>(null);
  const [swapData, setSwapData] = useState(emptySwapData);
  const [formData, setFormData] = useState<DutySchedule>(emptyFormData);
  const [selectedDutyUserIds, setSelectedDutyUserIds] = useState<string[]>([]);
  const [selectedSwapUserIds, setSelectedSwapUserIds] = useState<string[]>([]);

  useEffect(() => {
    void fetchList();
  }, [searchParams]);

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await dutyScheduleApi.list(searchParams);
      setList(res.records || res.rows || []);
      setTotal(res.total || 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '获取排班列表失败'));
      setList([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFilters = () => {
    setSearchParams((prev) => ({
      ...prev,
      status: filterDraft.status,
      scheduleType: filterDraft.scheduleType,
      pageNum: 1,
    }));
  };

  const handleResetFilters = () => {
    setFilterDraft({ status: '', scheduleType: '' });
    setSearchParams({
      status: '',
      scheduleType: '',
      pageNum: 1,
      pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
    });
  };

  const handleAdd = () => {
    setFormData(emptyFormData);
    setSelectedDutyUserIds([]);
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!formData.title || !formData.dutyDate || !formData.userId) {
      toast.error('请填写完整排班信息');
      return;
    }

    try {
      await dutyScheduleApi.add(formData);
      toast.success('排班创建成功');
      setShowDialog(false);
      setFormData(emptyFormData);
      setSelectedDutyUserIds([]);
      await fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存排班失败'));
    }
  };

  const handleCheckIn = async (id: number) => {
    try {
      await dutyScheduleApi.checkIn(id);
      toast.success('签到成功');
      await fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '签到失败'));
    }
  };

  const handleCheckOut = async (id: number) => {
    try {
      await dutyScheduleApi.checkOut(id);
      toast.success('签退成功');
      await fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '签退失败'));
    }
  };

  const openSwapDialog = (id: number) => {
    setSwapId(id);
    setSwapData(emptySwapData);
    setSelectedSwapUserIds([]);
    setShowSwapDialog(true);
  };

  const handleSwap = async () => {
    if (!swapId || !swapData.backupUserId || !swapData.reason) {
      toast.error('请填写完整换班信息');
      return;
    }

    try {
      await dutyScheduleApi.swap(swapId, swapData);
      toast.success('换班成功');
      setShowSwapDialog(false);
      setSwapId(null);
      setSwapData(emptySwapData);
      setSelectedSwapUserIds([]);
      await fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '换班失败'));
    }
  };

  const updateDutyUser = useCallback((users: UserBrief[]) => {
    const user = users[0];
    setFormData((current) => ({
      ...current,
      userId: user ? Number(user.id) || 0 : 0,
      userName: user?.name || '',
      deptId: user?.deptId ? Number(user.deptId) || undefined : undefined,
      deptName: user?.deptName,
    }));
  }, []);

  const updateSwapUser = useCallback((users: UserBrief[]) => {
    const user = users[0];
    setSwapData((current) => ({
      ...current,
      backupUserId: user ? Number(user.id) || 0 : 0,
      backupUserName: user?.name || '',
    }));
  }, []);

  const hasActiveFilters = Boolean(searchParams.status || searchParams.scheduleType);
  const scheduledCount = list.filter((item) => item.status === 'SCHEDULED').length;
  const checkedInCount = list.filter((item) => item.status === 'CHECKED_IN').length;
  const completedCount = list.filter((item) => item.status === 'COMPLETED').length;
  const currentStatusLabel = searchParams.status ? statusDict.getLabel(searchParams.status) || searchParams.status : '全部状态';
  const currentTypeLabel = searchParams.scheduleType ? typeDict.getLabel(searchParams.scheduleType) || searchParams.scheduleType : '全部类型';
  const resultSummary = hasActiveFilters ? `${currentStatusLabel} / ${currentTypeLabel}` : '全部排班';
  const metrics = [
    { label: '排班记录', value: String(total), meta: `当前页 ${list.length}`, icon: <Calendar size={18} />, tone: 'blue' },
    { label: '待签到', value: String(scheduledCount), meta: '已排班', icon: <LogIn size={18} />, tone: 'amber' },
    { label: '值班中', value: String(checkedInCount), meta: '已签到', icon: <RefreshCw size={18} />, tone: 'violet' },
    { label: '已完成', value: String(completedCount), meta: '已签退', icon: <LogOut size={18} />, tone: 'green' },
  ];

  const pageActions = (
    <div className="grid gap-5">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">DUTY SCHEDULES</p>
          <h2>值班排班</h2>
          <span>管理值班类型、班次、值班人、签到签退和换班状态</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={() => void fetchList()} disabled={loading}>
            <RotateCcw size={16} className={loading ? 'animate-spin' : ''} />
            刷新
          </Button>
          <Button size="sm" onClick={handleAdd} disabled={!hasPermission('oa:duty:add')}>
            <Plus size={16} />
            新增排班
          </Button>
        </div>
      </header>

      <section className="admin-source-stat-grid">
        {metrics.map((metric) => (
          <article key={metric.label} className={`card admin-source-stat admin-source-tone-${metric.tone}`}>
            <div className="admin-source-stat-icon">{metric.icon}</div>
            <div>
              <p>{metric.label}</p>
              <strong>{metric.value}</strong>
              <span>{metric.meta}</span>
            </div>
          </article>
        ))}
      </section>
    </div>
  );

  const pageFilters = (
    <section className="card admin-users-toolbar">
      <div className="admin-oa-filter-grid">
        <label>
          <span className="input-label">状态</span>
          <Select
            value={filterDraft.status || 'ALL'}
            onValueChange={(value) =>
              setFilterDraft((prev) => ({ ...prev, status: value === 'ALL' ? '' : value }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="全部状态" />
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
          <span className="input-label">类型</span>
          <Select
            value={filterDraft.scheduleType || 'ALL'}
            onValueChange={(value) =>
              setFilterDraft((prev) => ({ ...prev, scheduleType: value === 'ALL' ? '' : value }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="全部类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部类型</SelectItem>
              {typeDict.getOptions().map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <div className="admin-users-toolbar-actions">
          <Button variant="outline" size="sm" onClick={handleApplyFilters}>
            <Search size={14} />
            搜索
          </Button>
          <Button variant="outline" size="sm" onClick={handleResetFilters} disabled={!hasActiveFilters}>
            <RotateCcw size={14} />
            重置
          </Button>
        </div>
      </div>
    </section>
  );

  const pageTable = (
    <InnerTableSurface>
      <table className="unity-data-table admin-source-table min-w-[1080px]">
          <thead>
            <tr>
              <th>标题</th>
              <th>类型</th>
              <th>值班日期</th>
              <th>班次</th>
              <th>值班人</th>
              <th>地点</th>
              <th>签到 / 签退</th>
              <th>状态</th>
              <th className="text-right">当前操作</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <TableStateRow colSpan={9} title="正在加载排班记录..." loading />
            ) : list.length === 0 ? (
              <TableStateRow colSpan={9} title="暂无排班记录" />
            ) : (
              list.map((item) => (
                <tr key={item.scheduleId}>
                  <td>{item.title}</td>
                  <td>{typeDict.getLabel(item.scheduleType || '') || item.scheduleType}</td>
                  <td>{item.dutyDate}</td>
                  <td>{shiftDict.getLabel(item.shiftType || '') || '-'}</td>
                  <td>
                    <div>{item.userName || '-'}</div>
                    {item.backupUserName ? (
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        替班 {item.backupUserName}
                      </div>
                    ) : null}
                  </td>
                  <td>{item.location || '-'}</td>
                  <td>
                    <div>{item.checkInTime ? `到: ${item.checkInTime}` : '到: -'}</div>
                    <div className="mt-1">{item.checkOutTime ? `退: ${item.checkOutTime}` : '退: -'}</div>
                  </td>
                  <td>
                    <DictBadge dictType="hr_duty_status" value={String(item.status || 'SCHEDULED')} fallback="已排班" />
                  </td>
                  <td>
                    <div className="admin-users-row-actions">
                      {item.status === 'SCHEDULED' && hasPermission('oa:duty:checkin') ? <button type="button" title="签到" aria-label="签到" onClick={() => handleCheckIn(item.scheduleId!)}><LogIn size={15} /></button> : null}
                      {item.status === 'SCHEDULED' && hasPermission('oa:duty:swap') ? <button type="button" title="换班" aria-label="换班" onClick={() => openSwapDialog(item.scheduleId!)}><RefreshCw size={15} /></button> : null}
                      {item.status === 'CHECKED_IN' && hasPermission('oa:duty:checkout') ? <button type="button" title="签退" aria-label="签退" onClick={() => handleCheckOut(item.scheduleId!)}><LogOut size={15} /></button> : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
      </table>
    </InnerTableSurface>
  );

  const pagePagination = (
    <ListResultFooter
      total={total}
      page={searchParams.pageNum}
      pageSize={searchParams.pageSize}
      summary={resultSummary}
      onPageChange={(page) => setSearchParams((prev) => ({ ...prev, pageNum: page }))}
    />
  );

  return (
    <>
      <section className="admin-source-page oa-approval-page duty-schedule-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={showDialog}
        title="新增排班"
        onClose={() => {
          setShowDialog(false);
          setFormData(emptyFormData);
          setSelectedDutyUserIds([]);
        }}
        maxWidthClassName="w-full sm:max-w-4xl"
        panelClassName="max-h-[92vh]"
        bodyClassName="admin-dialog-stack max-h-[74vh] overflow-y-auto px-4 py-4 sm:px-6 sm:py-5"
        footer={(
          <>
            <Button
              variant="outline"
              onClick={() => {
                setShowDialog(false);
                setFormData(emptyFormData);
                setSelectedDutyUserIds([]);
              }}
            >
              取消
            </Button>
            <Button onClick={handleSave}>保存</Button>
          </>
        )}
      >
        <div className="grid gap-4">
          <section className="card admin-source-panel">
            <div className="admin-source-panel-head">
              <div>
                <h3>基础信息</h3>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="admin-dialog-field sm:col-span-2">
                <Label>排班标题</Label>
                <Input
                  type="text"
                  value={formData.title}
                  onChange={(event) => setFormData({ ...formData, title: event.target.value })}
                  placeholder="例如：周末值班"
                  className="h-11"
                />
              </div>

              <div className="admin-dialog-field">
                <Label>值班类型</Label>
                <Select
                  value={formData.scheduleType}
                  onValueChange={(value) => setFormData({ ...formData, scheduleType: value })}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="请选择值班类型" />
                  </SelectTrigger>
                  <SelectContent>
                    {typeDict.getOptions().map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="admin-dialog-field">
                <Label>班次</Label>
                <Select
                  value={formData.shiftType || 'DAY'}
                  onValueChange={(value) => setFormData({ ...formData, shiftType: value })}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="请选择班次" />
                  </SelectTrigger>
                  <SelectContent>
                    {shiftDict.getOptions().map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="admin-dialog-field">
                <Label>值班日期</Label>
                <DatePicker
                  className="h-11"
                  type="date"
                  value={formData.dutyDate}
                  onChange={(event) => setFormData({ ...formData, dutyDate: event.target.value })}
                />
              </div>

              <div className="admin-dialog-field">
                <Label>值班地点</Label>
                <Input
                  type="text"
                  value={formData.location || ''}
                  onChange={(event) => setFormData({ ...formData, location: event.target.value })}
                  placeholder="选填"
                  className="h-11"
                />
              </div>
            </div>
          </section>

          <section className="card admin-source-panel">
            <div className="admin-source-panel-head">
              <div>
                <h3>值班人和摘要</h3>
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="admin-dialog-field">
                <Label>值班人</Label>
                <UserSelector
                  value={selectedDutyUserIds}
                  onChange={setSelectedDutyUserIds}
                  onUsersChange={updateDutyUser}
                  multiple={false}
                  placeholder="搜索姓名、邮箱或部门"
                  dropdownPlacement="bottom"
                />
                {formData.userName ? (
                  <div className="mt-3 rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900/60">
                    <div className="font-medium text-slate-900 dark:text-slate-100">{formData.userName}</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formData.deptName || '未设置部门'}</div>
                  </div>
                ) : null}
              </div>

              <dl className="grid gap-3 rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] p-4 text-sm dark:border-slate-800 dark:bg-slate-900/60">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500 dark:text-slate-400">类型</dt>
                  <dd className="font-medium text-slate-900 dark:text-slate-100">
                    {typeDict.getLabel(formData.scheduleType || '') || '-'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500 dark:text-slate-400">班次</dt>
                  <dd className="font-medium text-slate-900 dark:text-slate-100">
                    {shiftDict.getLabel(formData.shiftType || 'DAY') || '-'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500 dark:text-slate-400">日期</dt>
                  <dd className="font-medium text-slate-900 dark:text-slate-100">{formData.dutyDate || '-'}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500 dark:text-slate-400">地点</dt>
                  <dd className="max-w-[18rem] truncate font-medium text-slate-900 dark:text-slate-100">
                    {formData.location || '-'}
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="card admin-source-panel">
            <div className="admin-source-panel-head">
              <div>
                <h3>值班内容</h3>
              </div>
            </div>
            <div className="admin-dialog-field">
              <Label>值班内容</Label>
              <Textarea
                className="min-h-[160px]"
                value={formData.dutyContent || ''}
                onChange={(event) => setFormData({ ...formData, dutyContent: event.target.value })}
                placeholder="选填"
              />
            </div>
          </section>
        </div>
      </BaseDialog>

      <BaseDialog
        open={showSwapDialog}
        title="换班申请"
        onClose={() => {
          setShowSwapDialog(false);
          setSwapId(null);
          setSwapData(emptySwapData);
          setSelectedSwapUserIds([]);
        }}
        maxWidthClassName="w-full sm:max-w-2xl"
        bodyClassName="admin-dialog-stack"
        footer={(
          <>
            <Button
              variant="outline"
              onClick={() => {
                setShowSwapDialog(false);
                setSwapId(null);
                setSwapData(emptySwapData);
                setSelectedSwapUserIds([]);
              }}
            >
              取消
            </Button>
            <Button onClick={handleSwap}>确认换班</Button>
          </>
        )}
      >
        <div className="grid gap-4">
          <div className="admin-dialog-field">
            <Label>替班人</Label>
            <UserSelector
              value={selectedSwapUserIds}
              onChange={setSelectedSwapUserIds}
              onUsersChange={updateSwapUser}
              multiple={false}
              placeholder="搜索姓名、邮箱或部门"
              dropdownPlacement="bottom"
            />
            {swapData.backupUserName ? (
              <div className="border border-slate-200 bg-[var(--cf-surface-strong)] px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950">
                <div className="font-medium text-slate-900 dark:text-slate-100">{swapData.backupUserName}</div>
              </div>
            ) : null}
          </div>

          <div className="admin-dialog-field">
            <Label>换班原因</Label>
            <Textarea
              className="min-h-[120px]"
              value={swapData.reason}
              onChange={(event) => setSwapData({ ...swapData, reason: event.target.value })}
              placeholder="请输入换班原因"
            />
          </div>
        </div>
      </BaseDialog>
    </>
  );
};

export default DutySchedulePage;

