import React, { useCallback, useEffect, useState } from 'react';
import { Search, User } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/common';
import { TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  HrTalentArchive,
  getEmployeeTalentArchive,
  getMyTalentArchive,
} from '@/services/api/hr';
import { enumLabel, formatDateTimeValue, formatDateValue } from '../hrShared';

const reviewStatusLabel: Record<string, string> = {
  DRAFT: '草稿',
  IN_PROGRESS: '进行中',
  CALIBRATING: '校准中',
  PUBLISHED: '已发布',
  ARCHIVED: '已归档',
  REJECTED: '已驳回',
};

const actionTypeLabel: Record<string, string> = {
  TRAINING: '培训',
  MENTOR: '导师制',
  JOB_ROTATION: '岗位轮换',
  STRETCH_PROJECT: '挑战项目',
  EXTERNAL_COURSE: '外部课程',
};

const actionStatusLabel: Record<string, string> = {
  PLANNED: '已计划',
  ONGOING: '进行中',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
};

const readinessLabel: Record<string, string> = {
  READY_NOW: '即可顶岗',
  IN_1_2_YEARS: '1-2 年',
  IN_3_5_YEARS: '3-5 年',
};

const poolTypeLabel: Record<string, string> = {
  CORE: '核心',
  HIPO: '高潜',
  SUCCESSOR: '继任',
  CRITICAL_SKILL: '关键技能',
  EXTERNAL_BENCH: '外部储备',
};

interface MiniGridProps {
  currentCell?: number;
}

const MiniGrid: React.FC<MiniGridProps> = ({ currentCell }) => (
  <div className="grid w-16 grid-cols-3 gap-px rounded border border-slate-200 p-0.5">
    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((cell) => (
      <div
        key={cell}
        className={`flex h-4 w-4 items-center justify-center text-[8px] ${
          currentCell === cell ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'
        }`}
      >
        {cell}
      </div>
    ))}
  </div>
);

export const HrTalentArchivePage: React.FC = () => {
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [archive, setArchive] = useState<HrTalentArchive | null>(null);
  const [mode, setMode] = useState<'mine' | 'other'>('mine');

  const loadMine = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMyTalentArchive();
      setArchive(res);
      setMode('mine');
    } catch (error) {
      toast.error(getErrorMessage(error, '档案加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMine();
  }, [loadMine]);

  const handleSearch = async () => {
    if (!keyword.trim()) {
      void loadMine();
      return;
    }
    setLoading(true);
    try {
      const res = await getEmployeeTalentArchive(Number(keyword));
      setArchive(res);
      setMode('other');
    } catch (error) {
      toast.error(getErrorMessage(error, '档案加载失败'));
    } finally {
      setLoading(false);
    }
  };

  const employee = archive?.employee ?? {};
  const employeeId = (employee as { id?: number; employeeId?: number }).id
    ?? (employee as { employeeId?: number }).employeeId
    ?? '-';

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900 dark:text-slate-50">人才档案</div>
          <div className="mt-1 text-xs text-slate-500">
            纵览员工历次盘点定位 / 所在池 / 培养行动 / 继任提名
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-56">
            <Label className="text-xs text-slate-500">查询员工 ID</Label>
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="留空查看本人"
            />
          </div>
          <Button onClick={() => void handleSearch()} disabled={loading}>
            <Search className="mr-2 h-4 w-4" />查询
          </Button>
          <Button variant="outline" onClick={() => { setKeyword(''); void loadMine(); }}>
            查看本人
          </Button>
        </div>
      </div>

      <TableSurfaceCard>
        <div className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <User className="h-6 w-6 text-slate-500" />
            </div>
            <div className="flex-1">
              <div className="text-lg font-semibold text-slate-900">
                {(employee as { name?: string }).name || '-'}
                <span className="ml-2 text-sm font-normal text-slate-500">
                  #{employeeId} · {(employee as { employeeNo?: string }).employeeNo || '-'}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {(employee as { deptName?: string }).deptName || '-'} ·
                {' '}{(employee as { postName?: string }).postName || '-'}
                {' '}· {mode === 'mine' ? '当前为本人视图' : '查看他人档案'}
              </div>
            </div>
          </div>
        </div>
      </TableSurfaceCard>

      {loading ? (
        <TableSurfaceCard>
          <div className="py-10 text-center text-sm text-slate-400">加载中…</div>
        </TableSurfaceCard>
      ) : !archive ? (
        <TableSurfaceCard>
          <div className="py-10 text-center text-sm text-slate-400">暂无档案数据</div>
        </TableSurfaceCard>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TableSurfaceCard>
            <div className="px-4 py-3 text-sm font-semibold text-slate-800">
              历次盘点 · 共 {archive.reviews?.length ?? 0} 次
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>盘点</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>定位</TableHead>
                  <TableHead>分数</TableHead>
                  <TableHead>评语</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(archive.reviews ?? []).length ? (archive.reviews ?? []).map((row: Record<string, unknown>) => (
                  <TableRow key={String(row.reviewId)}>
                    <TableCell>
                      <div className="font-medium">{String(row.reviewName ?? '-')}</div>
                      <div className="text-xs text-slate-400">{String(row.reviewYear ?? '')}</div>
                    </TableCell>
                    <TableCell>{enumLabel(reviewStatusLabel, row.status)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <MiniGrid currentCell={Number(row.gridCell) || undefined} />
                        <span className="text-xs">[{String(row.gridCell ?? '-')}]</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      业绩 {String(row.performanceScore ?? '-')}<br />
                      潜力 {String(row.potentialScore ?? '-')}
                    </TableCell>
                    <TableCell className="max-w-[12rem] truncate text-xs">
                      {String(row.calibrationNotes ?? '-')}
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-sm text-slate-400">
                      暂未参与盘点
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableSurfaceCard>

          <TableSurfaceCard>
            <div className="px-4 py-3 text-sm font-semibold text-slate-800">
              所在人才池 · 共 {archive.pools?.length ?? 0} 个
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>池名</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>入池时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(archive.pools ?? []).length ? (archive.pools ?? []).map((row: Record<string, unknown>, idx) => (
                  <TableRow key={`${row.poolId}-${idx}`}>
                    <TableCell className="font-medium">{String(row.poolName ?? '-')}</TableCell>
                    <TableCell>{enumLabel(poolTypeLabel, row.poolType)}</TableCell>
                    <TableCell>{row.status === 'IN' ? '在池' : '已退出'}</TableCell>
                    <TableCell className="text-xs">{formatDateTimeValue(row.joinedAt)}</TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-sm text-slate-400">
                      暂未进入任何池
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableSurfaceCard>

          <TableSurfaceCard>
            <div className="px-4 py-3 text-sm font-semibold text-slate-800">
              培养行动时间线 · 共 {archive.developmentActions?.length ?? 0} 项
            </div>
            <div className="px-4 pb-4">
              {(archive.developmentActions ?? []).length ? (
                <ol className="relative space-y-3 border-l border-slate-200 pl-4">
                  {(archive.developmentActions ?? []).map((row: Record<string, unknown>, idx) => (
                    <li key={`${row.id ?? idx}`} className="relative">
                      <div className="absolute -left-[19px] mt-1 h-2 w-2 rounded-full bg-emerald-500" />
                      <div className="text-xs text-slate-400">
                        {formatDateValue(row.startDate)} ~ {formatDateValue(row.endDate)}
                      </div>
                      <div className="mt-0.5 text-sm font-medium">{String(row.actionName ?? '-')}</div>
                      <div className="text-xs text-slate-500">
                        {enumLabel(actionTypeLabel, row.actionType)} ·
                        {' '}{enumLabel(actionStatusLabel, row.status)}
                        {row.evaluationScore != null && row.evaluationScore !== ''
                          ? ` · 评分 ${row.evaluationScore as React.ReactNode}`
                          : ''}
                      </div>
                      {row.evaluationNotes ? (
                        <div className="mt-1 text-xs text-slate-500">{String(row.evaluationNotes)}</div>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="py-6 text-center text-sm text-slate-400">暂无培养行动</div>
              )}
            </div>
          </TableSurfaceCard>

          <TableSurfaceCard>
            <div className="px-4 py-3 text-sm font-semibold text-slate-800">
              继任提名 · 共 {archive.successorOf?.length ?? 0} 项
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>计划</TableHead>
                  <TableHead>就绪度</TableHead>
                  <TableHead>排序</TableHead>
                  <TableHead>差距</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(archive.successorOf ?? []).length ? (archive.successorOf ?? []).map((row: Record<string, unknown>, idx) => (
                  <TableRow key={`${row.id ?? idx}`}>
                    <TableCell className="font-medium">{String(row.planName ?? '-')}</TableCell>
                    <TableCell>{enumLabel(readinessLabel, row.readiness)}</TableCell>
                    <TableCell>{String(row.rankOrder ?? '-')}</TableCell>
                    <TableCell className="max-w-[12rem] truncate text-xs">
                      {String(row.developmentGap ?? '-')}
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-sm text-slate-400">
                      未被提名为继任人
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableSurfaceCard>
        </div>
      )}
    </div>
  );
};

export default HrTalentArchivePage;
