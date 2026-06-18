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
import { BaseDialog, Pagination } from '@/components/common';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
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
  Table,
  TableActionHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  UserSelector,
} from '@/components/common';
import { TableRowActions } from '@/components/common/table-row-actions';
import { useDict } from '@/hooks/useDict';
import { DictBadge } from '@/components/common/DictBadge';
import type { UserBrief } from '@/types/workflow';

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
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
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
    <td colSpan={colSpan} className="px-4 py-16">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
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

  return (
    <div className="space-y-4">
      <TablePageLayout
        className="gap-3"
        actions={(
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/88">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="font-medium text-slate-900 dark:text-slate-100">共 {total} 条</span>
            </div>

            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void fetchList()} disabled={loading}>
                <RotateCcw size={14} className={loading ? 'mr-1.5 animate-spin' : 'mr-1.5'} />
                刷新
              </Button>
              <Button size="sm" onClick={handleAdd} disabled={!hasPermission('oa:duty:add')}>
                <Plus size={14} className="mr-1.5" />
                新增排班
              </Button>
            </div>
          </div>
        )}
        filters={(
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/88 lg:flex-row lg:items-center">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="w-full sm:w-[180px]">
                <Select
                  value={filterDraft.status || 'ALL'}
                  onValueChange={(value) =>
                    setFilterDraft((prev) => ({ ...prev, status: value === 'ALL' ? '' : value }))
                  }
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="全部状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全部状态</SelectItem>
                    {statusDict.getOptions().map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-full sm:w-[190px]">
                <Select
                  value={filterDraft.scheduleType || 'ALL'}
                  onValueChange={(value) =>
                    setFilterDraft((prev) => ({ ...prev, scheduleType: value === 'ALL' ? '' : value }))
                  }
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="全部类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全部类型</SelectItem>
                    {typeDict.getOptions().map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400">
              {hasActiveFilters
                ? `${searchParams.status ? statusDict.getLabel(searchParams.status) || searchParams.status : '全部状态'} / ${searchParams.scheduleType ? typeDict.getLabel(searchParams.scheduleType) || searchParams.scheduleType : '全部类型'}`
                : '全部排班'}
            </div>

            <div className="flex w-full flex-wrap items-center justify-end gap-2 lg:w-auto lg:justify-start">
              <Button variant="outline" size="sm" onClick={handleApplyFilters}>
                <Search size={14} className="mr-1.5" />
                搜索
              </Button>
              <Button variant="outline" size="sm" onClick={handleResetFilters}>
                清空筛选
              </Button>
            </div>
          </div>
        )}
        table={(<TableSurfaceCard>
          <div className="flex min-h-[40rem] flex-col">
            <div className="overflow-x-auto">
              <Table className="min-w-[1080px]">
                <TableHeader className="sticky top-0 z-10">
                  <TableRow className="border-slate-100 bg-transparent hover:bg-transparent dark:border-slate-800">
                    <TableHead className="px-4 py-3 text-left">标题</TableHead>
                    <TableHead className="px-4 py-3 text-left">类型</TableHead>
                    <TableHead className="px-4 py-3 text-left">值班日期</TableHead>
                    <TableHead className="px-4 py-3 text-left">班次</TableHead>
                    <TableHead className="px-4 py-3 text-left">值班人</TableHead>
                    <TableHead className="px-4 py-3 text-left">地点</TableHead>
                    <TableHead className="px-4 py-3 text-left">签到 / 签退</TableHead>
                    <TableHead className="px-4 py-3 text-left">状态</TableHead>
                    <TableActionHead className="w-56 px-4 py-3 text-right">操作</TableActionHead>
                  </TableRow>
                </TableHeader>

                <TableBody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <TableStateRow colSpan={9} title="正在加载排班记录..." loading />
                  ) : list.length === 0 ? (
                    <TableStateRow colSpan={9} title="暂无排班记录" />
                  ) : (
                    list.map((item) => (
                      <TableRow key={item.scheduleId} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                        <TableCell className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                          {item.title}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                          {typeDict.getLabel(item.scheduleType || '') || item.scheduleType}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                          {item.dutyDate}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                          {shiftDict.getLabel(item.shiftType || '') || '-'}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100">
                          <div>{item.userName || '-'}</div>
                          {item.backupUserName ? (
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              替班 {item.backupUserName}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                          {item.location || '-'}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                          <div>{item.checkInTime ? `到: ${item.checkInTime}` : '到: -'}</div>
                          <div className="mt-1">{item.checkOutTime ? `退: ${item.checkOutTime}` : '退: -'}</div>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <DictBadge dictType="hr_duty_status" value={String(item.status || 'SCHEDULED')} fallback="已排班" />
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-4 py-3 text-right">
                          <TableRowActions
                            align="end"
                            className="gap-1"
                            actions={[
                              {
                                label: '签到',
                                icon: <LogIn size={14} />,
                                onClick: () => handleCheckIn(item.scheduleId!),
                                tone: 'neutral',
                                hidden: item.status !== 'SCHEDULED',
                                permissionKey: 'oa:duty:checkin',
                              },
                              {
                                label: '换班',
                                icon: <RefreshCw size={14} />,
                                onClick: () => openSwapDialog(item.scheduleId!),
                                tone: 'neutral',
                                hidden: item.status !== 'SCHEDULED',
                                permissionKey: 'oa:duty:swap',
                              },
                              {
                                label: '签退',
                                icon: <LogOut size={14} />,
                                onClick: () => handleCheckOut(item.scheduleId!),
                                tone: 'neutral',
                                hidden: item.status !== 'CHECKED_IN',
                                permissionKey: 'oa:duty:checkout',
                              },
                            ]}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TableSurfaceCard>)}
        pagination={(
          total > 0 ? (
            <Pagination
              total={total}
              page={searchParams.pageNum}
              pageSize={searchParams.pageSize}
              showPageSizeSelector={false}
              showJump={false}
              onPageChange={(page) => setSearchParams((prev) => ({ ...prev, pageNum: page }))}
              onPageSizeChange={() => {}}
            />
          ) : null
        )}
      />

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
        bodyClassName="max-h-[74vh] overflow-y-auto px-4 py-4 sm:px-6 sm:py-5"
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
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70">
              <h4 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">基础信息</h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">排班标题</Label>
                  <Input
                    type="text"
                    value={formData.title}
                    onChange={(event) => setFormData({ ...formData, title: event.target.value })}
                    placeholder="例如：周末值班"
                    className="h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">值班类型</Label>
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

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">班次</Label>
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

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">值班日期</Label>
                  <DatePicker
                    className="h-11"
                    type="date"
                    value={formData.dutyDate}
                    onChange={(event) => setFormData({ ...formData, dutyDate: event.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">值班地点</Label>
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

            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">值班内容</Label>
                <Textarea
                  className="min-h-[160px]"
                  value={formData.dutyContent || ''}
                  onChange={(event) => setFormData({ ...formData, dutyContent: event.target.value })}
                  placeholder="选填"
                />
              </div>
            </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
            <section className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">值班人</Label>
                <UserSelector
                  value={selectedDutyUserIds}
                  onChange={setSelectedDutyUserIds}
                  onUsersChange={updateDutyUser}
                  multiple={false}
                  placeholder="搜索姓名、邮箱或部门"
                  dropdownPlacement="bottom"
                />
              </div>
              {formData.userName ? (
                <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950">
                  <div className="font-medium text-slate-900 dark:text-slate-100">{formData.userName}</div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formData.deptName || '未设置部门'}</div>
                </div>
              ) : null}
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70">
              <h4 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">排班摘要</h4>
              <dl className="space-y-3 text-sm">
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
                  <dd className="max-w-[12rem] truncate font-medium text-slate-900 dark:text-slate-100">
                    {formData.location || '-'}
                  </dd>
                </div>
              </dl>
            </section>
          </aside>
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
        <div className="grid gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">替班人</Label>
            <UserSelector
              value={selectedSwapUserIds}
              onChange={setSelectedSwapUserIds}
              onUsersChange={updateSwapUser}
              multiple={false}
              placeholder="搜索姓名、邮箱或部门"
              dropdownPlacement="bottom"
            />
            {swapData.backupUserName ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900/60">
                <div className="font-medium text-slate-900 dark:text-slate-100">{swapData.backupUserName}</div>
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">换班原因</Label>
            <Textarea
              className="min-h-[120px]"
              value={swapData.reason}
              onChange={(event) => setSwapData({ ...swapData, reason: event.target.value })}
              placeholder="请输入换班原因"
            />
          </div>
        </div>
      </BaseDialog>
    </div>
  );
};

export default DutySchedulePage;

