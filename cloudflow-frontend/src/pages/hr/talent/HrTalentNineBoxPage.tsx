import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCcw, Send, User } from 'lucide-react';
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
import { FilterBar } from '@/components/layout';
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
import { enumLabel, normalizeRows } from '../hrShared';

const CELL_MAX_VISIBLE = 8;

interface CellMeta {
  cell: number;
  label: string;
  performance: string;
  potential: string;
  tone: string;
}

const CELLS: CellMeta[] = [
  { cell: 1, label: '明星员工', performance: '高', potential: '高', tone: 'bg-emerald-50 border-emerald-300' },
  { cell: 2, label: '核心员工', performance: '高', potential: '中', tone: 'bg-emerald-50 border-emerald-200' },
  { cell: 3, label: '技术骨干', performance: '高', potential: '低', tone: 'bg-emerald-50 border-emerald-100' },
  { cell: 4, label: '潜力新星', performance: '中', potential: '高', tone: 'bg-sky-50 border-sky-200' },
  { cell: 5, label: '合格员工', performance: '中', potential: '中', tone: 'bg-sky-50 border-sky-100' },
  { cell: 6, label: '稳定贡献者', performance: '中', potential: '低', tone: 'bg-amber-50 border-amber-200' },
  { cell: 7, label: '错位人才', performance: '低', potential: '高', tone: 'bg-amber-50 border-amber-200' },
  { cell: 8, label: '待提升', performance: '低', potential: '中', tone: 'bg-rose-50 border-rose-200' },
  { cell: 9, label: '末位', performance: '低', potential: '低', tone: 'bg-rose-100 border-rose-300' },
];

const statusLabel: Record<string, string> = {
  DRAFT: '草稿',
  IN_PROGRESS: '进行中',
  CALIBRATING: '校准中',
  PUBLISHED: '已发布',
  ARCHIVED: '已归档',
  REJECTED: '已驳回',
};

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
      className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs shadow-sm hover:border-sky-400"
      title="双击查看 / 编辑评语"
    >
      <User className="h-3 w-3 text-slate-400" />
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
        <div className="font-semibold text-slate-700">
          [{meta.cell}] {meta.label}
        </div>
        <div className="text-slate-500">业绩{meta.performance} · 潜力{meta.potential}</div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((p) => (
          <EmployeeChip key={p.employeeId} participant={p} editable={editable} onOpen={onOpenChip} />
        ))}
        {overflow > 0 ? (
          <button
            type="button"
            onClick={() => onShowAll(meta.cell)}
            className="rounded border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-500 hover:border-sky-400 hover:text-sky-600"
          >
            其余 {overflow} 人…
          </button>
        ) : null}
        {participants.length === 0 ? (
          <div className="text-xs text-slate-400">暂无人员</div>
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

  return (
    <div className="space-y-4">
      <FilterBar
        filters={[
          <div key="review" className="w-64">
            <Select value={reviewId ? String(reviewId) : ''} onValueChange={(v) => setReviewId(Number(v))}>
              <SelectTrigger>
                <SelectValue placeholder="选择盘点活动" />
              </SelectTrigger>
              <SelectContent>
                {reviews.map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    {r.reviewName} · {enumLabel(statusLabel, r.status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>,
        ]}
        stats={[{ label: '状态', value: currentReview ? `${enumLabel(statusLabel, currentReview.status)}${editable ? ' · 可编辑' : ' · 只读'}` : '-' }]}
        actions={[
          <Button key="refresh" variant="outline" size="sm" disabled={loading || !reviewId} onClick={() => void reload()}>
            <RefreshCcw className="mr-1.5 h-4 w-4" />刷新
          </Button>,
          <Button key="publish" size="sm" disabled={!editable} onClick={() => void handlePublish()}>
            <Send className="mr-1.5 h-4 w-4" />发起发布
          </Button>,
        ]}
      />

      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span>X 轴(横向):业绩 高 → 低</span>
        <span>Y 轴(纵向):潜力 高 → 低</span>
      </div>

      {!reviewId ? (
        <div className="rounded border border-dashed border-slate-300 bg-white py-16 text-center text-sm text-slate-400">
          请先选择盘点活动
        </div>
      ) : loading ? (
        <div className="rounded border border-dashed border-slate-300 bg-white py-16 text-center text-sm text-slate-400">
          加载中…
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="mb-1 grid grid-cols-3 gap-2 text-xs font-medium text-slate-500">
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
              <div className="rounded border border-sky-400 bg-white px-2 py-1 text-xs shadow-lg">
                #{activeId}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <BaseDialog
        open={!!editParticipant}
        title={`录入潜力评估 · 员工 #${editParticipant?.employeeId ?? ''}`}
        onClose={() => setEditParticipant(null)}
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
        <div className="space-y-3">
          <div className="rounded bg-slate-50 px-3 py-2 text-xs text-slate-500">
            业绩分 {editParticipant?.performanceScore ?? '-'} · 业绩带 {editParticipant?.performanceBand ?? '-'} ·
            当前格 {editParticipant?.gridCell ?? '-'}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>潜力分 (1-5)</Label>
              <Input
                type="number"
                min={1}
                max={5}
                value={editForm.potentialScore}
                onChange={(e) => setEditForm((p) => ({ ...p, potentialScore: e.target.value }))}
              />
            </div>
            <div>
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
          <div>
            <Label>校准纪要</Label>
            <Textarea
              value={editForm.calibrationNotes}
              onChange={(e) => setEditForm((p) => ({ ...p, calibrationNotes: e.target.value }))}
              rows={3}
            />
          </div>
          <div>
            <Label>培养建议</Label>
            <Textarea
              value={editForm.developActionSummary}
              onChange={(e) => setEditForm((p) => ({ ...p, developActionSummary: e.target.value }))}
              rows={3}
            />
          </div>
        </div>
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
                <span className="font-mono text-xs text-slate-500">#{p.employeeId}</span>
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
            <div className="py-8 text-center text-sm text-slate-400">该格暂无人员</div>
          ) : null}
        </div>
      </BaseDialog>
    </div>
  );
};

export default HrTalentNineBoxPage;
