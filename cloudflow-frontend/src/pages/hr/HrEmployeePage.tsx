import React, { useEffect, useMemo, useState } from 'react';
import { Edit3, Plus, Search, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Card, Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea } from '@/components/ui';
import { DeptTreeNode, HrEmployee, HrEmployeePayload, PostOption, PositionOption, listEmployees, getEmployeeDetail, createEmployee, updateEmployee, getDeptTreeOptions, getPostOptions, getPositionOptions } from '@/services/api/hr';

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

const flattenDeptTree = (nodes: DeptTreeNode[] = [], prefix = ''): Array<{ label: string; value: number }> => {
  const result: Array<{ label: string; value: number }> = [];
  nodes.forEach(node => {
    result.push({ label: prefix ? `${prefix} / ${node.deptName}` : node.deptName, value: node.deptId });
    if (node.children?.length) {
      result.push(...flattenDeptTree(node.children, prefix ? `${prefix} / ${node.deptName}` : node.deptName));
    }
  });
  return result;
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<HrEmployeePayload>(defaultForm);

  const loadData = async () => {
    setLoading(true);
    try {
      const [employeeRes, deptRes, postRes, positionRes] = await Promise.all([
        listEmployees(),
        getDeptTreeOptions(),
        getPostOptions(),
        getPositionOptions(),
      ]);
      setEmployees(Array.isArray(employeeRes) ? employeeRes : []);
      setDeptOptions(flattenDeptTree(Array.isArray(deptRes) ? deptRes : []));
      setPostOptions(Array.isArray(postRes) ? postRes : []);
      setPositionOptions(Array.isArray(positionRes) ? positionRes : []);
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
      const matchedKeyword = !keyword || [item.name, item.employeeNo, item.deptName]
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
      setEditingId(id);
      setForm({
        employeeNo: detail.employeeNo,
        name: detail.name,
        gender: detail.gender,
        birthDate: detail.birthDate || undefined,
        phone: detail.phone || undefined,
        email: detail.email || undefined,
        deptId: detail.deptId || undefined,
        postId: detail.postId || undefined,
        positionId: detail.positionId || undefined,
        employeeType: detail.employeeType,
        employeeStatus: detail.employeeStatus,
        hireDate: detail.hireDate || undefined,
        regularDate: detail.regularDate || undefined,
        resignDate: detail.resignDate || undefined,
      });
      setDialogOpen(true);
    } catch (error) {
      console.error(error);
      toast.error('员工详情获取失败');
    }
  };

  const handleSubmit = async () => {
    try {
      if (editingId) {
        const { employeeNo, ...payload } = form;
        await updateEmployee(editingId, payload);
        toast.success('员工档案已更新');
      } else {
        await createEmployee(form);
        toast.success('员工档案已创建');
      }
      resetForm();
      await loadData();
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
              <TableRow key={item.id}>
                <TableCell className="font-semibold text-slate-900">{item.employeeNo}</TableCell>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.deptName || '-'}</TableCell>
                <TableCell>{item.postName || '-'}</TableCell>
                <TableCell>{item.positionName || '-'}</TableCell>
                <TableCell>{item.employeeType}</TableCell>
                <TableCell>{statusLabel[item.employeeStatus] || item.employeeStatus}</TableCell>
                <TableCell>{item.hireDate || '-'}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => handleEdit(item.id)}>
                    <Edit3 size={14} className="mr-1" />
                    编辑
                  </Button>
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
              <div className="md:col-span-2"><Label>备注</Label><Textarea value={form.name} disabled className="text-slate-400" /></div>
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
