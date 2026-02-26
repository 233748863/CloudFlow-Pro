import React, { useEffect, useState } from 'react';
import {
  Car, Clock, CheckCircle, XCircle, Eye, DollarSign,
  RotateCcw, ChevronLeft, ChevronRight, Loader2,
  FileText, MapPin, ArrowLeftRight, Ban, CornerDownLeft,
  Fuel, ParkingCircle, Wrench, Shield, MoreHorizontal
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui';
import {
  getUsageList, getExpenseList, addExpense, getExpenseStats,
  approveUsage, returnVehicle, cancelUsage,
  VehicleUsage, VehicleExpense, ExpenseStats
} from '@/services/api/vehicle';

// ==================== 常量配置 ====================

/** 用车状态配置 */
const USAGE_STATUS: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  '0': { label: '待审批', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', icon: <Clock size={14} /> },
  '1': { label: '已批准', color: 'text-green-700', bg: 'bg-green-50 border-green-200', icon: <CheckCircle size={14} /> },
  '2': { label: '已驳回', color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: <XCircle size={14} /> },
  '3': { label: '进行中', color: 'text-pink-600', bg: 'bg-pink-50 border-pink-100', icon: <Car size={14} /> },
  '4': { label: '已完成', color: 'text-gray-700', bg: 'bg-gray-50 border-gray-200', icon: <CheckCircle size={14} /> },
  '5': { label: '已取消', color: 'text-gray-400', bg: 'bg-gray-50 border-gray-200', icon: <Ban size={14} /> },
};

/** 费用类型配置 */
const EXPENSE_TYPES: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  '1': { label: '油费', icon: <Fuel size={14} />, color: 'text-orange-600' },
  '2': { label: '过路费', icon: <ArrowLeftRight size={14} />, color: 'text-pink-500' },
  '3': { label: '停车费', icon: <ParkingCircle size={14} />, color: 'text-purple-600' },
  '4': { label: '维修保养', icon: <Wrench size={14} />, color: 'text-yellow-600' },
  '5': { label: '保险', icon: <Shield size={14} />, color: 'text-green-600' },
  '6': { label: '其他', icon: <MoreHorizontal size={14} />, color: 'text-gray-600' },
};

// ==================== 子组件 ====================

/** 状态标签 */
const UsageStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config = USAGE_STATUS[status] || { label: '未知', color: 'text-gray-500', bg: 'bg-gray-50 border-gray-200', icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${config.bg} ${config.color}`}>
      {config.icon}
      {config.label}
    </span>
  );
};

/** 统计卡片 */
const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; color: string; sub?: string }> = ({ title, value, icon, color, sub }) => (
  <div className="rounded-xl border border-gray-200 p-4">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <div className={`p-3 rounded-lg ${color}`}>{icon}</div>
    </div>
  </div>
);

// ==================== 主组件 ====================

const VehicleUsageList: React.FC = () => {
  // 数据状态
  const [usages, setUsages] = useState<VehicleUsage[]>([]);
  const [usageTotal, setUsageTotal] = useState(0);
  const [expenses, setExpenses] = useState<VehicleExpense[]>([]);
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [stats, setStats] = useState<ExpenseStats | null>(null);
  const [loading, setLoading] = useState(false);

  // 查询条件
  const [usageQuery, setUsageQuery] = useState({ pageNum: 1, pageSize: 10, status: '' });
  const [expenseQuery, setExpenseQuery] = useState({ pageNum: 1, pageSize: 10 });

  // 弹窗状态
  const [isExpenseDialogOpen, setIsExpenseDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [isReturnDialogOpen, setIsReturnDialogOpen] = useState(false);
  const [currentUsage, setCurrentUsage] = useState<VehicleUsage | null>(null);

  // 表单数据
  const [expenseForm, setExpenseForm] = useState<Partial<VehicleExpense>>({
    expenseType: '1', amount: 0,
    expenseDate: new Date().toISOString().split('T')[0], description: '',
  });
  const [approveRemark, setApproveRemark] = useState('');
  const [returnMileage, setReturnMileage] = useState(0);

  // ==================== 数据加载 ====================

  const fetchUsages = async () => {
    setLoading(true);
    try {
      const params: any = { pageNum: usageQuery.pageNum, pageSize: usageQuery.pageSize };
      if (usageQuery.status) params.status = usageQuery.status;
      const res = await getUsageList(params);
      setUsages(res.rows || []);
      setUsageTotal(res.total || 0);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  const fetchExpenses = async () => {
    try {
      const res = await getExpenseList({ pageNum: expenseQuery.pageNum, pageSize: expenseQuery.pageSize });
      setExpenses(res.rows || []);
      setExpenseTotal(res.total || 0);
    } catch { /* ignore */ }
  };

  const fetchStats = async () => {
    try {
      const res = await getExpenseStats();
      setStats(res);
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchUsages(); }, [usageQuery.pageNum, usageQuery.pageSize]);
  useEffect(() => { fetchExpenses(); }, [expenseQuery.pageNum, expenseQuery.pageSize]);
  useEffect(() => { fetchStats(); }, []);

  // ==================== 操作处理 ====================

  /** 查看详情 */
  const handleViewDetail = (usage: VehicleUsage) => {
    setCurrentUsage(usage);
    setIsDetailDialogOpen(true);
  };

  /** 打开审批弹窗 */
  const handleOpenApprove = (usage: VehicleUsage) => {
    setCurrentUsage(usage);
    setApproveRemark('');
    setIsApproveDialogOpen(true);
  };

  /** 执行审批 */
  const handleApprove = async (approved: boolean) => {
    if (!currentUsage?.usageId) return;
    try {
      await approveUsage(currentUsage.usageId, approved, approveRemark);
      toast.success(approved ? '已批准' : '已驳回');
      setIsApproveDialogOpen(false);
      fetchUsages();
    } catch {
      toast.error('操作失败');
    }
  };

  /** 打开归还弹窗 */
  const handleOpenReturn = (usage: VehicleUsage) => {
    setCurrentUsage(usage);
    setReturnMileage(0);
    setIsReturnDialogOpen(true);
  };

  /** 执行归还 */
  const handleReturn = async () => {
    if (!currentUsage?.usageId) return;
    if (returnMileage <= 0) {
      toast.error('请输入有效的结束里程');
      return;
    }
    try {
      await returnVehicle(currentUsage.usageId, { endMileage: returnMileage });
      toast.success('车辆已归还');
      setIsReturnDialogOpen(false);
      fetchUsages();
    } catch {
      toast.error('归还失败');
    }
  };

  /** 取消申请 */
  const handleCancel = async (usage: VehicleUsage) => {
    if (!confirm('确认取消该用车申请？')) return;
    try {
      await cancelUsage(usage.usageId!);
      toast.success('已取消');
      fetchUsages();
    } catch {
      toast.error('取消失败');
    }
  };

  /** 打开录入费用弹窗 */
  const handleOpenExpense = (usage: VehicleUsage) => {
    setCurrentUsage(usage);
    setExpenseForm({
      expenseType: '1', amount: 0,
      expenseDate: new Date().toISOString().split('T')[0], description: '',
    });
    setIsExpenseDialogOpen(true);
  };

  /** 提交费用 */
  const handleSubmitExpense = async () => {
    if (!currentUsage || !expenseForm.amount || expenseForm.amount <= 0) {
      toast.error('请输入有效的费用金额');
      return;
    }
    try {
      await addExpense({
        ...expenseForm,
        usageId: currentUsage.usageId,
        vehicleId: currentUsage.vehicleId,
      } as VehicleExpense);
      toast.success('费用已录入');
      setIsExpenseDialogOpen(false);
      fetchExpenses();
      fetchStats();
    } catch {
      toast.error('录入失败');
    }
  };

  // 分页计算
  const usageTotalPages = Math.ceil(usageTotal / usageQuery.pageSize);
  const expenseTotalPages = Math.ceil(expenseTotal / expenseQuery.pageSize);

  // ==================== 渲染 ====================

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">用车记录与费用</h1>
        <p className="text-sm text-gray-500 mt-1">管理用车申请记录、审批操作和费用明细</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="总费用"
          value={`¥ ${stats?.totalAmount?.toLocaleString() || 0}`}
          icon={<DollarSign size={20} className="text-green-600" />}
          color="bg-green-100"
        />
        <StatCard
          title="本月费用"
          value={`¥ ${stats?.monthlyAmount?.toLocaleString() || 0}`}
          icon={<DollarSign size={20} className="text-pink-500" />}
          color="bg-pink-50"
          sub={stats?.lastMonthAmount ? `上月 ¥${stats.lastMonthAmount.toLocaleString()}` : undefined}
        />
        <StatCard
          title="费用笔数"
          value={stats?.count || 0}
          icon={<FileText size={20} className="text-purple-600" />}
          color="bg-purple-100"
        />
        <StatCard
          title="用车记录"
          value={usageTotal}
          icon={<Car size={20} className="text-orange-600" />}
          color="bg-orange-100"
        />
      </div>

      {/* 标签页 */}
      <Tabs defaultValue="usage">
        <TabsList>
          <TabsTrigger value="usage" className="gap-1">
            <Car size={14} />
            用车记录
          </TabsTrigger>
          <TabsTrigger value="expense" className="gap-1">
            <DollarSign size={14} />
            费用明细
          </TabsTrigger>
        </TabsList>

        {/* ==================== 用车记录 Tab ==================== */}
        <TabsContent value="usage" className="space-y-4 mt-4">
          {/* 筛选栏 */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-wrap items-center gap-3">
                <Select
                  value={usageQuery.status || 'all'}
                  onValueChange={(val) => {
                    setUsageQuery({ ...usageQuery, status: val === 'all' ? '' : val, pageNum: 1 });
                    setTimeout(fetchUsages, 0);
                  }}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="全部状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    <SelectItem value="0">待审批</SelectItem>
                    <SelectItem value="1">已批准</SelectItem>
                    <SelectItem value="2">已驳回</SelectItem>
                    <SelectItem value="3">进行中</SelectItem>
                    <SelectItem value="4">已完成</SelectItem>
                    <SelectItem value="5">已取消</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline" size="sm" className="gap-1"
                  onClick={() => { setUsageQuery({ pageNum: 1, pageSize: 10, status: '' }); setTimeout(fetchUsages, 0); }}
                >
                  <RotateCcw size={14} />
                  重置
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 用车记录表格 */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50/80">
                      <TableHead>车辆</TableHead>
                      <TableHead>申请人</TableHead>
                      <TableHead>用车时间</TableHead>
                      <TableHead>目的地</TableHead>
                      <TableHead>事由</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="text-center">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center h-32">
                          <div className="flex items-center justify-center gap-2 text-gray-400">
                            <Loader2 className="animate-spin" size={18} />
                            加载中...
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : usages.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center h-32">
                          <div className="flex flex-col items-center gap-2 text-gray-400">
                            <Car size={36} strokeWidth={1} />
                            <span>暂无用车记录</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      usages.map((u) => (
                        <TableRow key={u.usageId} className="hover:bg-gray-50/50">
                          <TableCell>
                            <span className="font-mono font-medium">{u.vehiclePlate || `#${u.vehicleId}`}</span>
                          </TableCell>
                          <TableCell>{u.applicantName || `用户${u.applicantId}`}</TableCell>
                          <TableCell>
                            <div className="text-xs space-y-0.5">
                              <div className="text-gray-600">{u.startTime}</div>
                              <div className="text-gray-400">至 {u.endTime}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1 text-sm">
                              <MapPin size={12} className="text-gray-400" />
                              {u.destination}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-gray-600 line-clamp-1 max-w-[150px]">{u.reason}</span>
                          </TableCell>
                          <TableCell>
                            <UsageStatusBadge status={u.status || '0'} />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-1 flex-wrap">
                              {/* 查看详情 */}
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1"
                                onClick={() => handleViewDetail(u)}>
                                <Eye size={13} /> 详情
                              </Button>
                              {/* 审批操作（仅待审批状态） */}
                              {u.status === '0' && (
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-pink-500"
                                  onClick={() => handleOpenApprove(u)}>
                                  <CheckCircle size={13} /> 审批
                                </Button>
                              )}
                              {/* 归还操作（已批准或进行中） */}
                              {(u.status === '1' || u.status === '3') && (
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-green-600"
                                  onClick={() => handleOpenReturn(u)}>
                                  <CornerDownLeft size={13} /> 归还
                                </Button>
                              )}
                              {/* 录入费用（已完成或进行中） */}
                              {(u.status === '3' || u.status === '4') && (
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-purple-600"
                                  onClick={() => handleOpenExpense(u)}>
                                  <DollarSign size={13} /> 费用
                                </Button>
                              )}
                              {/* 取消（仅待审批） */}
                              {u.status === '0' && (
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-red-500"
                                  onClick={() => handleCancel(u)}>
                                  <Ban size={13} /> 取消
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {/* 分页 */}
              {usageTotal > 0 && (
                <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50/50">
                  <span className="text-sm text-gray-500">共 {usageTotal} 条</span>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" disabled={usageQuery.pageNum <= 1}
                      onClick={() => setUsageQuery({ ...usageQuery, pageNum: usageQuery.pageNum - 1 })}
                      className="h-7 w-7 p-0"><ChevronLeft size={14} /></Button>
                    <span className="text-sm px-2">{usageQuery.pageNum}/{usageTotalPages}</span>
                    <Button variant="outline" size="sm" disabled={usageQuery.pageNum >= usageTotalPages}
                      onClick={() => setUsageQuery({ ...usageQuery, pageNum: usageQuery.pageNum + 1 })}
                      className="h-7 w-7 p-0"><ChevronRight size={14} /></Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== 费用明细 Tab ==================== */}
        <TabsContent value="expense" className="space-y-4 mt-4">
          {/* 费用类型分布 */}
          {stats?.byType && Object.keys(stats.byType).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-500">费用类型分布</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(stats.byType).map(([type, amount]) => {
                    const config = EXPENSE_TYPES[type] || { label: '未知', icon: null, color: 'text-gray-600' };
                    return (
                      <div key={type} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border">
                        <span className={config.color}>{config.icon}</span>
                        <span className="text-sm">{config.label}</span>
                        <span className="font-mono font-bold text-sm">¥{(amount as number).toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 费用表格 */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50/80">
                      <TableHead>车辆</TableHead>
                      <TableHead>费用类型</TableHead>
                      <TableHead className="text-right">金额</TableHead>
                      <TableHead>日期</TableHead>
                      <TableHead>说明</TableHead>
                      <TableHead>录入时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center h-24">
                          <div className="flex flex-col items-center gap-2 text-gray-400">
                            <DollarSign size={32} strokeWidth={1} />
                            <span>暂无费用记录</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      expenses.map((e) => {
                        const typeConfig = EXPENSE_TYPES[e.expenseType] || { label: '未知', icon: null, color: 'text-gray-600' };
                        return (
                          <TableRow key={e.expenseId} className="hover:bg-gray-50/50">
                            <TableCell>
                              <span className="font-mono">{e.vehiclePlate || `#${e.vehicleId}`}</span>
                            </TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center gap-1 text-sm ${typeConfig.color}`}>
                                {typeConfig.icon}
                                {typeConfig.label}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold">
                              ¥{e.amount?.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-sm">{e.expenseDate}</TableCell>
                            <TableCell className="text-sm text-gray-600">{e.description || '-'}</TableCell>
                            <TableCell className="text-xs text-gray-400">{e.createTime || '-'}</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
              {/* 分页 */}
              {expenseTotal > 0 && (
                <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50/50">
                  <span className="text-sm text-gray-500">共 {expenseTotal} 条</span>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" disabled={expenseQuery.pageNum <= 1}
                      onClick={() => setExpenseQuery({ ...expenseQuery, pageNum: expenseQuery.pageNum - 1 })}
                      className="h-7 w-7 p-0"><ChevronLeft size={14} /></Button>
                    <span className="text-sm px-2">{expenseQuery.pageNum}/{expenseTotalPages}</span>
                    <Button variant="outline" size="sm" disabled={expenseQuery.pageNum >= expenseTotalPages}
                      onClick={() => setExpenseQuery({ ...expenseQuery, pageNum: expenseQuery.pageNum + 1 })}
                      className="h-7 w-7 p-0"><ChevronRight size={14} /></Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ==================== 详情弹窗 ==================== */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye size={18} />
              用车详情
            </DialogTitle>
          </DialogHeader>
          {currentUsage && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b">
                <div>
                  <span className="font-mono font-bold text-lg">{currentUsage.vehiclePlate || `车辆#${currentUsage.vehicleId}`}</span>
                  <p className="text-sm text-gray-500 mt-0.5">申请人：{currentUsage.applicantName || `用户${currentUsage.applicantId}`}</p>
                </div>
                <UsageStatusBadge status={currentUsage.status || '0'} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-1">
                  <span className="text-gray-400">开始时间</span>
                  <p className="font-medium">{currentUsage.startTime}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-gray-400">结束时间</span>
                  <p className="font-medium">{currentUsage.endTime}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-gray-400">目的地</span>
                  <p className="font-medium">{currentUsage.destination}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-gray-400">随行人数</span>
                  <p className="font-medium">{currentUsage.passengerCount} 人</p>
                </div>
                <div className="col-span-2 space-y-1">
                  <span className="text-gray-400">用车事由</span>
                  <p className="font-medium">{currentUsage.reason}</p>
                </div>
                {currentUsage.passengers && (
                  <div className="col-span-2 space-y-1">
                    <span className="text-gray-400">随行人员</span>
                    <p className="font-medium">{currentUsage.passengers}</p>
                  </div>
                )}
                {currentUsage.startMileage != null && (
                  <div className="space-y-1">
                    <span className="text-gray-400">出发里程</span>
                    <p className="font-mono">{currentUsage.startMileage} km</p>
                  </div>
                )}
                {currentUsage.endMileage != null && (
                  <div className="space-y-1">
                    <span className="text-gray-400">归还里程</span>
                    <p className="font-mono">{currentUsage.endMileage} km</p>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== 审批弹窗 ==================== */}
      <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle size={18} />
              审批用车申请
            </DialogTitle>
          </DialogHeader>
          {currentUsage && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-gray-50 border text-sm">
                <p><span className="text-gray-400">车辆：</span><span className="font-mono font-medium">{currentUsage.vehiclePlate || `#${currentUsage.vehicleId}`}</span></p>
                <p><span className="text-gray-400">申请人：</span>{currentUsage.applicantName || `用户${currentUsage.applicantId}`}</p>
                <p><span className="text-gray-400">目的地：</span>{currentUsage.destination}</p>
                <p><span className="text-gray-400">事由：</span>{currentUsage.reason}</p>
              </div>
              <div className="space-y-1.5">
                <Label>审批意见（可选）</Label>
                <textarea
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 min-h-[60px] resize-none"
                  placeholder="请输入审批意见..."
                  value={approveRemark}
                  onChange={(e) => setApproveRemark(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsApproveDialogOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={() => handleApprove(false)} className="gap-1">
              <XCircle size={14} /> 驳回
            </Button>
            <Button onClick={() => handleApprove(true)} className="gap-1">
              <CheckCircle size={14} /> 批准
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== 归还弹窗 ==================== */}
      <Dialog open={isReturnDialogOpen} onOpenChange={setIsReturnDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CornerDownLeft size={18} />
              归还车辆
            </DialogTitle>
          </DialogHeader>
          {currentUsage && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-gray-50 border text-sm">
                <p><span className="text-gray-400">车辆：</span><span className="font-mono font-medium">{currentUsage.vehiclePlate || `#${currentUsage.vehicleId}`}</span></p>
                <p><span className="text-gray-400">目的地：</span>{currentUsage.destination}</p>
              </div>
              <div className="space-y-1.5">
                <Label>归还里程 (km) <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="请输入当前里程表读数"
                  value={returnMileage || ''}
                  onChange={(e) => setReturnMileage(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReturnDialogOpen(false)}>取消</Button>
            <Button onClick={handleReturn} className="gap-1">
              <CornerDownLeft size={14} /> 确认归还
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== 录入费用弹窗 ==================== */}
      <Dialog open={isExpenseDialogOpen} onOpenChange={setIsExpenseDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign size={18} />
              录入费用
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>费用类型</Label>
              <Select
                value={expenseForm.expenseType || '1'}
                onValueChange={(val) => setExpenseForm({ ...expenseForm, expenseType: val as any })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">油费</SelectItem>
                  <SelectItem value="2">过路费</SelectItem>
                  <SelectItem value="3">停车费</SelectItem>
                  <SelectItem value="4">维修保养</SelectItem>
                  <SelectItem value="5">保险</SelectItem>
                  <SelectItem value="6">其他</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>金额 (元) <span className="text-red-500">*</span></Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                placeholder="0.00"
                value={expenseForm.amount || ''}
                onChange={(e) => setExpenseForm({ ...expenseForm, amount: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>日期</Label>
              <Input
                type="date"
                value={expenseForm.expenseDate || ''}
                onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>说明</Label>
              <Input
                placeholder="费用说明..."
                value={expenseForm.description || ''}
                onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsExpenseDialogOpen(false)}>取消</Button>
            <Button onClick={handleSubmitExpense} className="gap-1">
              <DollarSign size={14} /> 提交
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VehicleUsageList;
