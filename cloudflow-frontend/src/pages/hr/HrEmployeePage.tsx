import React, { useEffect, useMemo, useState } from 'react';
import { Edit3, Plus, Search, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Card, Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea } from '@/components/ui';
import { HrEmployee, HrEmployeePayload, PostOption, PositionOption, listEmployees, getEmployeeDetail, createEmployee, updateEmployee, getDeptTreeOptions, getPostOptions, getPositionOptions } from '@/services/api/hr';
import { flattenDeptTree, normalizeRows, toDateInputValue } from './hrShared';
import HrEmployeeWorkspace from './HrEmployeeWorkspace';

const defaultForm: HrEmployeePayload = {
  employeeNo: '',
  name: '',
  gender: 'MALE',
  phone: '',
  email: '',
  deptId: undefined,
  postId: undefined,
  positionId: undefined,
  employeeType: 'FULL_TIME',
  employeeStatus: 'PENDING',
  hireDate: '',
};

const statusLabel: Record<string, string> = {
  PENDING: '待入职',
  PROBATION: '试用期',
  REGULAR: '正式员工',
  RESIGNED: '已离职',
};

export const HrEmployeePage: React.FC = () => {
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [deptOptions, setDeptOptions] = useState<Array<{ label: string; value: number }>>([]);
  const [postOptions, setPostOptions] = useState<PostOption[]>([]);
  const [positionOptions, setPositionOptions] = useState<PositionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('ALL');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<HrEmployeePayload>(defaultForm);

  const loadData = async (preferredEmployeeId?: number) => {
    setLoading(true);
    try {
      const [employeeRes, deptRes, postRes, positionRes] = await Promise.all([
        listEmployees(),
        getDeptTreeOptions(),
        getPostOptions(),
        getPositionOptions(),
      ]);
      const nextEmployees = normalizeRows<HrEmployee>(employeeRes);
      setEmployees(nextEmployees);
      setSelectedEmployeeId(prev => {
        const targetId = preferredEmployeeId ?? prev;
        if (targetId && nextEmployees.some(item => item.id === targetId)) {
          return targetId;
        }
        return nextEmployees[0]?.id ?? null;
      });
      setDeptOptions(flattenDeptTree(Array.isArray(deptRes) ? deptRes : []));
      setPostOptions(normalizeRows<PostOption>(postRes));
      setPositionOptions(normalizeRows<PositionOption>(positionRes));
    } catch (error) {
      console.error(error);
      toast.error('员工数据加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const filteredEmployees = useMemo(() => {
    return employees.filter(item => {
      const matchedKeyword = !keyword || [item.name, item.employeeNo, item.deptName, item.postName, item.positionName, item.phone]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(keyword.toLowerCase()));
      const matchedStatus = status === 'ALL' || item.employeeStatus === status;
      return matchedKeyword && matchedStatus;
    });
  }, [employees, keyword, status]);

  const resetForm = () => {
    setEditingId(null);
    setForm(defaultForm);
    setDialogOpen(false);
  };

  const handleCreate = () => {
    setEditingId(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const handleEdit = async (id: number) => {
    try {
      const detail = await getEmployeeDetail(id);
      setSelectedEmployeeId(id);
      setEditingId(id);
      setForm({
        employeeNo: detail.employeeNo,
        name: detail.name,
        gender: detail.gender,
        birthDate: toDateInputValue(detail.birthDate) || undefined,
        phone: detail.phone || undefined,
        email: detail.email || undefined,
        deptId: detail.deptId || undefined,
        postId: detail.postId || undefined,
        positionId: detail.positionId || undefined,
        employeeType: detail.employeeType,
        employeeStatus: detail.employeeStatus,
        hireDate: toDateInputValue(detail.hireDate) || undefined,
        regularDate: toDateInputValue(detail.regularDate) || undefined,
        resignDate: toDateInputValue(detail.resignDate) || undefined,
      });
      setDialogOpen(true);
    } catch (error) {
      console.error(error);
      toast.error('员工详情获取失败');
    }
  };

  const validateForm = () => {
    if (!editingId && !form.employeeNo.trim()) {
      toast.error('请先填写工号');
      return false;
    }
    if (!form.name.trim()) {
      toast.error('请先填写姓名');
      return false;
    }
    // 员工进入试用、正式或离职状态后，后续工龄、年假等规则都依赖入职日期。
    if (form.employeeStatus !== 'PENDING' && !form.hireDate) {
      toast.error('待入职之外的员工状态必须填写入职日期');
      return false;
    }
    if (form.hireDate && form.regularDate && form.regularDate < form.hireDate) {
      toast.error('转正日期不能早于入职日期');
      return false;
    }
    if (form.hireDate && form.resignDate && form.resignDate < form.hireDate) {
      toast.error('离职日期不能早于入职日期');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    const payload: HrEmployeePayload = {
      ...form,
      employeeNo: form.employeeNo.trim(),
      name: form.name.trim(),
      phone: form.phone?.trim() || undefined,
      email: form.email?.trim() || undefined,
    };

    try {
      if (editingId) {
        const { employeeNo, ...updatePayload } = payload;
        await updateEmployee(editingId, updatePayload);
        toast.success('员工档案已更新');
        await loadData(editingId);
      } else {
        const createdId = await createEmployee(payload);
        toast.success('员工档案已创建');
        await loadData(createdId);
      }
      resetForm();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '保存失败');
    }
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl border-white/80 bg-white/70 p-8 shadow-[0_12px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              <Users size={14} />
              Employee Center
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">员工档案管理</h1>
            <p className="mt-2 text-sm text-slate-500">把员工主数据做成真正可维护的桌面端工作台。</p>
          </div>
          <Button size="lg" className="rounded-2xl" onClick={handleCreate}>
            <Plus size={18} className="mr-2" />
            新建员工
          </Button>
        </div>
      </Card>

      <Card className="rounded-3xl border-white/80 bg-white/70 p-5 backdrop-blur-xl">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.3fr_220px_auto]">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input className="pl-10" placeholder="按姓名、工号、部门搜索" value={keyword} onChange={event => setKeyword(event.target.value)} />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue placeholder="员工状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部状态</SelectItem>
              <SelectItem value="PENDING">待入职</SelectItem>
              <SelectItem value="PROBATION">试用期</SelectItem>
              <SelectItem value="REGULAR">正式员工</SelectItem>
              <SelectItem value="RESIGNED">已离职</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => { setKeyword(''); setStatus('ALL'); }}>重置</Button>
        </div>
      </Card>

      <Card className="rounded-3xl border-white/80 bg-white/70 p-2 backdrop-blur-xl">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>工号</TableHead>
              <TableHead>姓名</TableHead>
              <TableHead>部门</TableHead>
              <TableHead>岗位</TableHead>
              <TableHead>职位</TableHead>
              <TableHead>员工类型</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>入职日期</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEmployees.map(item => (
              <TableRow
                key={item.id}
                className={`cursor-pointer ${selectedEmployeeId === item.id ? 'bg-pink-50/70' : ''}`}
                onClick={() => setSelectedEmployeeId(item.id)}
              >
                <TableCell className="font-semibold text-slate-900">{item.employeeNo}</TableCell>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.deptName || '-'}</TableCell>
                <TableCell>{item.postName || '-'}</TableCell>
                <TableCell>{item.positionName || '-'}</TableCell>
                <TableCell>{item.employeeType}</TableCell>
                <TableCell>{statusLabel[item.employeeStatus] || item.employeeStatus}</TableCell>
                <TableCell>{item.hireDate || '-'}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant={selectedEmployeeId === item.id ? 'secondary' : 'ghost'}
                      onClick={event => {
                        event.stopPropagation();
                        setSelectedEmployeeId(item.id);
                      }}
                    >
                      工作区
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={event => {
                        event.stopPropagation();
                        void handleEdit(item.id);
                      }}
                    >
                      <Edit3 size={14} className="mr-1" />
                      编辑
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!filteredEmployees.length && !loading && (
              <TableRow>
                <TableCell colSpan={9} className="py-12 text-center text-slate-400">暂无符合条件的员工数据</TableCell>
              </TableRow>
            )}
            {loading && (
              <TableRow>
                <TableCell colSpan={9} className="py-12 text-center text-slate-400">正在加载员工档案...</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <HrEmployeeWorkspace
        employees={employees}
        selectedEmployeeId={selectedEmployeeId}
        loading={loading}
        onEditEmployee={handleEdit}
      />

      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-white/80 bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">{editingId ? '编辑员工档案' : '新建员工档案'}</h2>
                <p className="mt-1 text-sm text-slate-500">直接使用 HR 后端的标准字段。</p>
              </div>
              <Button variant="ghost" onClick={resetForm}>关闭</Button>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div><Label>工号</Label><Input value={form.employeeNo} disabled={Boolean(editingId)} onChange={event => setForm(prev => ({ ...prev, employeeNo: event.target.value }))} /></div>
              <div><Label>姓名</Label><Input value={form.name} onChange={event => setForm(prev => ({ ...prev, name: event.target.value }))} /></div>
              <div>
                <Label>性别</Label>
                <Select value={form.gender} onValueChange={value => setForm(prev => ({ ...prev, gender: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="MALE">男</SelectItem><SelectItem value="FEMALE">女</SelectItem></SelectContent>
                </Select>
              </div>
              <div>
                <Label>员工状态</Label>
                <Select value={form.employeeStatus} onValueChange={value => setForm(prev => ({ ...prev, employeeStatus: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDING">待入职</SelectItem>
                    <SelectItem value="PROBATION">试用期</SelectItem>
                    <SelectItem value="REGULAR">正式员工</SelectItem>
                    <SelectItem value="RESIGNED">已离职</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>员工类型</Label>
                <Select value={form.employeeType} onValueChange={value => setForm(prev => ({ ...prev, employeeType: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FULL_TIME">全职</SelectItem>
                    <SelectItem value="PART_TIME">兼职</SelectItem>
                    <SelectItem value="INTERN">实习生</SelectItem>
                    <SelectItem value="CONTRACTOR">外包</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>手机号</Label><Input value={form.phone || ''} onChange={event => setForm(prev => ({ ...prev, phone: event.target.value }))} /></div>
              <div><Label>邮箱</Label><Input value={form.email || ''} onChange={event => setForm(prev => ({ ...prev, email: event.target.value }))} /></div>
              <div><Label>出生日期</Label><Input type="date" value={form.birthDate || ''} onChange={event => setForm(prev => ({ ...prev, birthDate: event.target.value }))} /></div>
              <div>
                <Label>部门</Label>
                <Select value={form.deptId ? String(form.deptId) : undefined} onValueChange={value => setForm(prev => ({ ...prev, deptId: Number(value) }))}>
                  <SelectTrigger><SelectValue placeholder="请选择部门" /></SelectTrigger>
                  <SelectContent>{deptOptions.map(option => <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>岗位</Label>
                <Select value={form.postId ? String(form.postId) : undefined} onValueChange={value => setForm(prev => ({ ...prev, postId: Number(value) }))}>
                  <SelectTrigger><SelectValue placeholder="请选择岗位" /></SelectTrigger>
                  <SelectContent>{postOptions.map(option => <SelectItem key={option.postId} value={String(option.postId)}>{option.postName}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>职位</Label>
                <Select value={form.positionId ? String(form.positionId) : undefined} onValueChange={value => setForm(prev => ({ ...prev, positionId: Number(value) }))}>
                  <SelectTrigger><SelectValue placeholder="请选择职位" /></SelectTrigger>
                  <SelectContent>{positionOptions.map(option => <SelectItem key={option.id} value={String(option.id)}>{option.positionName}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>入职日期</Label><Input type="date" value={form.hireDate || ''} onChange={event => setForm(prev => ({ ...prev, hireDate: event.target.value }))} /></div>
              <div><Label>转正日期</Label><Input type="date" value={form.regularDate || ''} onChange={event => setForm(prev => ({ ...prev, regularDate: event.target.value }))} /></div>
              <div><Label>离职日期</Label><Input type="date" value={form.resignDate || ''} onChange={event => setForm(prev => ({ ...prev, resignDate: event.target.value }))} /></div>
              <div className="md:col-span-2">
                <Label>补充说明</Label>
                <Textarea
                  value="当前员工档案接口暂未提供备注字段，这里只展示说明，不会提交到后端。"
                  readOnly
                  className="text-slate-400"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={resetForm}>取消</Button>
              <Button onClick={handleSubmit}>{editingId ? '保存修改' : '创建员工'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HrEmployeePage;
