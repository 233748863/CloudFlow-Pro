import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Eye, FileQuestion, FileText, Play, Plus, RefreshCcw, Trash2 } from 'lucide-react';
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
  Textarea,
} from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { DictLabel } from '@/components/common/DictLabel';
import { TablePageLayout, InnerTableSurface } from '@/components/layout/TablePageLayout';
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
    <div className="admin-source-content-grid">
      <section className="card admin-users-toolbar">
        <div className="admin-users-filter-grid">
          <div className="admin-users-toolbar-actions">
            <span className="admin-users-filter-count">{`共 ${rows.length} 题`}</span>
            <Button size="sm" variant="outline" onClick={() => void load()}><RefreshCcw className="mr-1.5 h-4 w-4" />刷新</Button>
            <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1.5 h-4 w-4" />新增题目</Button>
          </div>
        </div>
      </section>
      <InnerTableSurface>
        <div className="admin-horizontal-scroll">
          <table className="unity-data-table admin-source-table min-w-[720px]">
            <thead>
              <tr><th>题型</th><th>题干</th><th>分值</th><th>难度</th><th className="text-right">操作</th></tr>
            </thead>
            <tbody>
              {rows.length ? rows.map((row) => (
                <tr key={row.id}>
                  <td><DictLabel dictType="hr_exam_question_type" value={row.questionType} fallback="-" /></td>
                  <td className="max-w-md truncate">{row.content}</td>
                  <td>{row.score ?? '-'}</td>
                  <td>{row.difficulty ?? '-'}</td>
                  <td>
                    <div className="admin-users-row-actions">
                      <button type="button" className="danger" title="删除" onClick={() => setDeleteTarget(row)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={5} className="admin-settings-empty">暂无题目</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </InnerTableSurface>
      <BaseDialog open={open} title="新增题目" onClose={() => setOpen(false)} width="wide" bodyClassName="admin-dialog-stack"
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>取消</Button><Button onClick={() => void handleSave()}>保存</Button></div>}>
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="admin-dialog-field">
              <Label>题型</Label>
              <Select value={form.questionType} onValueChange={(v) => setForm((p) => ({ ...p, questionType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {getQuestionTypeOptions().map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="admin-dialog-field"><Label>分值</Label><Input type="number" value={form.score?.toString() || ''} onChange={(e) => setForm((p) => ({ ...p, score: e.target.value }))} /></div>
            <div className="admin-dialog-field"><Label>难度 1-5</Label><Input type="number" min={1} max={5} value={form.difficulty || ''} onChange={(e) => setForm((p) => ({ ...p, difficulty: Number(e.target.value) }))} /></div>
          </div>
          <div className="admin-dialog-field"><Label>题干</Label><Input value={form.content} onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))} /></div>
          <div className="admin-dialog-field"><Label>答案（JSON 数组，例 ["A"] 或 ["A","B"]）</Label><Input value={form.answer ? JSON.stringify(form.answer) : ''} onChange={(e) => {
            try { setForm((p) => ({ ...p, answer: e.target.value ? JSON.parse(e.target.value) : undefined })); }
            catch { /* ignore */ }
          }} /></div>
          <div className="admin-dialog-field"><Label>解析</Label><Input value={form.analysis ?? ''} onChange={(e) => setForm((p) => ({ ...p, analysis: e.target.value }))} /></div>
        </>
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
    <div className="admin-source-content-grid">
      <section className="card admin-users-toolbar">
        <div className="admin-users-filter-grid">
          <div className="admin-users-toolbar-actions">
            <span className="admin-users-filter-count">{`共 ${rows.length} 套`}</span>
            <Button size="sm" variant="outline" onClick={() => void load()}><RefreshCcw className="mr-1.5 h-4 w-4" />刷新</Button>
            <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1.5 h-4 w-4" />新建试卷</Button>
          </div>
        </div>
      </section>
      <InnerTableSurface>
        <div className="admin-horizontal-scroll">
          <table className="unity-data-table admin-source-table min-w-[960px]">
            <thead>
              <tr><th>名称</th><th>总分</th><th>及格</th><th>时长(分)</th><th>题数</th><th>组卷</th><th>状态</th><th className="text-right">操作</th></tr>
            </thead>
            <tbody>
              {rows.length ? rows.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.paperName}</strong></td>
                  <td>{row.totalScore ?? '-'}</td>
                  <td>{row.passScore ?? '-'}</td>
                  <td>{row.durationMinutes ?? '-'}</td>
                  <td>{row.questionCount ?? (row.questionIds?.length ?? 0)}</td>
                  <td>{row.generateMode === 'RANDOM' ? '随机' : '手动'}</td>
                  <td>{getExamPaperStatusLabel(row.status)}</td>
                  <td>
                    <div className="admin-users-row-actions">
                      <button type="button" title="开始作答" onClick={() => void handleStartAttempt(row.id)}>
                        <Play size={15} />
                      </button>
                      <button type="button" className="danger" title="删除" onClick={() => setDeleteTarget(row)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={8} className="admin-settings-empty">暂无试卷</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </InnerTableSurface>
      <BaseDialog open={open} title="新建试卷" onClose={() => setOpen(false)} width="wide" bodyClassName="admin-dialog-stack"
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>取消</Button><Button onClick={() => void handleSave()}>保存</Button></div>}>
        <>
          <div className="admin-dialog-field"><Label>试卷名称</Label><Input value={form.paperName} onChange={(e) => setForm((p) => ({ ...p, paperName: e.target.value }))} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="admin-dialog-field"><Label>总分</Label><Input type="number" value={form.totalScore?.toString() || ''} onChange={(e) => setForm((p) => ({ ...p, totalScore: e.target.value }))} /></div>
            <div className="admin-dialog-field"><Label>及格分</Label><Input type="number" value={form.passScore?.toString() || ''} onChange={(e) => setForm((p) => ({ ...p, passScore: e.target.value }))} /></div>
            <div className="admin-dialog-field"><Label>时长(分)</Label><Input type="number" value={form.durationMinutes || ''} onChange={(e) => setForm((p) => ({ ...p, durationMinutes: Number(e.target.value) }))} /></div>
          </div>
          <div className="admin-dialog-field">
            <Label>组卷方式</Label>
            <Select value={form.generateMode} onValueChange={(v) => setForm((p) => ({ ...p, generateMode: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MANUAL">手动</SelectItem>
                <SelectItem value="RANDOM">随机</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="admin-dialog-field"><Label>题目 ID 列表（逗号分隔）</Label><Input value={(form.questionIds ?? []).join(',')} onChange={(e) => setForm((p) => ({ ...p, questionIds: e.target.value.split(',').map((s) => Number(s.trim())).filter(Boolean) }))} /></div>
        </>
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
    <div className="admin-source-content-grid">
      <section className="card admin-users-toolbar">
        <div className="admin-users-filter-grid">
          <div className="admin-users-toolbar-actions">
            <span className="admin-users-filter-count">{`共 ${rows.length} 份`}</span>
            <Button size="sm" variant="outline" onClick={() => void load()}><RefreshCcw className="mr-1.5 h-4 w-4" />刷新</Button>
          </div>
        </div>
      </section>
      <InnerTableSurface>
        <div className="admin-horizontal-scroll">
          <table className="unity-data-table admin-source-table min-w-[840px]">
            <thead>
              <tr><th>试卷</th><th>开始</th><th>提交</th><th>分数</th><th>通过</th><th>状态</th><th className="text-right">操作</th></tr>
            </thead>
            <tbody>
              {rows.length ? rows.map((row) => (
                <tr key={row.id}>
                  <td>{`#${row.paperId}`}</td>
                  <td>{formatDateTimeValue(row.startTime)}</td>
                  <td>{formatDateTimeValue(row.submitTime)}</td>
                  <td>{row.score ?? '-'}</td>
                  <td>{row.passFlag == null ? '-' : row.passFlag ? '是' : '否'}</td>
                  <td><DictLabel dictType="hr_exam_attempt_status" value={row.status} fallback="-" /></td>
                  <td>
                    <div className="admin-users-row-actions">
                      <button type="button" title="查看" onClick={() => void handleView(row.id)}>
                        <Eye size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={7} className="admin-settings-empty">暂无答卷</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </InnerTableSurface>
      <BaseDialog open={!!detail} title={`答卷详情 #${detail?.id}`} onClose={() => setDetail(null)} width="wide" bodyClassName="admin-dialog-stack"
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
          <div className="admin-dialog-stack text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="admin-dialog-field"><Label className="text-xs">试卷</Label><div>{detail.paperId}</div></div>
              <div className="admin-dialog-field"><Label className="text-xs">状态</Label><div><DictLabel dictType="hr_exam_attempt_status" value={detail.status} fallback="-" /></div></div>
              <div className="admin-dialog-field"><Label className="text-xs">分数</Label><div>{detail.score ?? '-'}</div></div>
              <div className="admin-dialog-field"><Label className="text-xs">通过</Label><div>{detail.passFlag == null ? '-' : detail.passFlag ? '是' : '否'}</div></div>
            </div>
            <div className="admin-dialog-field">
              <Label className="text-xs">答案 JSON</Label>
              <Textarea className="font-mono text-xs" rows={6} readOnly value={JSON.stringify(detail.answers ?? [], null, 2)} />
            </div>
          </div>
        ) : null}
      </BaseDialog>
    </div>
  );
};

export const HrTrainingExamPage: React.FC = () => (
  <section className="admin-source-page">
    <TablePageLayout
      actions={
        <>
          <header className="admin-source-header">
            <div>
              <p className="admin-source-kicker">TRAINING EXAMS</p>
              <h2>培训考试</h2>
              <span>维护题库、试卷和全员作答批改记录</span>
            </div>
          </header>
          <section className="admin-source-stat-grid">
            <article className="card admin-source-stat admin-source-tone-blue">
              <div className="admin-source-stat-icon"><FileText size={18} /></div>
              <div><p>试卷管理</p><strong>试卷</strong><span>组卷和开始作答</span></div>
            </article>
            <article className="card admin-source-stat admin-source-tone-green">
              <div className="admin-source-stat-icon"><FileQuestion size={18} /></div>
              <div><p>题库</p><strong>题目</strong><span>题型、分值和解析</span></div>
            </article>
            <article className="card admin-source-stat admin-source-tone-violet">
              <div className="admin-source-stat-icon"><ClipboardList size={18} /></div>
              <div><p>答卷</p><strong>批改</strong><span>个人和全员记录</span></div>
            </article>
          </section>
        </>
      }
      table={
        <Tabs defaultValue="papers" className="admin-source-content-grid">
          <TabsList className="admin-source-tabs w-full justify-start overflow-x-auto lg:w-auto">
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
      }
    />
  </section>
);

export default HrTrainingExamPage;
