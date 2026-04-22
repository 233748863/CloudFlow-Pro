import React, { useEffect, useMemo, useState } from 'react';
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
import { TablePageLayout } from '@/components/layout/TablePageLayout';
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
} from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';

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

const statusMap: Record<string, string> = {
  SCHEDULED: '已排班',
  CHECKED_IN: '已签到',
  COMPLETED: '已完成',
  SWAPPED: '已换班',
  CANCELLED: '已取消',
};

const typeMap: Record<string, string> = {
  DAILY: '日常值班',
  HOLIDAY: '节假日值班',
  EMERGENCY: '应急值班',
};

const shiftMap: Record<string, string> = {
  DAY: '白班',
  NIGHT: '夜班',
  FULL: '全天',
};

const getStatusBadgeClassName = (status: string) => {
  const config: Record<string, string> = {
    SCHEDULED: 'border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200',
    CHECKED_IN: 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
    COMPLETED: 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
    SWAPPED: 'border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200',
    CANCELLED: 'border border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400',
  };

  return config[status] || config.SCHEDULED;
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
  const [list, setList] = useState<DutySchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState<SearchParams>({
    status: '',
    scheduleType: '',
    pageNum: 1,
    pageSize: 10,
  });
  const [filterDraft, setFilterDraft] = useState({ status: '', scheduleType: '' });
  const [total, setTotal] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [showSwapDialog, setShowSwapDialog] = useState(false);
  const [swapId, setSwapId] = useState<number | null>(null);
  const [swapData, setSwapData] = useState(emptySwapData);
  const [formData, setFormData] = useState<DutySchedule>(emptyFormData);

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
      pageSize: 10,
    });
  };

  const handleAdd = () => {
    setFormData(emptyFormData);
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!formData.title || !formData.dutyDate || !formData.userName) {
      toast.error('请填写完整排班信息');
      return;
    }

    try {
      await dutyScheduleApi.add(formData);
      toast.success('排班创建成功');
      setShowDialog(false);
      setFormData(emptyFormData);
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
    setShowSwapDialog(true);
  };

  const handleSwap = async () => {
    if (!swapId || !swapData.backupUserName || !swapData.reason) {
      toast.error('请填写完整换班信息');
      return;
    }

    try {
      await dutyScheduleApi.swap(swapId, swapData);
      toast.success('换班成功');
      setShowSwapDialog(false);
      setSwapId(null);
      setSwapData(emptySwapData);
      await fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '换班失败'));
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / searchParams.pageSize));
  const hasActiveFilters = Boolean(searchParams.status || searchParams.scheduleType);

  // 这里保持后台页常见的紧凑摘要条，只保留和当前治理动作直接相关的计数。
  const summary = useMemo(() => {
    const scheduledCount = list.filter((item) => item.status === 'SCHEDULED').length;
    const checkedInCount = list.filter((item) => item.status === 'CHECKED_IN').length;
    const completedCount = list.filter((item) => item.status === 'COMPLETED').length;
    const swappedCount = list.filter((item) => item.status === 'SWAPPED').length;

    return {
      scheduledCount,
      checkedInCount,
      completedCount,
      swappedCount,
    };
  }, [list]);

  return (
    <div className="space-y-4">
      <div className="min-w-0">
        <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <Calendar className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Duty Schedule
        </div>
        <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          值班排班
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
          统一管理日常、节假日和应急值班安排，并把签到、签退与换班动作收口到同一套后台列表页语法。
        </p>
      </div>

      <TablePageLayout
        className="gap-4"
        actions={(
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              当前结果 {total}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              待签到 {summary.scheduledCount}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              值班中 {summary.checkedInCount}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              已完成 {summary.completedCount}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              已换班 {summary.swappedCount}
            </span>

            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void fetchList()} disabled={loading}>
                <RotateCcw size={14} className={loading ? 'mr-1.5 animate-spin' : 'mr-1.5'} />
                刷新
              </Button>
              <Button size="sm" onClick={handleAdd}>
                <Plus size={14} className="mr-1.5" />
                新增排班
              </Button>
            </div>
          </div>
        )}
        filters={(
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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
                    <SelectItem value="SCHEDULED">已排班</SelectItem>
                    <SelectItem value="CHECKED_IN">已签到</SelectItem>
                    <SelectItem value="COMPLETED">已完成</SelectItem>
                    <SelectItem value="SWAPPED">已换班</SelectItem>
                    <SelectItem value="CANCELLED">已取消</SelectItem>
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
                    <SelectItem value="DAILY">日常值班</SelectItem>
                    <SelectItem value="HOLIDAY">节假日值班</SelectItem>
                    <SelectItem value="EMERGENCY">应急值班</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex w-full flex-wrap items-center justify-end gap-2 lg:w-auto">
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
        table={(
          <div className="flex min-h-[40rem] flex-col">
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">排班列表</div>
                  <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {hasActiveFilters
                      ? `${searchParams.status ? statusMap[searchParams.status] || searchParams.status : '全部状态'} · ${searchParams.scheduleType ? typeMap[searchParams.scheduleType] || searchParams.scheduleType : '全部类型'}`
                      : '当前显示全部排班记录'}
                  </div>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  第 {searchParams.pageNum} / {totalPages} 页 · {total} 条
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table className="min-w-[1180px]">
                <TableHeader className="sticky top-0 z-10 bg-white dark:bg-slate-950/95">
                  <TableRow className="border-slate-100 bg-transparent hover:bg-transparent dark:border-slate-800">
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">标题</TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">类型</TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">值班日期</TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">班次</TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">值班人</TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">地点</TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">签到 / 签退</TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">状态</TableHead>
                    <TableActionHead className="w-56 px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">当前操作</TableActionHead>
                  </TableRow>
                </TableHeader>

                <TableBody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <TableStateRow colSpan={9} title="正在加载排班记录..." loading />
                  ) : list.length === 0 ? (
                    <TableStateRow
                      colSpan={9}
                      title="暂无排班记录"
                      description="先创建一条排班，后续可在这里执行签到、签退和换班。"
                    />
                  ) : (
                    list.map((item) => (
                      <TableRow key={item.scheduleId} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                        <TableCell className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                          {item.title}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                          {typeMap[item.scheduleType] || item.scheduleType}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                          {item.dutyDate}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                          {shiftMap[item.shiftType || ''] || '-'}
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
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusBadgeClassName(item.status || 'SCHEDULED')}`}
                          >
                            {statusMap[item.status || 'SCHEDULED'] || item.status}
                          </span>
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
                                tone: 'success',
                                hidden: item.status !== 'SCHEDULED',
                              },
                              {
                                label: '换班',
                                icon: <RefreshCw size={14} />,
                                onClick: () => openSwapDialog(item.scheduleId!),
                                tone: 'info',
                                hidden: item.status !== 'SCHEDULED',
                              },
                              {
                                label: '签退',
                                icon: <LogOut size={14} />,
                                onClick: () => handleCheckOut(item.scheduleId!),
                                tone: 'warning',
                                hidden: item.status !== 'CHECKED_IN',
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
        )}
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
        description="填写排班标题、值班类型、班次、日期和值班人信息。"
        onClose={() => setShowDialog(false)}
        maxWidthClassName="max-w-3xl"
        panelClassName="max-h-[92vh]"
        bodyClassName="max-h-[72vh] overflow-y-auto"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              取消
            </Button>
            <Button onClick={handleSave}>保存</Button>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">排班标题</Label>
            <Input
              type="text"
              value={formData.title}
              onChange={(event) => setFormData({ ...formData, title: event.target.value })}
              placeholder="例如：2月6日值班"
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
                <SelectItem value="DAILY">日常值班</SelectItem>
                <SelectItem value="HOLIDAY">节假日值班</SelectItem>
                <SelectItem value="EMERGENCY">应急值班</SelectItem>
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
                <SelectItem value="DAY">白班</SelectItem>
                <SelectItem value="NIGHT">夜班</SelectItem>
                <SelectItem value="FULL">全天</SelectItem>
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

          <div className="space-y-2 md:col-span-2">
            <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">值班人姓名</Label>
            <Input
              type="text"
              value={formData.userName || ''}
              onChange={(event) => setFormData({ ...formData, userName: event.target.value })}
              placeholder="请输入值班人"
              className="h-11"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">值班内容</Label>
            <Textarea
              className="min-h-[120px]"
              value={formData.dutyContent || ''}
              onChange={(event) => setFormData({ ...formData, dutyContent: event.target.value })}
              placeholder="选填"
            />
          </div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={showSwapDialog}
        title="换班申请"
        description="填写替班人和换班原因，提交换班操作。"
        onClose={() => setShowSwapDialog(false)}
        maxWidthClassName="max-w-md"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowSwapDialog(false)}>
              取消
            </Button>
            <Button onClick={handleSwap}>确认换班</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">替班人姓名</Label>
            <Input
              type="text"
              value={swapData.backupUserName}
              onChange={(event) => setSwapData({ ...swapData, backupUserName: event.target.value })}
              placeholder="请输入替班人姓名"
              className="h-11"
            />
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
