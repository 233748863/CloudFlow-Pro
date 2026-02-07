import React, { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
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
  // Tabs,
  //TabsContent,
  //TabsList,
  //TabsTrigger
} from '@/components/ui'
import { getUsageList, getExpenseList, addExpense, getExpenseStats, VehicleUsage, VehicleExpense } from '@/services/api/vehicle';
import { useMount } from '@/hooks/useMount';

// Mock Tabs if not available
const SimpleTabs = ({ children, defaultValue }: any) => {
  const [active, setActive] = useState(defaultValue);
  return (
    <div>
      <div className="flex space-x-2 border-b mb-4">
        {React.Children.map(children, (child) => (
          <button
            className={`px-4 py-2 ${active === child.props.value ? 'border-b-2 border-blue-500 font-bold' : ''}`}
            onClick={() => setActive(child.props.value)}
          >
            {child.props.label}
          </button>
        ))}
      </div>
      {React.Children.map(children, (child) => (
        active === child.props.value ? child : null
      ))}
    </div>
  );
};
const Tab = ({ children }: any) => <div>{children}</div>;

const VehicleUsageList: React.FC = () => {
  const [usages, setUsages] = useState<VehicleUsage[]>([]);
  const [expenses, setExpenses] = useState<VehicleExpense[]>([]);
  const [stats, setStats] = useState<any>(null);
  
  const [isExpenseDialogOpen, setIsExpenseDialogOpen] = useState(false);
  const [currentUsageId, setCurrentUsageId] = useState<number | null>(null);
  const [currentVehicleId, setCurrentVehicleId] = useState<number | null>(null);
  
  const [expenseForm, setExpenseForm] = useState<Partial<VehicleExpense>>({
    expenseType: '1',
    amount: 0,
    expenseDate: new Date().toISOString().split('T')[0],
    description: '',
  });

  useMount(() => {
    fetchUsages();
    fetchExpenses();
    fetchStats();
  });

  const fetchUsages = async () => {
    const res = await getUsageList({ pageNum: 1, pageSize: 20 });
    setUsages(res.rows);
  };

  const fetchExpenses = async () => {
    const res = await getExpenseList({ pageNum: 1, pageSize: 20 });
    setExpenses(res.rows);
  };

  const fetchStats = async () => {
    const res = await getExpenseStats();
    setStats(res);
  };

  const handleAddExpense = (usage: VehicleUsage) => {
    setCurrentUsageId(usage.usageId!);
    setCurrentVehicleId(usage.vehicleId);
    setExpenseForm({
      expenseType: '1',
      amount: 0,
      expenseDate: new Date().toISOString().split('T')[0],
      description: '',
    });
    setIsExpenseDialogOpen(true);
  };

  const submitExpense = async () => {
    if (!currentVehicleId) return;
    await addExpense({
      ...expenseForm,
      usageId: currentUsageId || undefined,
      vehicleId: currentVehicleId,
    } as VehicleExpense);
    setIsExpenseDialogOpen(false);
    fetchExpenses();
    fetchStats();
  };

  const getStatusLabel = (status?: string) => {
    const map: any = { '0': '待审批', '1': '已批准', '2': '已驳回', '3': '进行中', '4': '已完成', '5': '已取消' };
    return map[status || ''] || status;
  };

  const getExpenseTypeLabel = (type: string) => {
    const map: any = { '1': '油费', '2': '过路费', '3': '停车费', '4': '维修保养', '5': '保险', '6': '其他' };
    return map[type] || type;
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">用车记录与费用</h1>
      
      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="p-4 border rounded shadow bg-white">
            <div className="text-gray-500">总费用</div>
            <div className="text-2xl font-bold">¥ {stats.totalAmount || 0}</div>
          </div>
          <div className="p-4 border rounded shadow bg-white">
            <div className="text-gray-500">费用笔数</div>
            <div className="text-2xl font-bold">{stats.count || 0}</div>
          </div>
        </div>
      )}

      <SimpleTabs defaultValue="usage">
        <Tab value="usage" label="用车记录">
          <div className="border rounded-md mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>车辆ID</TableHead>
                  <TableHead>申请人</TableHead>
                  <TableHead>时间</TableHead>
                  <TableHead>目的地</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usages.map((u) => (
                  <TableRow key={u.usageId}>
                    <TableCell>{u.vehicleId}</TableCell>
                    <TableCell>{u.applicantId}</TableCell>
                    <TableCell>{u.startTime} ~ {u.endTime}</TableCell>
                    <TableCell>{u.destination}</TableCell>
                    <TableCell>{getStatusLabel(u.status)}</TableCell>
                    <TableCell>
                      {u.status === '4' || u.status === '3' ? (
                        <Button size="sm" variant="outline" onClick={() => handleAddExpense(u)}>录入费用</Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Tab>
        <Tab value="expense" label="费用明细">
          <div className="border rounded-md mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>车辆ID</TableHead>
                  <TableHead>费用类型</TableHead>
                  <TableHead>金额</TableHead>
                  <TableHead>日期</TableHead>
                  <TableHead>说明</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((e) => (
                  <TableRow key={e.expenseId}>
                    <TableCell>{e.vehicleId}</TableCell>
                    <TableCell>{getExpenseTypeLabel(e.expenseType)}</TableCell>
                    <TableCell>¥{e.amount}</TableCell>
                    <TableCell>{e.expenseDate}</TableCell>
                    <TableCell>{e.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Tab>
      </SimpleTabs>

      <Dialog open={isExpenseDialogOpen} onOpenChange={setIsExpenseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>录入费用</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label>费用类型</label>
              <Select
                value={expenseForm.expenseType}
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
            <div>
              <label>金额</label>
              <Input
                type="number"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm({ ...expenseForm, amount: parseFloat(e.target.value) })}
              />
            </div>
            <div>
              <label>日期</label>
              <Input
                type="date"
                value={expenseForm.expenseDate}
                onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })}
              />
            </div>
            <div>
              <label>说明</label>
              <Input
                value={expenseForm.description}
                onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={submitExpense}>提交</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VehicleUsageList;
