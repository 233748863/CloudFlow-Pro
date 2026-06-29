import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, Pencil, Plus, RefreshCcw, Tags, Trash2, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  ConfirmDialog,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { getErrorMessage } from '@/utils/errorMessage';
import { TablePageLayout, InnerTableSurface } from '@/components/layout/TablePageLayout';
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
import { normalizeRows } from './hrShared';
import { DictLabel } from '@/components/common/DictLabel';
import { useDict } from '@/hooks/useDict';

const CoursesTab: React.FC<{
  categories: HrTrainingCategory[];
  instructors: HrTrainingInstructor[];
}> = ({ categories, instructors }) => {
  const [rows, setRows] = useState<HrTrainingCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const modeOptions = useDict('hr_training_mode').getOptions();
  const defaultForm: HrTrainingCoursePayload = { courseName: '', mode: 'OFFLINE', durationHours: 0, creditHours: 0, status: 'ACTIVE' };
  const [form, setForm] = useState<HrTrainingCoursePayload>(defaultForm);
  const [deleteTarget, setDeleteTarget] = useState<HrTrainingCourse | null>(null);

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

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTrainingCourse(deleteTarget.id);
      toast.success('已删除');
      setDeleteTarget(null);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '删除失败'));
    }
  };

  return (
    <div className="admin-source-content-grid">
      <section className="card admin-users-toolbar">
        <div className="admin-users-filter-grid">
          <div>
            <span className="input-label">课程数量</span>
            <div className="admin-source-search-field">
              <BookOpen size={16} />
              <Input className="h-[42px]" value={`共 ${rows.length} 门`} readOnly aria-label="课程数量" />
            </div>
          </div>
        </div>
        <div className="admin-users-toolbar-actions">
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCcw className="mr-1.5 h-4 w-4" />刷新
          </Button>
          <Button size="sm" onClick={() => { setEditingId(null); setForm(defaultForm); setOpen(true); }}>
            <Plus className="mr-1.5 h-4 w-4" />新建课程
          </Button>
        </div>
      </section>
      <InnerTableSurface>
        <div className="admin-horizontal-scroll">
          <table className="unity-data-table admin-source-table min-w-[840px]">
            <thead>
              <tr>
                <th>编码</th>
                <th>名称</th>
                <th>分类</th>
                <th>讲师</th>
                <th>形式</th>
                <th>课时</th>
                <th>学分</th>
                <th className="text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="admin-settings-empty">加载中...</td></tr>
              ) : rows.length ? rows.map((row) => (
                <tr key={row.id}>
                  <td className="font-mono text-xs">{row.courseCode || '-'}</td>
                  <td><strong>{row.courseName}</strong></td>
                  <td>{categories.find((c) => c.id === row.categoryId)?.name || '-'}</td>
                  <td>{instructors.find((i) => i.id === row.instructorId)?.instructorName || '-'}</td>
                  <td><DictLabel dictType="hr_training_mode" value={row.mode} fallback="-" /></td>
                  <td>{row.durationHours ?? '-'}</td>
                  <td>{row.creditHours ?? '-'}</td>
                  <td>
                    <div className="admin-users-row-actions">
                      <button type="button" title="编辑" onClick={() => { setEditingId(row.id); setForm(row); setOpen(true); }}>
                        <Pencil size={15} />
                      </button>
                      <button type="button" className="danger" title="删除" onClick={() => setDeleteTarget(row)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={8} className="admin-settings-empty">暂无课程</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </InnerTableSurface>

      <BaseDialog
        open={open}
        title={editingId ? '编辑课程' : '新建课程'}
        onClose={() => setOpen(false)}
        bodyClassName="admin-dialog-stack"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={() => void handleSave()}>保存</Button>
          </div>
        }
      >
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="admin-dialog-field"><Label>课程编码</Label><Input value={form.courseCode ?? ''} onChange={(e) => setForm((p) => ({ ...p, courseCode: e.target.value }))} /></div>
            <div className="admin-dialog-field"><Label>课程名称</Label><Input value={form.courseName} onChange={(e) => setForm((p) => ({ ...p, courseName: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="admin-dialog-field">
              <Label>分类</Label>
              <Select value={form.categoryId?.toString() || ''} onValueChange={(v) => setForm((p) => ({ ...p, categoryId: v ? Number(v) : undefined }))}>
                <SelectTrigger><SelectValue placeholder="选择分类" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="admin-dialog-field">
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
            <div className="admin-dialog-field">
              <Label>形式</Label>
              <Select value={form.mode} onValueChange={(v) => setForm((p) => ({ ...p, mode: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {modeOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="admin-dialog-field"><Label>课时</Label><Input type="number" value={form.durationHours?.toString() || ''} onChange={(e) => setForm((p) => ({ ...p, durationHours: e.target.value }))} /></div>
            <div className="admin-dialog-field"><Label>学分</Label><Input type="number" value={form.creditHours?.toString() || ''} onChange={(e) => setForm((p) => ({ ...p, creditHours: e.target.value }))} /></div>
          </div>
          <div className="admin-dialog-field"><Label>简介</Label><Input value={form.description ?? ''} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} /></div>
        </>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除课程"
        message={deleteTarget ? `确认删除课程「${deleteTarget.courseName}」?此操作不可撤销。` : ''}
        danger
        confirmText="确认删除"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleDeleteConfirm()}
      />
    </div>
  );
};

const CategoryTab: React.FC<{ reload: () => void; categories: HrTrainingCategory[] }> = ({ reload, categories }) => {
  const [name, setName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<HrTrainingCategory | null>(null);

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

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTrainingCategory(deleteTarget.id);
      toast.success('已删除');
      setDeleteTarget(null);
      reload();
    } catch (error) {
      toast.error(getErrorMessage(error, '删除失败'));
    }
  };

  return (
    <div className="admin-source-content-grid">
      <section className="card admin-users-toolbar">
        <div className="admin-users-filter-grid">
          <label>
            <span className="input-label">新分类名称</span>
            <Input placeholder="输入分类名称" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        </div>
        <div className="admin-users-toolbar-actions">
          <Button size="sm" onClick={() => void handleAdd()}><Plus className="mr-1 h-3 w-3" />添加分类</Button>
        </div>
      </section>
      <InnerTableSurface>
        <div className="admin-horizontal-scroll">
          <table className="unity-data-table admin-source-table min-w-[360px]">
            <thead>
              <tr><th>名称</th><th className="text-right">操作</th></tr>
            </thead>
            <tbody>
              {categories.length ? categories.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.name}</strong></td>
                  <td>
                    <div className="admin-users-row-actions">
                      <button type="button" className="danger" title="删除" onClick={() => setDeleteTarget(c)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={2} className="admin-settings-empty">暂无分类</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </InnerTableSurface>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除分类"
        message={deleteTarget ? `确认删除分类「${deleteTarget.name}」?` : ''}
        danger
        confirmText="确认删除"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleDeleteConfirm()}
      />
    </div>
  );
};

const InstructorTab: React.FC<{ reload: () => void; instructors: HrTrainingInstructor[] }> = ({ reload, instructors }) => {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<HrTrainingInstructorPayload>({ instructorName: '', instructorType: 'INTERNAL' });
  const [deleteTarget, setDeleteTarget] = useState<HrTrainingInstructor | null>(null);

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

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTrainingInstructor(deleteTarget.id);
      toast.success('已删除');
      setDeleteTarget(null);
      reload();
    } catch (error) {
      toast.error(getErrorMessage(error, '删除失败'));
    }
  };

  return (
    <div className="admin-source-content-grid">
      <section className="card admin-users-toolbar">
        <div className="admin-users-filter-grid">
          <div>
            <span className="input-label">讲师数量</span>
            <div className="admin-source-search-field">
              <UserRound size={16} />
              <Input className="h-[42px]" value={`共 ${instructors.length} 人`} readOnly aria-label="讲师数量" />
            </div>
          </div>
        </div>
        <div className="admin-users-toolbar-actions">
          <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1.5 h-4 w-4" />新增讲师</Button>
        </div>
      </section>
      <InnerTableSurface>
        <div className="admin-horizontal-scroll">
          <table className="unity-data-table admin-source-table min-w-[600px]">
            <thead>
              <tr><th>姓名</th><th>类型</th><th>专业</th><th>联系</th><th className="text-right">操作</th></tr>
            </thead>
            <tbody>
              {instructors.length ? instructors.map((i) => (
                <tr key={i.id}>
                  <td><strong>{i.instructorName}</strong></td>
                  <td>{i.instructorType === 'INTERNAL' ? '内部' : '外聘'}</td>
                  <td>{i.expertise || '-'}</td>
                  <td>{i.contact || '-'}</td>
                  <td>
                    <div className="admin-users-row-actions">
                      <button type="button" className="danger" title="删除" onClick={() => setDeleteTarget(i)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={5} className="admin-settings-empty">暂无讲师</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </InnerTableSurface>
      <BaseDialog open={open} title="新增讲师" onClose={() => setOpen(false)} bodyClassName="admin-dialog-stack"
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>取消</Button><Button onClick={() => void handleSave()}>保存</Button></div>}>
        <>
          <div className="admin-dialog-field"><Label>姓名</Label><Input value={form.instructorName} onChange={(e) => setForm((p) => ({ ...p, instructorName: e.target.value }))} /></div>
          <div className="admin-dialog-field">
            <Label>类型</Label>
            <Select value={form.instructorType} onValueChange={(v) => setForm((p) => ({ ...p, instructorType: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="INTERNAL">内部</SelectItem>
                <SelectItem value="EXTERNAL">外聘</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="admin-dialog-field"><Label>专业领域</Label><Input value={form.expertise ?? ''} onChange={(e) => setForm((p) => ({ ...p, expertise: e.target.value }))} /></div>
          <div className="admin-dialog-field"><Label>联系方式</Label><Input value={form.contact ?? ''} onChange={(e) => setForm((p) => ({ ...p, contact: e.target.value }))} /></div>
        </>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除讲师"
        message={deleteTarget ? `确认删除讲师「${deleteTarget.instructorName}」?` : ''}
        danger
        confirmText="确认删除"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleDeleteConfirm()}
      />
    </div>
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
    <section className="admin-source-page">
      <TablePageLayout
        actions={
          <>
            <header className="admin-source-header">
              <div>
                <p className="admin-source-kicker">TRAINING COURSE BASE</p>
                <h2>课程资源</h2>
                <span>维护课程、分类和讲师基础资料</span>
              </div>
            </header>
            <section className="admin-source-stat-grid">
              <article className="card admin-source-stat admin-source-tone-blue">
                <div className="admin-source-stat-icon"><BookOpen size={18} /></div>
                <div><p>课程</p><strong>课程库</strong><span>培训内容和学分</span></div>
              </article>
              <article className="card admin-source-stat admin-source-tone-green">
                <div className="admin-source-stat-icon"><Tags size={18} /></div>
                <div><p>分类</p><strong>{categories.length}</strong><span>课程分类维护</span></div>
              </article>
              <article className="card admin-source-stat admin-source-tone-violet">
                <div className="admin-source-stat-icon"><UserRound size={18} /></div>
                <div><p>讲师</p><strong>{instructors.length}</strong><span>内部和外聘讲师</span></div>
              </article>
            </section>
          </>
        }
        table={
          <Tabs defaultValue="course" className="admin-source-content-grid">
            <TabsList className="admin-source-tabs w-full justify-start overflow-x-auto lg:w-auto">
              <TabsTrigger value="course" className="flex-1 lg:flex-none">课程</TabsTrigger>
              <TabsTrigger value="category" className="flex-1 lg:flex-none">分类</TabsTrigger>
              <TabsTrigger value="instructor" className="flex-1 lg:flex-none">讲师</TabsTrigger>
            </TabsList>
            <TabsContent value="course"><CoursesTab categories={categories} instructors={instructors} /></TabsContent>
            <TabsContent value="category"><CategoryTab reload={loadRefs} categories={categories} /></TabsContent>
            <TabsContent value="instructor"><InstructorTab reload={loadRefs} instructors={instructors} /></TabsContent>
          </Tabs>
        }
      />
    </section>
  );
};

export default HrTrainingCoursePage;
