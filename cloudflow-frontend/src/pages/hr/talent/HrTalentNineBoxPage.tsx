import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Grid3x3, RefreshCcw, Send, User, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { TablePageLayout, InnerTableSurface } from '@/components/layout/TablePageLayout';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  HrTalentNineBoxGrid,
  HrTalentReview,
  HrTalentReviewParticipant,
  listTalentReviews,
  loadNineBox,
  moveReviewParticipantCell,
  publishTalentReview,
  upsertReviewParticipant,
} from '@/services/api/hr';
import { normalizeRows } from '../hrShared';
import { useDict } from '@/hooks/useDict';

const CELL_MAX_VISIBLE = 8;

interface CellMeta {
  cell: number;
  label: string;
  performance: string;
  potential: string;
  tone: string;
}

const CELLS: CellMeta[] = [
  { cell: 1, label: '明星员工', performance: '高', potential: '高', tone: 'bg-emerald-50 border-emerald-300 dark:bg-emerald-950/25 dark:border-emerald-800' },
  { cell: 2, label: '核心员工', performance: '高', potential: '中', tone: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900' },
  { cell: 3, label: '技术骨干', performance: '高', potential: '低', tone: 'bg-emerald-50 border-emerald-100 dark:bg-emerald-950/15 dark:border-emerald-950' },
  { cell: 4, label: '潜力新星', performance: '中', potential: '高', tone: 'bg-sky-50 border-sky-200 dark:bg-sky-950/20 dark:border-sky-900' },
  { cell: 5, label: '合格员工', performance: '中', potential: '中', tone: 'bg-sky-50 border-sky-100 dark:bg-sky-950/15 dark:border-sky-950' },
  { cell: 6, label: '稳定贡献者', performance: '中', potential: '低', tone: 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900' },
  { cell: 7, label: '错位人才', performance: '低', potential: '高', tone: 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900' },
  { cell: 8, label: '待提升', performance: '低', potential: '中', tone: 'bg-rose-50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900' },
  { cell: 9, label: '末位', performance: '低', potential: '低', tone: 'bg-rose-100 border-rose-300 dark:bg-rose-950/25 dark:border-rose-800' },
];

interface EmployeeChipProps {
  participant: HrTalentReviewParticipant;
  editable: boolean;
  onOpen: (p: HrTalentReviewParticipant) => void;
}

const EmployeeChip: React.FC<EmployeeChipProps> = ({ participant, editable, onOpen }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: participant.employeeId,
    disabled: !editable,
  });
  const style: React.CSSProperties = {
    opacity: isDragging ? 0.3 : 1,
    cursor: editable ? 'grab' : 'default',
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(editable ? listeners : {})}
      {...attributes}
      onDoubleClick={() => onOpen(participant)}
      className="flex items-center gap-1 rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-2 py-1 text-xs dark:border-slate-800 dark:bg-slate-950"
      data-tooltip="双击查看 / 编辑评语"
    >
      <User className="h-3 w-3 text-cf-faint" />
      <span className="font-mono">#{participant.employeeId}</span>
      {participant.potentialScore != null ? (
        <span className="text-emerald-600">P{participant.potentialScore}</span>
      ) : null}
    </div>
  );
};

interface NineBoxCellProps {
  meta: CellMeta;
  participants: HrTalentReviewParticipant[];
  editable: boolean;
  onOpenChip: (p: HrTalentReviewParticipant) => void;
  onShowAll: (cell: number) => void;
}

const NineBoxCell: React.FC<NineBoxCellProps> = ({ meta, participants, editable, onOpenChip, onShowAll }) => {
  const { setNodeRef, isOver } = useDroppable({ id: meta.cell, disabled: !editable });
  const visible = participants.slice(0, CELL_MAX_VISIBLE);
  const overflow = participants.length - visible.length;
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[180px] flex-col gap-2 rounded border-2 p-3 transition ${meta.tone} ${
        isOver ? 'ring-2 ring-sky-400' : ''
      }`}
    >
      <div className="flex items-center justify-between text-xs">
        <div className="font-semibold text-cf-body">
          [{meta.cell}] {meta.label}
        </div>
        <div className="text-cf-subtle">业绩{meta.performance} · 潜力{meta.potential}</div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((p) => (
          <EmployeeChip key={p.employeeId} participant={p} editable={editable} onOpen={onOpenChip} />
        ))}
        {overflow > 0 ? (
          <button
            type="button"
            onClick={() => onShowAll(meta.cell)}
            className="rounded border border-dashed border-slate-300 px-2 py-1 text-xs text-cf-subtle hover:border-sky-400 hover:text-sky-600"
          >
            其余 {overflow} 人…
          </button>
        ) : null}
        {participants.length === 0 ? (
          <div className="text-xs text-cf-faint">暂无人员</div>
        ) : null}
      </div>
    </div>
  );
};

export const HrTalentNineBoxPage: React.FC = () => {
  const [reviews, setReviews] = useState<HrTalentReview[]>([]);
  const [reviewId, setReviewId] = useState<number | null>(null);
  const [grid, setGrid] = useState<HrTalentNineBoxGrid>({});
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [editParticipant, setEditParticipant] = useState<HrTalentReviewParticipant | null>(null);
  const [editForm, setEditForm] = useState({
    potentialScore: '',
    potentialBand: 'MEDIUM',
    calibrationNotes: '',
    developActionSummary: '',
  });
  const [cellListOpen, setCellListOpen] = useState<number | null>(null);
  const { getLabel: statusLabel } = useDict('hr_talent_review_status');

  const sensors = useSensors(useSensor(PointerSensor), useSensor(TouchSensor), useSensor(KeyboardSensor));

  const currentReview = useMemo(
    () => reviews.find((r) => r.id === reviewId) || null,
    [reviews, reviewId],
  );
  const editable = currentReview ? !['PUBLISHED', 'ARCHIVED'].includes(String(currentReview.status)) : false;

  const lookup = useCallback(
    (id: number): HrTalentReviewParticipant | undefined => {
      for (const cell of Object.keys(grid)) {
        const list = grid[Number(cell)] || [];
        const hit = list.find((p) => p.employeeId === id);
        if (hit) return hit;
      }
      return undefined;
    },
    [grid],
  );

  useEffect(() => {
    void (async () => {
      try {
        const res = await listTalentReviews({ pageSize: 200 });
        const list = normalizeRows<HrTalentReview>(res);
        setReviews(list);
        if (list.length) setReviewId(list[0].id);
      } catch (error) {
        toast.error(getErrorMessage(error, '盘点活动加载失败'));
      }
    })();
  }, []);

  const reload = useCallback(async () => {
    if (!reviewId) return;
    setLoading(true);
    try {
      const res = await loadNineBox(reviewId);
      setGrid((res ?? {}) as HrTalentNineBoxGrid);
    } catch (error) {
      toast.error(getErrorMessage(error, '九宫格加载失败'));
    } finally {
      setLoading(false);
    }
  }, [reviewId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onDragStart = (event: DragStartEvent) => setActiveId(Number(event.active.id));
  const onDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const employeeId = Number(event.active.id);
    const target = event.over?.id == null ? null : Number(event.over.id);
    if (!reviewId || !target) return;
    const participant = lookup(employeeId);
    if (!participant || participant.gridCell === target) return;
    try {
      await moveReviewParticipantCell(reviewId, employeeId, target);
      toast.success('已移动到新格');
      await reload();
    } catch (error) {
      toast.error(getErrorMessage(error, '移动失败'));
    }
  };

  const openChip = (p: HrTalentReviewParticipant) => {
    setEditParticipant(p);
    setEditForm({
      potentialScore: p.potentialScore != null ? String(p.potentialScore) : '',
      potentialBand: p.potentialBand || 'MEDIUM',
      calibrationNotes: p.calibrationNotes || '',
      developActionSummary: p.developActionSummary || '',
    });
  };

  const handleSavePotential = async () => {
    if (!reviewId || !editParticipant) return;
    try {
      await upsertReviewParticipant(reviewId, editParticipant.employeeId, {
        potentialScore: editForm.potentialScore ? Number(editForm.potentialScore) : undefined,
        potentialBand: editForm.potentialBand,
        calibrationNotes: editForm.calibrationNotes,
        developActionSummary: editForm.developActionSummary,
      });
      toast.success('已保存');
      setEditParticipant(null);
      await reload();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const handlePublish = async () => {
    if (!reviewId || !currentReview) return;
    if (!['DRAFT', 'IN_PROGRESS', 'CALIBRATING'].includes(String(currentReview.status))) {
      toast.error('当前状态不可发布');
      return;
    }
    try {
      await publishTalentReview(reviewId);
      toast.success('已发起发布审批');
      const res = await listTalentReviews({ pageSize: 200 });
      setReviews(normalizeRows<HrTalentReview>(res));
    } catch (error) {
      toast.error(getErrorMessage(error, '发起失败'));
    }
  };

  const cellListParticipants = cellListOpen ? grid[cellListOpen] || [] : [];
  const participantTotal = Object.values(grid).reduce((sum, list) => sum + (list?.length ?? 0), 0);

  return (
    <>
      <section className="admin-source-page">
        <TablePageLayout
          actions={
            <>
              <header className="admin-source-header">
                <div>
                  <p className="admin-source-kicker">NINE BOX CALIBRATION</p>
                  <h2>九宫格校准</h2>
                  <span>按人才盘点活动拖拽校准员工格位、录入潜力评估和发布审批</span>
                </div>
                <div className="admin-source-controls">
                  <Button variant="outline" size="sm" disabled={loading || !reviewId} onClick={() => void reload()}>
                    <RefreshCcw className={loading ? 'mr-1.5 h-4 w-4 animate-spin' : 'mr-1.5 h-4 w-4'} />刷新
                  </Button>
                  <Button size="sm" disabled={!editable} onClick={() => void handlePublish()}>
                    <Send className="mr-1.5 h-4 w-4" />发起发布
                  </Button>
                </div>
              </header>
              <section className="admin-source-stat-grid">
                <article className="card admin-source-stat admin-source-tone-blue">
                  <div className="admin-source-stat-icon"><Grid3x3 size={18} /></div>
                  <div><p>格位数量</p><strong>9</strong><span>三维九宫格</span></div>
                </article>
                <article className="card admin-source-stat admin-source-tone-green">
                  <div className="admin-source-stat-icon"><Users size={18} /></div>
                  <div><p>参与人数</p><strong>{participantTotal}</strong><span>当前盘点活动</span></div>
                </article>
                <article className="card admin-source-stat admin-source-tone-amber">
                  <div className="admin-source-stat-icon"><Send size={18} /></div>
                  <div><p>当前状态</p><strong>{currentReview ? statusLabel(String(currentReview.status ?? '')) : '-'}</strong><span>{editable ? '可编辑' : '只读'}</span></div>
                </article>
              </section>
            </>
          }
          filters={
            <section className="card admin-users-toolbar">
              <div className="admin-users-filter-grid">
                <label>
                  <span className="input-label">盘点活动</span>
                  <Select value={reviewId ? String(reviewId) : ''} onValueChange={(v) => setReviewId(Number(v))}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择盘点活动" />
                    </SelectTrigger>
                    <SelectContent>
                      {reviews.map((r) => (
                        <SelectItem key={r.id} value={String(r.id)}>
                          {r.reviewName} · {statusLabel(String(r.status ?? ''))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              </div>
              <div className="admin-users-toolbar-actions">
                <span className="admin-users-filter-count">当前 {participantTotal} 人 · {editable ? '可拖拽校准' : '只读查看'}</span>
              </div>
            </section>
          }
          table={
            <InnerTableSurface className="flex min-h-0 flex-1 flex-col">
              <div className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] p-4 dark:border-slate-800 dark:bg-slate-950">
                <div className="mb-3 flex items-center gap-4 text-xs text-cf-subtle">
                  <span>X 轴(横向):业绩 高 → 低</span>
                  <span>Y 轴(纵向):潜力 高 → 低</span>
                </div>
        
                {!reviewId ? (
                  <div className="admin-settings-empty">
                    请先选择盘点活动
                  </div>
                ) : loading ? (
                  <div className="admin-settings-empty">
                    加载中…
                  </div>
                ) : (
                  <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
                    <div className="mb-1 grid grid-cols-3 gap-2 text-xs font-medium text-cf-subtle">
                      <div className="text-center">潜力高</div>
                      <div className="text-center">潜力中</div>
                      <div className="text-center">潜力低</div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {CELLS.map((meta) => (
                        <NineBoxCell
                          key={meta.cell}
                          meta={meta}
                          participants={grid[meta.cell] || []}
                          editable={editable}
                          onOpenChip={openChip}
                          onShowAll={(cell) => setCellListOpen(cell)}
                        />
                      ))}
                    </div>
                    <DragOverlay>
                      {activeId != null && lookup(activeId) ? (
                        <div className="rounded border border-sky-400 bg-[var(--cf-surface-strong)] px-2 py-1 text-xs shadow-none">
                          #{activeId}
                        </div>
                      ) : null}
                    </DragOverlay>
                  </DndContext>
                )}
              </div>
            </InnerTableSurface>
          }
        />
      </section>

      <BaseDialog
        open={!!editParticipant}
        title={`录入潜力评估 · 员工 #${editParticipant?.employeeId ?? ''}`}
        onClose={() => setEditParticipant(null)}
        bodyClassName="admin-dialog-stack"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditParticipant(null)}>
              取消
            </Button>
            <Button onClick={() => void handleSavePotential()} disabled={!editable}>
              保存
            </Button>
          </div>
        }
      >
        <>
          <div className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-3 py-2 text-xs text-cf-subtle dark:border-slate-800 dark:bg-slate-950">
            业绩分 {editParticipant?.performanceScore ?? '-'} · 业绩带 {editParticipant?.performanceBand ?? '-'} ·
            当前格 {editParticipant?.gridCell ?? '-'}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="admin-dialog-field">
              <Label>潜力分 (1-5)</Label>
              <Input
                type="number"
                min={1}
                max={5}
                value={editForm.potentialScore}
                onChange={(e) => setEditForm((p) => ({ ...p, potentialScore: e.target.value }))}
              />
            </div>
            <div className="admin-dialog-field">
              <Label>潜力带</Label>
              <Select
                value={editForm.potentialBand}
                onValueChange={(v) => setEditForm((p) => ({ ...p, potentialBand: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HIGH">高</SelectItem>
                  <SelectItem value="MEDIUM">中</SelectItem>
                  <SelectItem value="LOW">低</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="admin-dialog-field">
            <Label>校准纪要</Label>
            <Textarea
              value={editForm.calibrationNotes}
              onChange={(e) => setEditForm((p) => ({ ...p, calibrationNotes: e.target.value }))}
              rows={3}
            />
          </div>
          <div className="admin-dialog-field">
            <Label>培养建议</Label>
            <Textarea
              value={editForm.developActionSummary}
              onChange={(e) => setEditForm((p) => ({ ...p, developActionSummary: e.target.value }))}
              rows={3}
            />
          </div>
        </>
      </BaseDialog>

      <BaseDialog
        open={cellListOpen !== null}
        title={`格 [${cellListOpen ?? ''}] 全部人员 · 共 ${cellListParticipants.length} 人`}
        onClose={() => setCellListOpen(null)}
        footer={
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setCellListOpen(null)}>
              关闭
            </Button>
          </div>
        }
      >
        <div className="max-h-[60vh] space-y-1 overflow-auto">
          {cellListParticipants.map((p) => (
            <div
              key={p.employeeId}
              className="flex items-center justify-between rounded border border-slate-200 px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-cf-subtle">#{p.employeeId}</span>
                <span>业绩 {p.performanceScore ?? '-'} / 潜力 {p.potentialScore ?? '-'}</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCellListOpen(null);
                  openChip(p);
                }}
              >
                编辑
              </Button>
            </div>
          ))}
          {cellListParticipants.length === 0 ? (
            <div className="py-6 text-center text-sm text-cf-faint">该格暂无人员</div>
          ) : null}
        </div>
      </BaseDialog>
    </>
  );
};

export default HrTalentNineBoxPage;
