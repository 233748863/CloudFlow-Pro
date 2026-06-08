import React, { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCcw } from 'lucide-react';
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
  TableHead,
  TableHeader,
  TableRowActions,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/common';
import { TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { FilterBar } from '@/components/layout';
import { BaseDialog } from '@/components/common/BaseDialog';
import { DictLabel } from '@/components/common/DictLabel';
import { useDict } from '@/hooks/useDict';
import { getExamPaperStatusLabel } from '@/utils/enumLabels';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  HrExamAttempt,
  HrExamPaper,
  HrExamPaperPayload,
  HrExamQuestionBank,
  HrExamQuestionBankPayload,
  listQuestions,
  createQuestion,
  deleteQuestion,
  listPapers,
  savePaper,
  deletePaper,
  startAttempt,
  listAttempts,
  listMyAttempts,
  getAttempt,
  submitAttempt,
  gradeAttempt,
} from '@/services/api/hr';
import { normalizeRows, formatDateTimeValue } from './hrShared';

const QuestionBankTab: React.FC = () => {
  const { getOptions: getQuestionTypeOptions } = useDict('hr_exam_question_type');
  const [rows, setRows] = useState<HrExamQuestionBank[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<HrExamQuestionBankPayload>({ questionType: 'SINGLE', content: '', score: 5 });
  const [deleteTarget, setDeleteTarget] = useState<HrExamQuestionBank | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await listQuestions({ pageSize: 200 });
      setRows(normalizeRows<HrExamQuestionBank>(res));
    } catch (error) { toast.error(getErrorMessage(error, '题库加载失败')); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    if (!form.content.trim()) { toast.error('请填写题干'); return; }
    try {
      await createQuestion(form);
      toast.success('已添加');
      setOpen(false);
      setForm({ questionType: 'SINGLE', content: '', score: 5 });
      await load();
    } catch (error) { toast.error(getErrorMessage(error, '保存失败')); }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try { await deleteQuestion(deleteTarget.id); toast.success('已删除'); setDeleteTarget(null); await load(); } catch (error) { toast.error(getErrorMessage(error, '删除失败')); }
  };

  return (
    <div className="space-y-4">
      <FilterBar
        stats={[{ label: '', value: `共 ${rows.length} 题` }]}
        actions={[
          <Button key="refresh" size="sm" variant="outline" onClick={() => void load()}><RefreshCcw className="mr-1.5 h-4 w-4" />刷新</Button>,
          <Button key="create" size="sm" onClick={() => setOpen(true)}><Plus className="mr-1.5 h-4 w-4" />新增题目</Button>,
        ]}
      />
      <TableSurfaceCard>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <TableHeader className="sticky top-0 z-10">
              <tr><TableHead>题型</TableHead><TableHead>题干</TableHead><TableHead>分值</TableHead><TableHead>难度</TableHead><TableHead className="text-right">操作</TableHead></tr>
            </TableHeader>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.length ? rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                  <td className="px-4 py-3 text-sm"><DictLabel dictType="hr_exam_question_type" value={row.questionType} fallback="-" /></td>
                  <td className="px-4 py-3 text-sm max-w-md truncate">{row.content}</td>
                  <td className="px-4 py-3 text-sm">{row.score ?? '-'}</td>
                  <td className="px-4 py-3 text-sm">{row.difficulty ?? '-'}</td>
                  <td className="px-4 py-3"><TableRowActions actions={[{ key: 'delete', semantic: 'delete', label: '删除', onClick: () => setDeleteTarget(row) }]} /></td>
                </tr>
              )) : (
                <tr><td colSpan={5} className="py-10 text-center text-sm text-slate-400">暂无题目</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </TableSurfaceCard>
      <BaseDialog open={open} title="新增题目" onClose={() => setOpen(false)} width="wide"
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>取消</Button><Button onClick={() => void handleSave()}>保存</Button></div>}>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>题型</Label>
              <Select value={form.questionType} onValueChange={(v) => setForm((p) => ({ ...p, questionType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {getQuestionTypeOptions().map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>分值</Label><Input type="number" value={form.score?.toString() || ''} onChange={(e) => setForm((p) => ({ ...p, score: e.target.value }))} /></div>
            <div><Label>难度 1-5</Label><Input type="number" min={1} max={5} value={form.difficulty || ''} onChange={(e) => setForm((p) => ({ ...p, difficulty: Number(e.target.value) }))} /></div>
          </div>
          <div><Label>题干</Label><Input value={form.content} onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))} /></div>
          <div><Label>答案（JSON 数组，例 ["A"] 或 ["A","B"]）</Label><Input value={form.answer ? JSON.stringify(form.answer) : ''} onChange={(e) => {
            try { setForm((p) => ({ ...p, answer: e.target.value ? JSON.parse(e.target.value) : undefined })); }
            catch { /* ignore */ }
          }} /></div>
          <div><Label>解析</Label><Input value={form.analysis ?? ''} onChange={(e) => setForm((p) => ({ ...p, analysis: e.target.value }))} /></div>
        </div>
      </BaseDialog>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除题目"
        message={deleteTarget ? `确认删除该题目?此操作不可撤销。` : ''}
        danger
        confirmText="确认删除"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleDeleteConfirm()}
      />
    </div>
  );
};

const PaperTab: React.FC = () => {
  const [rows, setRows] = useState<HrExamPaper[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<HrExamPaperPayload>({ paperName: '', totalScore: 100, passScore: 60, durationMinutes: 60, generateMode: 'MANUAL', questionIds: [] });
  const [deleteTarget, setDeleteTarget] = useState<HrExamPaper | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await listPapers({ pageSize: 200 });
      setRows(normalizeRows<HrExamPaper>(res));
    } catch (error) { toast.error(getErrorMessage(error, '试卷加载失败')); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    if (!form.paperName.trim()) { toast.error('请填写试卷名称'); return; }
    try { await savePaper(form); toast.success('已保存'); setOpen(false); await load(); } catch (error) { toast.error(getErrorMessage(error, '保存失败')); }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try { await deletePaper(deleteTarget.id); toast.success('已删除'); setDeleteTarget(null); await load(); } catch (error) { toast.error(getErrorMessage(error, '删除失败')); }
  };

  const handleStartAttempt = async (id: number) => {
    try {
      const res = await startAttempt(id);
      toast.success(`已开始作答（attempt #${(res as any).attemptId ?? ''}）`);
    } catch (error) { toast.error(getErrorMessage(error, '开始作答失败')); }
  };

  return (
    <div className="space-y-4">
      <FilterBar
        stats={[{ label: '', value: `共 ${rows.length} 套` }]}
        actions={[
          <Button key="refresh" size="sm" variant="outline" onClick={() => void load()}><RefreshCcw className="mr-1.5 h-4 w-4" />刷新</Button>,
          <Button key="create" size="sm" onClick={() => setOpen(true)}><Plus className="mr-1.5 h-4 w-4" />新建试卷</Button>,
        ]}
      />
      <TableSurfaceCard>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px]">
            <TableHeader className="sticky top-0 z-10">
              <tr><TableHead>名称</TableHead><TableHead>总分</TableHead><TableHead>及格</TableHead><TableHead>时长(分)</TableHead><TableHead>题数</TableHead><TableHead>组卷</TableHead><TableHead>状态</TableHead><TableHead className="text-right">操作</TableHead></tr>
            </TableHeader>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.length ? rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                  <td className="px-4 py-3 text-sm font-medium">{row.paperName}</td>
                  <td className="px-4 py-3 text-sm">{row.totalScore ?? '-'}</td>
                  <td className="px-4 py-3 text-sm">{row.passScore ?? '-'}</td>
                  <td className="px-4 py-3 text-sm">{row.durationMinutes ?? '-'}</td>
                  <td className="px-4 py-3 text-sm">{row.questionCount ?? (row.questionIds?.length ?? 0)}</td>
                  <td className="px-4 py-3 text-sm">{row.generateMode === 'RANDOM' ? '随机' : '手动'}</td>
                  <td className="px-4 py-3 text-sm">{getExamPaperStatusLabel(row.status)}</td>
                  <td className="px-4 py-3">
                    <TableRowActions
                      actions={[
                        { key: 'start', semantic: 'process', label: '开始作答', onClick: () => void handleStartAttempt(row.id) },
                        { key: 'delete', semantic: 'delete', label: '删除', onClick: () => setDeleteTarget(row) },
                      ]}
                    />
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={8} className="py-10 text-center text-sm text-slate-400">暂无试卷</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </TableSurfaceCard>
      <BaseDialog open={open} title="新建试卷" onClose={() => setOpen(false)} width="wide"
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>取消</Button><Button onClick={() => void handleSave()}>保存</Button></div>}>
        <div className="space-y-3">
          <div><Label>试卷名称</Label><Input value={form.paperName} onChange={(e) => setForm((p) => ({ ...p, paperName: e.target.value }))} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>总分</Label><Input type="number" value={form.totalScore?.toString() || ''} onChange={(e) => setForm((p) => ({ ...p, totalScore: e.target.value }))} /></div>
            <div><Label>及格分</Label><Input type="number" value={form.passScore?.toString() || ''} onChange={(e) => setForm((p) => ({ ...p, passScore: e.target.value }))} /></div>
            <div><Label>时长(分)</Label><Input type="number" value={form.durationMinutes || ''} onChange={(e) => setForm((p) => ({ ...p, durationMinutes: Number(e.target.value) }))} /></div>
          </div>
          <div>
            <Label>组卷方式</Label>
            <Select value={form.generateMode} onValueChange={(v) => setForm((p) => ({ ...p, generateMode: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MANUAL">手动</SelectItem>
                <SelectItem value="RANDOM">随机</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>题目 ID 列表（逗号分隔）</Label><Input value={(form.questionIds ?? []).join(',')} onChange={(e) => setForm((p) => ({ ...p, questionIds: e.target.value.split(',').map((s) => Number(s.trim())).filter(Boolean) }))} /></div>
        </div>
      </BaseDialog>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除试卷"
        message={deleteTarget ? `确认删除试卷「${deleteTarget.paperName}」?此操作不可撤销。` : ''}
        danger
        confirmText="确认删除"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleDeleteConfirm()}
      />
    </div>
  );
};

const AttemptTab: React.FC<{ mine: boolean }> = ({ mine }) => {
  const [rows, setRows] = useState<HrExamAttempt[]>([]);
  const [detail, setDetail] = useState<HrExamAttempt | null>(null);
  const [gradeScore, setGradeScore] = useState('');

  const load = useCallback(async () => {
    try {
      const fetcher = mine ? listMyAttempts : listAttempts;
      const res = await fetcher({ pageSize: 200 });
      setRows(normalizeRows<HrExamAttempt>(res));
    } catch (error) { toast.error(getErrorMessage(error, '答卷加载失败')); }
  }, [mine]);
  useEffect(() => { void load(); }, [load]);

  const handleView = async (id: number) => {
    try { const data = await getAttempt(id); setDetail(data); } catch (error) { toast.error(getErrorMessage(error, '加载失败')); }
  };

  const handleSubmit = async () => {
    if (!detail) return;
    try {
      await submitAttempt(detail.id, detail.answers ?? []);
      toast.success('已提交');
      setDetail(null);
      await load();
    } catch (error) { toast.error(getErrorMessage(error, '提交失败')); }
  };

  const handleGrade = async () => {
    if (!detail) return;
    try {
      await gradeAttempt(detail.id, { score: gradeScore });
      toast.success('已批改');
      setDetail(null);
      setGradeScore('');
      await load();
    } catch (error) { toast.error(getErrorMessage(error, '批改失败')); }
  };

  return (
    <div className="space-y-4">
      <FilterBar
        stats={[{ label: '', value: `共 ${rows.length} 份` }]}
        actions={[
          <Button key="refresh" size="sm" variant="outline" onClick={() => void load()}><RefreshCcw className="mr-1.5 h-4 w-4" />刷新</Button>,
        ]}
      />
      <TableSurfaceCard>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px]">
            <TableHeader className="sticky top-0 z-10">
              <tr><TableHead>试卷</TableHead><TableHead>开始</TableHead><TableHead>提交</TableHead><TableHead>分数</TableHead><TableHead>通过</TableHead><TableHead>状态</TableHead><TableHead className="text-right">操作</TableHead></tr>
            </TableHeader>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.length ? rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                  <td className="px-4 py-3 text-sm">{`#${row.paperId}`}</td>
                  <td className="px-4 py-3 text-xs">{formatDateTimeValue(row.startTime)}</td>
                  <td className="px-4 py-3 text-xs">{formatDateTimeValue(row.submitTime)}</td>
                  <td className="px-4 py-3 text-sm">{row.score ?? '-'}</td>
                  <td className="px-4 py-3 text-sm">{row.passFlag == null ? '-' : row.passFlag ? '是' : '否'}</td>
                  <td className="px-4 py-3 text-sm"><DictLabel dictType="hr_exam_attempt_status" value={row.status} fallback="-" /></td>
                  <td className="px-4 py-3"><TableRowActions actions={[{ key: 'view', semantic: 'view', label: '查看', onClick: () => void handleView(row.id) }]} /></td>
                </tr>
              )) : (
                <tr><td colSpan={7} className="py-10 text-center text-sm text-slate-400">暂无答卷</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </TableSurfaceCard>
      <BaseDialog open={!!detail} title={`答卷详情 #${detail?.id}`} onClose={() => setDetail(null)} width="wide"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDetail(null)}>关闭</Button>
            {detail?.status === 'IN_PROGRESS' ? <Button onClick={() => void handleSubmit()}>提交答卷</Button> : null}
            {detail?.status === 'SUBMITTED' && !mine ? (
              <>
                <Input className="w-24" placeholder="分数" value={gradeScore} onChange={(e) => setGradeScore(e.target.value)} />
                <Button onClick={() => void handleGrade()}>批改</Button>
              </>
            ) : null}
          </div>
        }>
        {detail ? (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">试卷</Label><div>{detail.paperId}</div></div>
              <div><Label className="text-xs">状态</Label><div><DictLabel dictType="hr_exam_attempt_status" value={detail.status} fallback="-" /></div></div>
              <div><Label className="text-xs">分数</Label><div>{detail.score ?? '-'}</div></div>
              <div><Label className="text-xs">通过</Label><div>{detail.passFlag == null ? '-' : detail.passFlag ? '是' : '否'}</div></div>
            </div>
            <div>
              <Label className="text-xs">答案 JSON</Label>
              <textarea className="cf-input w-full font-mono text-xs" rows={6} readOnly value={JSON.stringify(detail.answers ?? [], null, 2)} />
            </div>
          </div>
        ) : null}
      </BaseDialog>
    </div>
  );
};

export const HrTrainingExamPage: React.FC = () => (
  <div className="space-y-4">
    <Tabs defaultValue="papers" className="space-y-4">
      <TabsList className="w-full justify-start overflow-x-auto lg:w-auto">
        <TabsTrigger value="papers" className="flex-1 lg:flex-none">试卷管理</TabsTrigger>
        <TabsTrigger value="questions" className="flex-1 lg:flex-none">题库</TabsTrigger>
        <TabsTrigger value="mine" className="flex-1 lg:flex-none">我的作答</TabsTrigger>
        <TabsTrigger value="all" className="flex-1 lg:flex-none">全员作答</TabsTrigger>
      </TabsList>
      <TabsContent value="papers"><PaperTab /></TabsContent>
      <TabsContent value="questions"><QuestionBankTab /></TabsContent>
      <TabsContent value="mine"><AttemptTab mine /></TabsContent>
      <TabsContent value="all"><AttemptTab mine={false} /></TabsContent>
    </Tabs>
  </div>
);

export default HrTrainingExamPage;
