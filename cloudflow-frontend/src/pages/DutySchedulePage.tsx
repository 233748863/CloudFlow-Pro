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
import { dutyScheduleApi, DutySchedule } from '../services/api/dutySchedule';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  Button,
  Card,
  DatePicker,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TableActionHead,
  TableHead,
  TableHeader,
  Textarea,
} from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';
import {
  WorkspaceBackdrop,
  WorkspaceDialogShell,
  WorkspaceHeroMetricsSection,
  WorkspacePageContent,
  WorkspaceResultCard,
  WorkspaceTableStateRow,
  WorkspaceWorkbenchCard,
  workspaceGlassSurfaceClassName,
} from '@/components/workspace';
import { cn } from '@/utils/cn';

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
    SCHEDULED: 'border border-cyan-200 bg-cyan-50 text-cyan-700',
    CHECKED_IN: 'border border-amber-200 bg-amber-50 text-amber-600',
    COMPLETED: 'border border-emerald-200 bg-emerald-50 text-emerald-600',
    SWAPPED: 'border border-violet-200 bg-violet-50 text-violet-600',
    CANCELLED: 'border border-slate-200 bg-slate-100 text-slate-500',
  };
  return config[status] || config.SCHEDULED;
};

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
    fetchList();
  }, [searchParams]);

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await dutyScheduleApi.list(searchParams);
      if (res) {
        setList(res.records || res.rows || []);
        setTotal(res.total || 0);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, '获取排班列表失败'));
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

  const hasActiveFilters = Boolean(searchParams.status || searchParams.scheduleType);
  const heroMetrics = [
    {
      label: '排班总数',
      value: `${total}`,
      hint: '当前筛选条件下的排班记录总数',
      icon: <Calendar size={17} />,
    },
    {
      label: '待签到',
      value: `${summary.scheduledCount}`,
      hint: '尚未开始执行的排班',
      icon: <LogIn size={17} />,
    },
    {
      label: '值班中',
      value: `${summary.checkedInCount}`,
      hint: '已签到但尚未签退',
      icon: <RefreshCw size={17} />,
    },
    {
      label: '已完成',
      value: `${summary.completedCount}`,
      hint: `已换班 ${summary.swappedCount} 条`,
      icon: <LogOut size={17} />,
    },
  ];

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <WorkspacePageContent>
        <WorkspaceHeroMetricsSection
          badge={
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
              <Calendar className="h-3.5 w-3.5" />
              Duty Workspace
            </span>
          }
          title="值班排班"
          description="统一管理日常、节假日和应急值班安排，并把签到、签退与换班动作收口到同一工作台。"
          actions={
            <Button onClick={handleAdd}>
              <Plus className="h-4 w-4" />
              新增排班
            </Button>
          }
          contentClassName="p-4 sm:p-5"
          metrics={heroMetrics}
        />

        <Card className={`${workspaceGlassSurfaceClassName} p-3.5`}>
          <div className="flex flex-col gap-3">
            <WorkspaceWorkbenchCard
              eyebrow="排班筛选"
              title="值班条件与状态过滤"
              total={total}
              hasActiveFilters={hasActiveFilters}
              overviewItems={[
                { label: '状态筛选', value: searchParams.status ? statusMap[searchParams.status] || searchParams.status : '全部状态' },
                { label: '类型筛选', value: searchParams.scheduleType ? typeMap[searchParams.scheduleType] || searchParams.scheduleType : '全部类型' },
                { label: '当前页', value: `${searchParams.pageNum} / ${totalPages}` },
                { label: '每页条数', value: searchParams.pageSize },
              ]}
              filterBar={
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-[220px_220px_auto_auto]">
                  <Select
                    value={filterDraft.status || 'ALL'}
                    onValueChange={(value) =>
                      setFilterDraft((prev) => ({ ...prev, status: value === 'ALL' ? '' : value }))
                    }
                  >
                    <SelectTrigger className="h-10 rounded-[18px]">
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">全部状态</SelectItem>
                      <SelectItem value="SCHEDULED">已排班</SelectItem>
                      <SelectItem value="CHECKED_IN">已签到</SelectItem>
                      <SelectItem value="COMPLETED">已完成</SelectItem>
                      <SelectItem value="SWAPPED">已换班</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={filterDraft.scheduleType || 'ALL'}
                    onValueChange={(value) =>
                      setFilterDraft((prev) => ({ ...prev, scheduleType: value === 'ALL' ? '' : value }))
                    }
                  >
                    <SelectTrigger className="h-10 rounded-[18px]">
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">全部类型</SelectItem>
                      <SelectItem value="DAILY">日常值班</SelectItem>
                      <SelectItem value="HOLIDAY">节假日值班</SelectItem>
                      <SelectItem value="EMERGENCY">应急值班</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button onClick={handleApplyFilters} className="h-10 rounded-[18px]">
                    <Search className="h-4 w-4" />
                    搜索
                  </Button>
                  <Button variant="outline" onClick={handleResetFilters} className="h-10 rounded-[18px]">
                    <RotateCcw className="h-4 w-4" />
                    重置
                  </Button>
                </div>
              }
            />

            <WorkspaceResultCard
              total={total}
              title="排班列表"
              description="集中查看排班标题、班次、值班人、签到签退状态以及换班操作。"
              footer={
                <div className="flex items-center justify-between border-t border-slate-100 bg-white px-4 py-3">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                    共 {total} 条
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() =>
                        setSearchParams((prev) => ({
                          ...prev,
                          pageNum: Math.max(1, prev.pageNum - 1),
                        }))
                      }
                      disabled={searchParams.pageNum === 1}
                      className="rounded-[18px]"
                    >
                      上一页
                    </Button>
                    <span className="px-3 py-2 text-sm text-slate-600">
                      第 {searchParams.pageNum} / {totalPages} 页
                    </span>
                    <Button
                      variant="outline"
                      onClick={() =>
                        setSearchParams((prev) => ({
                          ...prev,
                          pageNum: prev.pageNum + 1,
                        }))
                      }
                      disabled={searchParams.pageNum >= totalPages}
                      className="rounded-[18px]"
                    >
                      下一页
                    </Button>
                  </div>
                </div>
              }
            >
              <div className="overflow-auto">
                <table className="w-full min-w-[1100px]">
                  <TableHeader className="sticky top-0 z-10">
                    <tr>
                      <TableHead>标题</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>值班日期</TableHead>
                      <TableHead>班次</TableHead>
                      <TableHead>值班人</TableHead>
                      <TableHead>地点</TableHead>
                      <TableHead>签到 / 签退</TableHead>
                      <TableHead>状态</TableHead>
                      <TableActionHead className="w-56">操作</TableActionHead>
                    </tr>
                  </TableHeader>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <WorkspaceTableStateRow
                        colSpan={9}
                        type="loading"
                        title="正在加载排班记录..."
                      />
                    ) : list.length === 0 ? (
                      <WorkspaceTableStateRow
                        colSpan={9}
                        title="暂无排班记录"
                        description="先创建一条排班，后续可在这里执行签到、签退和换班。"
                      />
                    ) : (
                      list.map((item) => (
                        <tr key={item.scheduleId} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3 text-sm font-medium text-slate-900">{item.title}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {typeMap[item.scheduleType] || item.scheduleType}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">{item.dutyDate}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {shiftMap[item.shiftType || ''] || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-900">
                            {item.userName}
                            {item.backupUserName ? ` -> ${item.backupUserName}` : ''}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">{item.location || '-'}</td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {item.checkInTime ? `到: ${item.checkInTime}` : '-'}
                            <br />
                            {item.checkOutTime ? `退: ${item.checkOutTime}` : '-'}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
                                getStatusBadgeClassName(item.status || 'SCHEDULED'),
                              )}
                            >
                              {statusMap[item.status || 'SCHEDULED'] || item.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            <TableRowActions
                              align="end"
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
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </WorkspaceResultCard>
          </div>
        </Card>
      </WorkspacePageContent>

      {showDialog ? (
        <WorkspaceDialogShell
          title="新增排班"
          description="填写排班标题、值班类型、班次、日期和值班人信息。"
          onClose={() => setShowDialog(false)}
          maxWidthClassName="max-w-xl"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">排班标题</label>
              <Input
                type="text"
                value={formData.title}
                onChange={(event) => setFormData({ ...formData, title: event.target.value })}
                placeholder="例如：2月6日值班"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">值班类型</label>
                <Select
                  value={formData.scheduleType}
                  onValueChange={(value) => setFormData({ ...formData, scheduleType: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DAILY">日常值班</SelectItem>
                    <SelectItem value="HOLIDAY">节假日值班</SelectItem>
                    <SelectItem value="EMERGENCY">应急值班</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">班次</label>
                <Select
                  value={formData.shiftType || 'DAY'}
                  onValueChange={(value) => setFormData({ ...formData, shiftType: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DAY">白班</SelectItem>
                    <SelectItem value="NIGHT">夜班</SelectItem>
                    <SelectItem value="FULL">全天</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">值班日期</label>
              <DatePicker
                type="date"
                value={formData.dutyDate}
                onChange={(event) => setFormData({ ...formData, dutyDate: event.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">值班人姓名</label>
                <Input
                  type="text"
                  value={formData.userName || ''}
                  onChange={(event) => setFormData({ ...formData, userName: event.target.value })}
                  placeholder="请输入值班人"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">值班地点</label>
                <Input
                  type="text"
                  value={formData.location || ''}
                  onChange={(event) => setFormData({ ...formData, location: event.target.value })}
                  placeholder="选填"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">值班内容</label>
              <Textarea
                className="h-20"
                value={formData.dutyContent || ''}
                onChange={(event) => setFormData({ ...formData, dutyContent: event.target.value })}
                placeholder="选填"
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                取消
              </Button>
              <Button onClick={handleSave}>保存</Button>
            </div>
          </div>
        </WorkspaceDialogShell>
      ) : null}

      {showSwapDialog ? (
        <WorkspaceDialogShell
          title="换班申请"
          description="填写替班人和换班原因，提交换班操作。"
          onClose={() => setShowSwapDialog(false)}
          maxWidthClassName="max-w-md"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">替班人姓名</label>
              <Input
                type="text"
                value={swapData.backupUserName}
                onChange={(event) =>
                  setSwapData({ ...swapData, backupUserName: event.target.value })
                }
                placeholder="请输入替班人姓名"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">换班原因</label>
              <Textarea
                className="h-24"
                value={swapData.reason}
                onChange={(event) => setSwapData({ ...swapData, reason: event.target.value })}
                placeholder="请输入换班原因"
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowSwapDialog(false)}>
                取消
              </Button>
              <Button onClick={handleSwap}>
                确认换班
              </Button>
            </div>
          </div>
        </WorkspaceDialogShell>
      ) : null}
    </div>
  );
};

export default DutySchedulePage;
