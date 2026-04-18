import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle,
  LogIn,
  LogOut,
  Plus,
  RotateCcw,
  Search,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, SearchInput } from '@/components/common';
import { getErrorMessage } from '@/utils/errorMessage';
import { visitorApi, Visitor } from '../services/api/visitor';
import {
  Button,
  Card,
  DatePicker,
  Input,
  Label,
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
import {
  WorkspaceBackdrop,
  WorkspaceHeroMetricsSection,
  WorkspacePageContent,
  WorkspacePaginationBar,
  WorkspaceResultCard,
  WorkspaceTableStateRow,
  WorkspaceWorkbenchCard,
  workspaceGlassSurfaceClassName,
} from '@/components/workspace';

const STATUS_MAP: Record<string, string> = {
  PENDING: '待确认',
  CONFIRMED: '已确认',
  ARRIVED: '已到访',
  COMPLETED: '已离场',
  CANCELLED: '已取消',
};

const STATUS_QUICK_FILTERS = [
  { label: '全部', value: '' },
  { label: '待确认', value: 'PENDING' },
  { label: '已确认', value: 'CONFIRMED' },
  { label: '已到访', value: 'ARRIVED' },
  { label: '已离场', value: 'COMPLETED' },
  { label: '已取消', value: 'CANCELLED' },
];

const getStatusTone = (status: string) => {
  const config: Record<string, string> = {
    PENDING: 'border-amber-200 bg-amber-50 text-amber-700',
    CONFIRMED: 'border-cyan-200 bg-cyan-50 text-cyan-700',
    ARRIVED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    COMPLETED: 'border-slate-200 bg-slate-50 text-slate-700',
    CANCELLED: 'border-slate-200 bg-slate-100 text-slate-500',
  };

  return config[status] || config.PENDING;
};

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

export const VisitorPage: React.FC = () => {
  const [list, setList] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({
    status: '',
    visitorName: '',
    visitDate: '',
    pageNum: 1,
    pageSize: 10,
  });
  const [visitorNameInput, setVisitorNameInput] = useState('');
  const [visitDateInput, setVisitDateInput] = useState('');
  const [total, setTotal] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [formData, setFormData] = useState<Visitor>({
    visitorName: '',
    visitReason: '',
    hostId: 0,
    visitDate: '',
  });

  useEffect(() => {
    void fetchList();
  }, [searchParams]);

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await visitorApi.list(searchParams);
      if (res) {
        setList(res.records || res.rows || []);
        setTotal(res.total || 0);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, '获取访客列表失败'));
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setFormData({
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
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!formData.visitorName || !formData.visitReason || !formData.visitDate) {
      toast.error('请填写完整信息');
      return;
    }

    try {
      await visitorApi.add(formData);
      toast.success('预约成功');
      setShowDialog(false);
      void fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
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

  const handleCancel = async (id: number) => {
    if (!confirm('确定取消这条预约吗？')) {
      return;
    }

    try {
      await visitorApi.cancel(id);
      toast.success('已取消');
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

  const applyStatusFilter = (status: string) => {
    setSearchParams((prev) => ({
      ...prev,
      status,
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
      pageSize: 10,
    });
  };

  const now = useMemo(() => new Date(), []);
  const todayLabel = useMemo(() => formatDateCN(now), [now]);
  const timeLabel = useMemo(() => now.toTimeString().slice(0, 5), [now]);
  const todayString = useMemo(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate(),
    ).padStart(2, '0')}`;
  }, []);

  const pendingCount = useMemo(() => list.filter((item) => item.status === 'PENDING').length, [list]);
  const arrivedCount = useMemo(() => list.filter((item) => item.status === 'ARRIVED').length, [list]);
  const completedCount = useMemo(
    () => list.filter((item) => item.status === 'COMPLETED').length,
    [list],
  );
  const todayVisitCount = useMemo(
    () => list.filter((item) => item.visitDate?.slice(0, 10) === todayString).length,
    [list, todayString],
  );

  const currentStatusLabel = searchParams.status
    ? STATUS_MAP[searchParams.status] || searchParams.status
    : '全部状态';
  const hasActiveFilters = Boolean(searchParams.status || searchParams.visitorName || searchParams.visitDate);
  const totalPages = Math.max(1, Math.ceil(total / searchParams.pageSize));

  const heroMetrics = useMemo(
    () => [
      {
        label: '当前记录',
        value: `${total}`,
        hint: '默认展示当前条件下的访客预约记录',
        icon: <Users size={17} />,
      },
      {
        label: '待确认',
        value: `${pendingCount}`,
        hint: pendingCount > 0 ? '建议优先处理待确认预约' : '当前没有待确认预约',
        icon: <CheckCircle size={17} />,
      },
      {
        label: '今日来访',
        value: `${todayVisitCount}`,
        hint: arrivedCount > 0 ? `当前已有 ${arrivedCount} 位访客完成签到` : '今天还没有签到记录',
        icon: <LogIn size={17} />,
      },
      {
        label: '已离场',
        value: `${completedCount}`,
        hint: completedCount > 0 ? '离场记录会持续保留在列表中' : '当前还没有离场访客',
        icon: <LogOut size={17} />,
      },
    ],
    [arrivedCount, completedCount, pendingCount, todayVisitCount, total],
  );

  const workspaceOverviewItems = [
    {
      label: '记录数',
      value: `${total} 条`,
    },
    {
      label: '状态',
      value: currentStatusLabel,
    },
    {
      label: '访客',
      value: searchParams.visitorName || '全部',
    },
    {
      label: '视图',
      value: hasActiveFilters ? '筛选结果' : '默认视图',
    },
  ];

  const modalSectionClass = 'rounded-2xl border border-slate-200 bg-slate-50/70 p-4';
  const modalLabelClass = 'mb-1.5 block text-sm font-medium text-slate-700';
  const modalInputClass = 'h-11 rounded-xl';
  const modalTextareaClass = 'min-h-28 rounded-xl';

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <WorkspacePageContent>
        <WorkspaceHeroMetricsSection
          badge={
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
                <UserCheck size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500">
                {timeLabel}
              </span>
            </div>
          }
          title="访客预约"
          description="统一查看预约状态、签到进度和当日来访情况。"
          actions={
            <div className="flex flex-wrap gap-2 xl:justify-end">
              <Button className="h-9 rounded-[18px] px-4" onClick={handleAdd}>
                <Plus size={15} className="mr-2" />
                新增预约
              </Button>
              <Button variant="outline" className="h-9 rounded-[18px] px-4" onClick={() => void fetchList()}>
                <RotateCcw size={15} className="mr-2 text-slate-500" />
                刷新数据
              </Button>
            </div>
          }
          contentClassName="p-3.5 sm:p-4"
          metrics={heroMetrics}
        />

        <Card className={`${workspaceGlassSurfaceClassName} p-3`}>
          <div className="flex flex-col gap-3">
            <WorkspaceWorkbenchCard
              title="预约列表"
              total={total}
              hasActiveFilters={hasActiveFilters}
              overviewItems={workspaceOverviewItems}
              quickFilters={STATUS_QUICK_FILTERS}
              activeQuickFilter={searchParams.status}
              onQuickFilterChange={applyStatusFilter}
              quickFilterAside={
                hasActiveFilters ? (
                  <Button variant="outline" size="sm" onClick={handleResetFilters} className="h-9 rounded-[18px] px-4">
                    <RotateCcw size={15} className="mr-2" />
                    清空全部条件
                  </Button>
                ) : (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-400">
                    当前未启用额外筛选
                  </span>
                )
              }
              filterBar={
                <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_220px_auto_auto]">
                  <SearchInput
                    value={visitorNameInput}
                    onChange={setVisitorNameInput}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        applySearch();
                      }
                    }}
                    placeholder="按访客姓名搜索"
                    inputClassName="h-10 rounded-[18px] pr-4"
                  />

                  <DatePicker
                    className="h-10 rounded-[18px]"
                    type="date"
                    value={visitDateInput}
                    onChange={(e) => setVisitDateInput(e.target.value)}
                  />

                  <Button size="sm" onClick={applySearch} className="h-10 rounded-[18px] px-4">
                    <Search size={15} className="mr-2" />
                    应用筛选
                  </Button>

                  <Button variant="outline" size="sm" onClick={handleResetFilters} className="h-10 rounded-[18px] px-4">
                    <RotateCcw size={15} className="mr-2" />
                    清空条件
                  </Button>
                </div>
              }
            />

            <WorkspaceResultCard total={total} description="展示访客预约、通行码、来访状态和当前可执行动作">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50/80">
                    <TableRow className="border-slate-200 hover:bg-transparent">
                      <TableHead className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        访客姓名
                      </TableHead>
                      <TableHead className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        单位
                      </TableHead>
                      <TableHead className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        来访日期
                      </TableHead>
                      <TableHead className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        被访人
                      </TableHead>
                      <TableHead className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        来访事由
                      </TableHead>
                      <TableHead className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        通行码
                      </TableHead>
                      <TableHead className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        状态
                      </TableHead>
                      <TableActionHead className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        当前操作
                      </TableActionHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <WorkspaceTableStateRow type="loading" colSpan={8} title="正在加载访客记录..." />
                    ) : list.length === 0 ? (
                      <WorkspaceTableStateRow
                        colSpan={8}
                        icon={<UserCheck size={26} />}
                        title="暂无访客记录"
                        description="新增预约后，这里会展示被访人、通行码、签到签退和取消动作。"
                      />
                    ) : (
                      list.map((item) => {
                        const tone = getStatusTone(item.status || 'PENDING');

                        return (
                          <TableRow key={item.visitorId} className="border-slate-200 transition hover:bg-slate-50/60">
                            <TableCell className="px-4 py-4 align-top">
                              <div className="text-sm font-semibold text-slate-900">{item.visitorName}</div>
                              <div className="mt-1 text-[11px] text-slate-400">{item.visitorPhone || '未填写联系电话'}</div>
                            </TableCell>
                            <TableCell className="px-4 py-4 align-top text-sm text-slate-600">
                              <span className="inline-flex items-center gap-1">
                                <Building2 size={12} className="text-slate-400" />
                                {item.visitorCompany || '-'}
                              </span>
                            </TableCell>
                            <TableCell className="px-4 py-4 align-top text-sm text-slate-600">{item.visitDate}</TableCell>
                            <TableCell className="px-4 py-4 align-top text-sm text-slate-600">{item.hostName || '-'}</TableCell>
                            <TableCell className="px-4 py-4 align-top text-sm text-slate-600">
                              <span className="line-clamp-1 max-w-[180px]">{item.visitReason}</span>
                            </TableCell>
                            <TableCell className="px-4 py-4 align-top text-sm font-medium text-cyan-600">
                              {item.passCode || '-'}
                            </TableCell>
                            <TableCell className="px-4 py-4 align-top">
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${tone}`}>
                                {STATUS_MAP[item.status || 'PENDING'] || item.status}
                              </span>
                            </TableCell>
                            <TableCell className="px-4 py-4 align-top">
                              <TableRowActions
                                align="end"
                                actions={[
                                  {
                                    label: '确认',
                                    icon: <CheckCircle size={14} />,
                                    onClick: () => handleConfirm(item.visitorId!),
                                    tone: 'primary',
                                    hidden: item.status !== 'PENDING',
                                  },
                                  {
                                    label: '签到',
                                    icon: <LogIn size={14} />,
                                    onClick: () => handleCheckIn(item.visitorId!),
                                    tone: 'success',
                                    hidden: item.status !== 'PENDING' && item.status !== 'CONFIRMED',
                                  },
                                  {
                                    label: '签退',
                                    icon: <LogOut size={14} />,
                                    onClick: () => handleCheckOut(item.visitorId!),
                                    tone: 'warning',
                                    hidden: item.status !== 'ARRIVED',
                                  },
                                  {
                                    label: '取消',
                                    icon: <XCircle size={14} />,
                                    onClick: () => handleCancel(item.visitorId!),
                                    tone: 'danger',
                                    hidden: item.status !== 'PENDING' && item.status !== 'CONFIRMED',
                                  },
                                ]}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              {total > 0 ? (
                <WorkspacePaginationBar
                  total={total}
                  pageNum={searchParams.pageNum}
                  totalPages={totalPages}
                  onPrev={() =>
                    setSearchParams((prev) => ({
                      ...prev,
                      pageNum: Math.max(1, prev.pageNum - 1),
                    }))
                  }
                  onNext={() =>
                    setSearchParams((prev) => ({
                      ...prev,
                      pageNum: prev.pageNum + 1,
                    }))
                  }
                  prevDisabled={searchParams.pageNum <= 1}
                  nextDisabled={searchParams.pageNum >= totalPages}
                />
              ) : null}
            </WorkspaceResultCard>
          </div>
        </Card>
      </WorkspacePageContent>

      <BaseDialog
        open={showDialog}
        title="新增访客预约"
        description="填写来访人、单位、日期与被访人信息，形成完整预约记录。"
        onClose={() => setShowDialog(false)}
        maxWidthClassName="max-w-3xl"
        bodyClassName="space-y-4"
        footer={
          <>
            <Button variant="outline" className="h-11 rounded-xl px-4" onClick={() => setShowDialog(false)}>
              取消
            </Button>
            <Button className="h-11 rounded-xl px-4" onClick={handleSave}>
              保存
            </Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className={modalSectionClass}>
            <Label className={modalLabelClass}>访客姓名</Label>
            <Input
              type="text"
              value={formData.visitorName}
              onChange={(e) => setFormData({ ...formData, visitorName: e.target.value })}
              placeholder="请输入访客姓名"
              className={modalInputClass}
            />
          </div>
          <div className={modalSectionClass}>
            <Label className={modalLabelClass}>访客电话</Label>
            <Input
              type="text"
              value={formData.visitorPhone || ''}
              onChange={(e) => setFormData({ ...formData, visitorPhone: e.target.value })}
              placeholder="请输入电话号码"
              className={modalInputClass}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className={modalSectionClass}>
            <Label className={modalLabelClass}>访客单位</Label>
            <Input
              type="text"
              value={formData.visitorCompany || ''}
              onChange={(e) => setFormData({ ...formData, visitorCompany: e.target.value })}
              placeholder="请输入单位名称"
              className={modalInputClass}
            />
          </div>
          <div className={modalSectionClass}>
            <Label className={modalLabelClass}>来访人数</Label>
            <Input
              type="number"
              value={formData.visitorCount || 1}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  visitorCount: parseInt(e.target.value, 10) || 1,
                })
              }
              min="1"
              className={modalInputClass}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className={modalSectionClass}>
            <Label className={modalLabelClass}>来访日期</Label>
            <DatePicker
              className={modalInputClass}
              type="date"
              value={formData.visitDate}
              onChange={(e) => setFormData({ ...formData, visitDate: e.target.value })}
            />
          </div>
          <div className={modalSectionClass}>
            <Label className={modalLabelClass}>车牌号</Label>
            <Input
              type="text"
              value={formData.carPlate || ''}
              onChange={(e) => setFormData({ ...formData, carPlate: e.target.value })}
              placeholder="选填"
              className={modalInputClass}
            />
          </div>
        </div>

        <div className={modalSectionClass}>
          <Label className={modalLabelClass}>被访人姓名</Label>
          <Input
            type="text"
            value={formData.hostName || ''}
            onChange={(e) => setFormData({ ...formData, hostName: e.target.value })}
            placeholder="请输入被访人姓名"
            className={modalInputClass}
          />
        </div>

        <div className={modalSectionClass}>
          <Label className={modalLabelClass}>来访事由</Label>
          <Textarea
            className={modalTextareaClass}
            value={formData.visitReason}
            onChange={(e) => setFormData({ ...formData, visitReason: e.target.value })}
            placeholder="请输入来访事由"
          />
        </div>
      </BaseDialog>
    </div>
  );
};

export default VisitorPage;
