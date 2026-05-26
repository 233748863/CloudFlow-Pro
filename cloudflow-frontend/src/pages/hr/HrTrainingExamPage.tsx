import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { normalizeRows, formatDateTimeValue, enumLabel } from './hrShared';

const questionTypeLabel: Record<string, string> = {
  SINGLE: '单选',
  MULTI: '多选',
  JUDGE: '判断',
  FILL: '填空',
  ESSAY: '问答',
};

const attemptStatusLabel: Record<string, string> = {
  IN_PROGRESS: '答题中',
  SUBMITTED: '已提交',
  GRADED: '已批改',
};

const QuestionBankTab: React.FC = () => {
  const [rows, setRows] = useState<HrExamQuestionBank[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<HrExamQuestionBankPayload>({ questionType: 'SINGLE', content: '', score: 5 });

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

  const handleDelete = async (id: number) => {
    try { await deleteQuestion(id); await load(); } catch (error) { toast.error(getErrorMessage(error, '删除失败')); }
  };

  return (
    <>
      <div className="mb-3 flex justify-end gap-2">
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1 h-3 w-3" />新增题目</Button>
        <Button size="sm" variant="outline" onClick={() => void load()}><RefreshCcw className="mr-1 h-3 w-3" />刷新</Button>
      </div>
      <TableSurfaceCard>
        <Table>
          <TableHeader>
            <TableRow><TableHead>题型</TableHead><TableHead>题干</TableHead><TableHead>分值</TableHead><TableHead>难度</TableHead><TableHead>操作</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{enumLabel(questionTypeLabel, row.questionType)}</TableCell>
                <TableCell className="max-w-md truncate">{row.content}</TableCell>
                <TableCell>{row.score ?? '-'}</TableCell>
                <TableCell>{row.difficulty ?? '-'}</TableCell>
                <TableCell><Button size="sm" variant="ghost" onClick={() => void handleDelete(row.id)}><Trash2 className="h-3 w-3" /></Button></TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-slate-400">暂无题目</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
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
                  {Object.entries(questionTypeLabel).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
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
    </>
  );
};

const PaperTab: React.FC = () => {
  const [rows, setRows] = useState<HrExamPaper[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<HrExamPaperPayload>({ paperName: '', totalScore: 100, passScore: 60, durationMinutes: 60, generateMode: 'MANUAL', questionIds: [] });

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

  const handleDelete = async (id: number) => {
    try { await deletePaper(id); await load(); } catch (error) { toast.error(getErrorMessage(error, '删除失败')); }
  };

  const handleStartAttempt = async (id: number) => {
    try {
      const res = await startAttempt(id);
      toast.success(`已开始作答（attempt #${(res as any).attemptId ?? ''}）`);
    } catch (error) { toast.error(getErrorMessage(error, '开始作答失败')); }
  };

  return (
    <>
      <div className="mb-3 flex justify-end gap-2">
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1 h-3 w-3" />新建试卷</Button>
        <Button size="sm" variant="outline" onClick={() => void load()}><RefreshCcw className="mr-1 h-3 w-3" />刷新</Button>
      </div>
      <TableSurfaceCard>
        <Table>
          <TableHeader>
            <TableRow><TableHead>名称</TableHead><TableHead>总分</TableHead><TableHead>及格</TableHead><TableHead>时长(分)</TableHead><TableHead>题数</TableHead><TableHead>组卷</TableHead><TableHead>状态</TableHead><TableHead>操作</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.paperName}</TableCell>
                <TableCell>{row.totalScore ?? '-'}</TableCell>
                <TableCell>{row.passScore ?? '-'}</TableCell>
                <TableCell>{row.durationMinutes ?? '-'}</TableCell>
                <TableCell>{row.questionCount ?? (row.questionIds?.length ?? 0)}</TableCell>
                <TableCell>{row.generateMode === 'RANDOM' ? '随机' : '手动'}</TableCell>
                <TableCell>{getExamPaperStatusLabel(row.status)}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => void handleStartAttempt(row.id)}>开始作答</Button>
                    <Button size="sm" variant="ghost" onClick={() => void handleDelete(row.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-slate-400">暂无试卷</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
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
    </>
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
    <>
      <div className="mb-3 flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => void load()}><RefreshCcw className="mr-1 h-3 w-3" />刷新</Button>
      </div>
      <TableSurfaceCard>
        <Table>
          <TableHeader>
            <TableRow><TableHead>试卷</TableHead><TableHead>开始</TableHead><TableHead>提交</TableHead><TableHead>分数</TableHead><TableHead>通过</TableHead><TableHead>状态</TableHead><TableHead>操作</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{`#${row.paperId}`}</TableCell>
                <TableCell>{formatDateTimeValue(row.startTime)}</TableCell>
                <TableCell>{formatDateTimeValue(row.submitTime)}</TableCell>
                <TableCell>{row.score ?? '-'}</TableCell>
                <TableCell>{row.passFlag == null ? '-' : row.passFlag ? '是' : '否'}</TableCell>
                <TableCell>{enumLabel(attemptStatusLabel, row.status)}</TableCell>
                <TableCell><Button size="sm" variant="ghost" onClick={() => void handleView(row.id)}>查看</Button></TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-slate-400">暂无答卷</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
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
              <div><Label className="text-xs">状态</Label><div>{enumLabel(attemptStatusLabel, detail.status)}</div></div>
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
    </>
  );
};

export const HrTrainingExamPage: React.FC = () => (
  <div className="p-6">
    <div className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-50">在线考试</div>
    <Tabs defaultValue="papers">
      <TabsList>
        <TabsTrigger value="papers">试卷管理</TabsTrigger>
        <TabsTrigger value="questions">题库</TabsTrigger>
        <TabsTrigger value="mine">我的作答</TabsTrigger>
        <TabsTrigger value="all">全员作答</TabsTrigger>
      </TabsList>
      <TabsContent value="papers"><PaperTab /></TabsContent>
      <TabsContent value="questions"><QuestionBankTab /></TabsContent>
      <TabsContent value="mine"><AttemptTab mine /></TabsContent>
      <TabsContent value="all"><AttemptTab mine={false} /></TabsContent>
    </Tabs>
  </div>
);

export default HrTrainingExamPage;
