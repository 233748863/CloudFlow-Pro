import React, { useCallback, useEffect, useState } from 'react';
import { RotateCcw, User } from 'lucide-react';
import { toast } from 'sonner';
import { Button, TableHead, TableHeader } from '@/components/common';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { FilterBar } from '@/components/layout';
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
  <div className="grid w-16 grid-cols-3 gap-px rounded border border-slate-200 p-0.5 dark:border-slate-700">
    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((cell) => (
      <div
        key={cell}
        className={`flex h-4 w-4 items-center justify-center text-[8px] ${
          currentCell === cell ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
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

  const filters = (
    <FilterBar
      search={{
        value: keyword,
        onChange: setKeyword,
        onSubmit: () => void handleSearch(),
        placeholder: '查询员工 ID（留空查看本人）',
        widthClassName: 'w-full sm:w-[240px]',
      }}
      actions={[
        ...(keyword
          ? [
              <Button key="reset" variant="outline" size="sm" onClick={() => { setKeyword(''); void loadMine(); }}>
                <RotateCcw className="mr-1.5 h-4 w-4" />查看本人
              </Button>,
            ]
          : []),
      ]}
    />
  );

  const profileCard = (
    <TableSurfaceCard>
      <div className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
            <User className="h-6 w-6 text-slate-500" />
          </div>
          <div className="flex-1">
            <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
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
  );

  const table = (
    <div className="space-y-4">
      {profileCard}
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
            <div className="px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
              历次盘点 · 共 {archive.reviews?.length ?? 0} 次
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <TableHeader>
                  <tr>
                    <TableHead>盘点</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>定位</TableHead>
                    <TableHead>分数</TableHead>
                    <TableHead>评语</TableHead>
                  </tr>
                </TableHeader>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(archive.reviews ?? []).length ? (archive.reviews ?? []).map((row: Record<string, unknown>) => (
                    <tr key={String(row.reviewId)}>
                      <td className="px-4 py-2">
                        <div className="text-sm font-medium">{String(row.reviewName ?? '-')}</div>
                        <div className="text-xs text-slate-400">{String(row.reviewYear ?? '')}</div>
                      </td>
                      <td className="px-4 py-2 text-sm">{enumLabel(reviewStatusLabel, row.status)}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <MiniGrid currentCell={Number(row.gridCell) || undefined} />
                          <span className="text-xs">[{String(row.gridCell ?? '-')}]</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        业绩 {String(row.performanceScore ?? '-')}<br />
                        潜力 {String(row.potentialScore ?? '-')}
                      </td>
                      <td className="px-4 py-2 max-w-[12rem] truncate text-xs">
                        {String(row.calibrationNotes ?? '-')}
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-sm text-slate-400">暂未参与盘点</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </TableSurfaceCard>

          <TableSurfaceCard>
            <div className="px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
              所在人才池 · 共 {archive.pools?.length ?? 0} 个
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px]">
                <TableHeader>
                  <tr>
                    <TableHead>池名</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>入池时间</TableHead>
                  </tr>
                </TableHeader>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(archive.pools ?? []).length ? (archive.pools ?? []).map((row: Record<string, unknown>, idx) => (
                    <tr key={`${row.poolId}-${idx}`}>
                      <td className="px-4 py-2 text-sm font-medium">{String(row.poolName ?? '-')}</td>
                      <td className="px-4 py-2 text-sm">{enumLabel(poolTypeLabel, row.poolType)}</td>
                      <td className="px-4 py-2 text-sm">{row.status === 'IN' ? '在池' : '已退出'}</td>
                      <td className="px-4 py-2 text-xs">{formatDateTimeValue(row.joinedAt)}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-sm text-slate-400">暂未进入任何池</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </TableSurfaceCard>

          <TableSurfaceCard>
            <div className="px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
              培养行动时间线 · 共 {archive.developmentActions?.length ?? 0} 项
            </div>
            <div className="px-4 pb-4">
              {(archive.developmentActions ?? []).length ? (
                <ol className="relative space-y-3 border-l border-slate-200 pl-4 dark:border-slate-700">
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
            <div className="px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
              继任提名 · 共 {archive.successorOf?.length ?? 0} 项
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px]">
                <TableHeader>
                  <tr>
                    <TableHead>计划</TableHead>
                    <TableHead>就绪度</TableHead>
                    <TableHead>排序</TableHead>
                    <TableHead>差距</TableHead>
                  </tr>
                </TableHeader>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(archive.successorOf ?? []).length ? (archive.successorOf ?? []).map((row: Record<string, unknown>, idx) => (
                    <tr key={`${row.id ?? idx}`}>
                      <td className="px-4 py-2 text-sm font-medium">{String(row.planName ?? '-')}</td>
                      <td className="px-4 py-2 text-sm">{enumLabel(readinessLabel, row.readiness)}</td>
                      <td className="px-4 py-2 text-sm">{String(row.rankOrder ?? '-')}</td>
                      <td className="px-4 py-2 max-w-[12rem] truncate text-xs">
                        {String(row.developmentGap ?? '-')}
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-sm text-slate-400">未被提名为继任人</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </TableSurfaceCard>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <TablePageLayout filters={filters} table={table} />
    </div>
  );
};

export default HrTalentArchivePage;
