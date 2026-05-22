import React, { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/common';
import { TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { BaseDialog } from '@/components/common/BaseDialog';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  HrTrainingCourse,
  HrTrainingCoursePayload,
  HrTrainingCategory,
  HrTrainingCategoryPayload,
  HrTrainingInstructor,
  HrTrainingInstructorPayload,
  listTrainingCourses,
  createTrainingCourse,
  updateTrainingCourse,
  deleteTrainingCourse,
  listTrainingCategories,
  createTrainingCategory,
  deleteTrainingCategory,
  listTrainingInstructors,
  createTrainingInstructor,
  deleteTrainingInstructor,
} from '@/services/api/hr';
import { normalizeRows, enumLabel } from './hrShared';

const modeLabel: Record<string, string> = {
  ONLINE: '线上',
  OFFLINE: '线下',
  BLENDED: '混合',
};

const CoursesTab: React.FC<{
  categories: HrTrainingCategory[];
  instructors: HrTrainingInstructor[];
}> = ({ categories, instructors }) => {
  const [rows, setRows] = useState<HrTrainingCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const defaultForm: HrTrainingCoursePayload = { courseName: '', mode: 'OFFLINE', durationHours: 0, creditHours: 0, status: 'ACTIVE' };
  const [form, setForm] = useState<HrTrainingCoursePayload>(defaultForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listTrainingCourses({ pageSize: 200 });
      setRows(normalizeRows<HrTrainingCourse>(res));
    } catch (error) {
      toast.error(getErrorMessage(error, '课程加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    if (!form.courseName.trim()) {
      toast.error('请填写课程名称');
      return;
    }
    try {
      if (editingId) await updateTrainingCourse(editingId, form);
      else await createTrainingCourse(form);
      toast.success('已保存');
      setOpen(false);
      setEditingId(null);
      setForm(defaultForm);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const handleDelete = async (id: number) => {
    try { await deleteTrainingCourse(id); await load(); } catch (error) { toast.error(getErrorMessage(error, '删除失败')); }
  };

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={() => { setEditingId(null); setForm(defaultForm); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />新建课程
        </Button>
      </div>
      <TableSurfaceCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>编码</TableHead>
              <TableHead>名称</TableHead>
              <TableHead>分类</TableHead>
              <TableHead>讲师</TableHead>
              <TableHead>形式</TableHead>
              <TableHead>课时</TableHead>
              <TableHead>学分</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-slate-400">加载中...</TableCell></TableRow>
            ) : rows.length ? rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-xs">{row.courseCode || '-'}</TableCell>
                <TableCell className="font-medium">{row.courseName}</TableCell>
                <TableCell>{categories.find((c) => c.id === row.categoryId)?.name || '-'}</TableCell>
                <TableCell>{instructors.find((i) => i.id === row.instructorId)?.instructorName || '-'}</TableCell>
                <TableCell>{enumLabel(modeLabel, row.mode)}</TableCell>
                <TableCell>{row.durationHours ?? '-'}</TableCell>
                <TableCell>{row.creditHours ?? '-'}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => { setEditingId(row.id); setForm(row); setOpen(true); }}>编辑</Button>
                    <Button size="sm" variant="ghost" onClick={() => void handleDelete(row.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-slate-400">暂无课程</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableSurfaceCard>

      <BaseDialog
        open={open}
        title={editingId ? '编辑课程' : '新建课程'}
        onClose={() => setOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={() => void handleSave()}>保存</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>课程编码</Label><Input value={form.courseCode ?? ''} onChange={(e) => setForm((p) => ({ ...p, courseCode: e.target.value }))} /></div>
            <div><Label>课程名称</Label><Input value={form.courseName} onChange={(e) => setForm((p) => ({ ...p, courseName: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>分类</Label>
              <Select value={form.categoryId?.toString() || ''} onValueChange={(v) => setForm((p) => ({ ...p, categoryId: v ? Number(v) : undefined }))}>
                <SelectTrigger><SelectValue placeholder="选择分类" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>讲师</Label>
              <Select value={form.instructorId?.toString() || ''} onValueChange={(v) => setForm((p) => ({ ...p, instructorId: v ? Number(v) : undefined }))}>
                <SelectTrigger><SelectValue placeholder="选择讲师" /></SelectTrigger>
                <SelectContent>
                  {instructors.map((i) => <SelectItem key={i.id} value={String(i.id)}>{i.instructorName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>形式</Label>
              <Select value={form.mode} onValueChange={(v) => setForm((p) => ({ ...p, mode: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(modeLabel).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>课时</Label><Input type="number" value={form.durationHours?.toString() || ''} onChange={(e) => setForm((p) => ({ ...p, durationHours: e.target.value }))} /></div>
            <div><Label>学分</Label><Input type="number" value={form.creditHours?.toString() || ''} onChange={(e) => setForm((p) => ({ ...p, creditHours: e.target.value }))} /></div>
          </div>
          <div><Label>简介</Label><Input value={form.description ?? ''} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} /></div>
        </div>
      </BaseDialog>
    </>
  );
};

const CategoryTab: React.FC<{ reload: () => void; categories: HrTrainingCategory[] }> = ({ reload, categories }) => {
  const [name, setName] = useState('');

  const handleAdd = async () => {
    if (!name.trim()) return;
    try {
      const payload: HrTrainingCategoryPayload = { name: name.trim() };
      await createTrainingCategory(payload);
      setName('');
      reload();
    } catch (error) {
      toast.error(getErrorMessage(error, '新增分类失败'));
    }
  };

  const handleDelete = async (id: number) => {
    try { await deleteTrainingCategory(id); reload(); } catch (error) { toast.error(getErrorMessage(error, '删除失败')); }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input placeholder="新分类名称" value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
        <Button size="sm" onClick={() => void handleAdd()}><Plus className="mr-1 h-3 w-3" />添加</Button>
      </div>
      <TableSurfaceCard>
        <Table>
          <TableHeader><TableRow><TableHead>名称</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
          <TableBody>
            {categories.length ? categories.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.name}</TableCell>
                <TableCell><Button size="sm" variant="ghost" onClick={() => void handleDelete(c.id)}><Trash2 className="h-3 w-3" /></Button></TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={2} className="py-10 text-center text-sm text-slate-400">暂无分类</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableSurfaceCard>
    </div>
  );
};

const InstructorTab: React.FC<{ reload: () => void; instructors: HrTrainingInstructor[] }> = ({ reload, instructors }) => {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<HrTrainingInstructorPayload>({ instructorName: '', instructorType: 'INTERNAL' });

  const handleSave = async () => {
    if (!form.instructorName.trim()) {
      toast.error('请填写讲师姓名');
      return;
    }
    try {
      await createTrainingInstructor(form);
      setOpen(false);
      setForm({ instructorName: '', instructorType: 'INTERNAL' });
      reload();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const handleDelete = async (id: number) => {
    try { await deleteTrainingInstructor(id); reload(); } catch (error) { toast.error(getErrorMessage(error, '删除失败')); }
  };

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1 h-3 w-3" />新增讲师</Button>
      </div>
      <TableSurfaceCard>
        <Table>
          <TableHeader>
            <TableRow><TableHead>姓名</TableHead><TableHead>类型</TableHead><TableHead>专业</TableHead><TableHead>联系</TableHead><TableHead>操作</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {instructors.length ? instructors.map((i) => (
              <TableRow key={i.id}>
                <TableCell>{i.instructorName}</TableCell>
                <TableCell>{i.instructorType === 'INTERNAL' ? '内部' : '外聘'}</TableCell>
                <TableCell>{i.expertise || '-'}</TableCell>
                <TableCell>{i.contact || '-'}</TableCell>
                <TableCell><Button size="sm" variant="ghost" onClick={() => void handleDelete(i.id)}><Trash2 className="h-3 w-3" /></Button></TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-slate-400">暂无讲师</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableSurfaceCard>
      <BaseDialog open={open} title="新增讲师" onClose={() => setOpen(false)}
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>取消</Button><Button onClick={() => void handleSave()}>保存</Button></div>}>
        <div className="space-y-3">
          <div><Label>姓名</Label><Input value={form.instructorName} onChange={(e) => setForm((p) => ({ ...p, instructorName: e.target.value }))} /></div>
          <div>
            <Label>类型</Label>
            <Select value={form.instructorType} onValueChange={(v) => setForm((p) => ({ ...p, instructorType: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="INTERNAL">内部</SelectItem>
                <SelectItem value="EXTERNAL">外聘</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>专业领域</Label><Input value={form.expertise ?? ''} onChange={(e) => setForm((p) => ({ ...p, expertise: e.target.value }))} /></div>
          <div><Label>联系方式</Label><Input value={form.contact ?? ''} onChange={(e) => setForm((p) => ({ ...p, contact: e.target.value }))} /></div>
        </div>
      </BaseDialog>
    </>
  );
};

export const HrTrainingCoursePage: React.FC = () => {
  const [categories, setCategories] = useState<HrTrainingCategory[]>([]);
  const [instructors, setInstructors] = useState<HrTrainingInstructor[]>([]);

  const loadRefs = useCallback(async () => {
    try {
      const [catRes, instRes] = await Promise.all([listTrainingCategories(), listTrainingInstructors({ pageSize: 200 })]);
      setCategories(Array.isArray(catRes) ? catRes : []);
      setInstructors(normalizeRows<HrTrainingInstructor>(instRes));
    } catch (error) {
      toast.error(getErrorMessage(error, '基础数据加载失败'));
    }
  }, []);

  useEffect(() => { void loadRefs(); }, [loadRefs]);

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold text-slate-900 dark:text-slate-50">课程库</div>
        <Button variant="outline" size="sm" onClick={() => void loadRefs()}>
          <RefreshCcw className="mr-1 h-3 w-3" />刷新
        </Button>
      </div>
      <Tabs defaultValue="course">
        <TabsList>
          <TabsTrigger value="course">课程</TabsTrigger>
          <TabsTrigger value="category">分类</TabsTrigger>
          <TabsTrigger value="instructor">讲师</TabsTrigger>
        </TabsList>
        <TabsContent value="course"><CoursesTab categories={categories} instructors={instructors} /></TabsContent>
        <TabsContent value="category"><CategoryTab reload={loadRefs} categories={categories} /></TabsContent>
        <TabsContent value="instructor"><InstructorTab reload={loadRefs} instructors={instructors} /></TabsContent>
      </Tabs>
    </div>
  );
};

export default HrTrainingCoursePage;
