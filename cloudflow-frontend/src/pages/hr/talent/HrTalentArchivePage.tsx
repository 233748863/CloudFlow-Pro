import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Grid3x3, RefreshCcw, RotateCcw, Search, Sparkles, TrendingUp, User } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input } from '@/components/common';
import { TablePageLayout, InnerTableSurface } from '@/components/layout/TablePageLayout';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  HrTalentArchive,
  getEmployeeTalentArchive,
  getMyTalentArchive,
} from '@/services/api/hr';
import { formatDateTimeValue, formatDateValue } from '../hrShared';
import { DictLabel } from '@/components/common/DictLabel';

interface MiniGridProps {
  currentCell?: number;
}

const MiniGrid: React.FC<MiniGridProps> = ({ currentCell }) => (
  <div className="grid w-16 grid-cols-3 gap-px rounded border border-slate-200 p-0.5 dark:border-slate-700">
    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((cell) => (
      <div
        key={cell}
        className={`flex h-4 w-4 items-center justify-center text-[8px] ${
          currentCell === cell ? 'bg-emerald-500 text-white' : 'bg-[var(--cf-surface-muted)] text-slate-400 dark:bg-slate-800'
        }`}
      >
        {cell}
      </div>
    ))}
  </div>
);

const asText = (value: unknown, fallback = '-') => {
  if (value == null || value === '') return fallback;
  return String(value);
};

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
    <section className="admin-source-page">
      <TablePageLayout
        actions={
          <>
            <header className="admin-source-header">
              <div>
                <p className="admin-source-kicker">TALENT ARCHIVE</p>
                <h2>人才档案</h2>
                <span>查看员工盘点定位、人才池、培养行动和继任提名</span>
              </div>
              <div className="admin-source-controls">
                <Button variant="outline" size="sm" onClick={() => void loadMine()} disabled={loading}>
                  <RefreshCcw className={loading ? 'mr-1.5 h-4 w-4 animate-spin' : 'mr-1.5 h-4 w-4'} />刷新本人档案
                </Button>
              </div>
            </header>
            <section className="admin-source-stat-grid">
              <article className="card admin-source-stat admin-source-tone-blue">
                <div className="admin-source-stat-icon"><ClipboardList size={18} /></div>
                <div><p>盘点次数</p><strong>{archive?.reviews?.length ?? 0}</strong><span>{mode === 'mine' ? '本人视图' : '他人档案'}</span></div>
              </article>
              <article className="card admin-source-stat admin-source-tone-green">
                <div className="admin-source-stat-icon"><Sparkles size={18} /></div>
                <div><p>人才池</p><strong>{archive?.pools?.length ?? 0}</strong><span>当前关联池</span></div>
              </article>
              <article className="card admin-source-stat admin-source-tone-amber">
                <div className="admin-source-stat-icon"><Grid3x3 size={18} /></div>
                <div><p>培养行动</p><strong>{archive?.developmentActions?.length ?? 0}</strong><span>历史行动项</span></div>
              </article>
              <article className="card admin-source-stat admin-source-tone-violet">
                <div className="admin-source-stat-icon"><TrendingUp size={18} /></div>
                <div><p>继任提名</p><strong>{archive?.successorOf?.length ?? 0}</strong><span>候选计划</span></div>
              </article>
            </section>
          </>
        }
        filters={
          <section className="card admin-users-toolbar">
            <div className="admin-users-filter-grid">
              <label>
                <span className="input-label">员工 ID</span>
                <div className="admin-source-search-field">
                  <Search size={16} />
                  <Input
                    className="h-[42px]"
                    type="search"
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void handleSearch();
                    }}
                    placeholder="留空查看本人"
                  />
                </div>
              </label>
            </div>
            <div className="admin-users-toolbar-actions">
              <Button size="sm" onClick={() => void handleSearch()}>查询</Button>
              {keyword ? (
                <Button variant="outline" size="sm" onClick={() => { setKeyword(''); void loadMine(); }}>
                  <RotateCcw className="mr-1.5 h-4 w-4" />查看本人
                </Button>
              ) : null}
            </div>
          </section>
        }
        table={
          loading ? (
            <article className="card admin-source-panel admin-settings-empty">加载中...</article>
          ) : !archive ? (
            <article className="card admin-source-panel admin-settings-empty">暂无档案数据</article>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              <article className="card admin-source-panel">
                <div className="flex items-center gap-3">
                  <div className="admin-source-stat-icon h-12 w-12 bg-[var(--cf-surface-muted)] dark:bg-slate-800">
                    <User className="h-6 w-6 text-slate-500" />
                  </div>
                  <div className="min-w-0 flex-1">
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
              </article>
      
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <InnerTableSurface>
                  <div className="px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
                    历次盘点 · 共 {archive.reviews?.length ?? 0} 次
                  </div>
                  <div className="admin-horizontal-scroll">
                    <table className="unity-data-table admin-source-table min-w-[680px]">
                      <thead>
                        <tr>
                          <th>盘点</th>
                          <th>状态</th>
                          <th>定位</th>
                          <th>分数</th>
                          <th>评语</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(archive.reviews ?? []).length ? (archive.reviews ?? []).map((row: Record<string, unknown>, idx) => (
                          <tr key={`${row.reviewId ?? idx}`}>
                            <td>
                              <strong>{asText(row.reviewName)}</strong>
                              <div className="text-xs text-slate-400">{asText(row.reviewYear, '')}</div>
                            </td>
                            <td><DictLabel dictType="hr_talent_review_status" value={String(row.status ?? '')} fallback="-" /></td>
                            <td>
                              <div className="flex items-center gap-2">
                                <MiniGrid currentCell={Number(row.gridCell) || undefined} />
                                <span className="text-xs">[{asText(row.gridCell)}]</span>
                              </div>
                            </td>
                            <td className="text-xs">
                              业绩 {asText(row.performanceScore)}<br />
                              潜力 {asText(row.potentialScore)}
                            </td>
                            <td className="max-w-[12rem] truncate text-xs">{asText(row.calibrationNotes)}</td>
                          </tr>
                        )) : (
                          <tr><td colSpan={5} className="admin-settings-empty">暂未参与盘点</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </InnerTableSurface>
      
                <InnerTableSurface>
                  <div className="px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
                    所在人才池 · 共 {archive.pools?.length ?? 0} 个
                  </div>
                  <div className="admin-horizontal-scroll">
                    <table className="unity-data-table admin-source-table min-w-[560px]">
                      <thead>
                        <tr>
                          <th>池名</th>
                          <th>类型</th>
                          <th>状态</th>
                          <th>入池时间</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(archive.pools ?? []).length ? (archive.pools ?? []).map((row: Record<string, unknown>, idx) => (
                          <tr key={`${row.poolId ?? idx}`}>
                            <td><strong>{asText(row.poolName)}</strong></td>
                            <td><DictLabel dictType="hr_talent_pool_type" value={String(row.poolType ?? '')} fallback="-" /></td>
                            <td>{row.status === 'IN' ? '在池' : '已退出'}</td>
                            <td>{formatDateTimeValue(row.joinedAt)}</td>
                          </tr>
                        )) : (
                          <tr><td colSpan={4} className="admin-settings-empty">暂未进入任何池</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </InnerTableSurface>
      
                <article className="card admin-source-panel">
                  <div className="admin-source-panel-head">
                    <div>
                      <h3>培养行动时间线</h3>
                      <span>共 {archive.developmentActions?.length ?? 0} 项</span>
                    </div>
                  </div>
                  <div>
                    {(archive.developmentActions ?? []).length ? (
                      <ol className="relative grid gap-3 border-l border-slate-200 pl-4 dark:border-slate-700">
                        {(archive.developmentActions ?? []).map((row: Record<string, unknown>, idx) => (
                          <li key={`${row.id ?? idx}`} className="relative">
                            <div className="absolute -left-[19px] mt-1 h-2 w-2 rounded-sm bg-emerald-500" />
                            <div className="text-xs text-slate-400">
                              {formatDateValue(row.startDate)} ~ {formatDateValue(row.endDate)}
                            </div>
                            <div className="mt-0.5 text-sm font-medium">{asText(row.actionName)}</div>
                            <div className="text-xs text-slate-500">
                              <DictLabel dictType="hr_talent_action_type" value={String(row.actionType ?? '')} fallback="-" /> ·
                              {' '}<DictLabel dictType="hr_talent_action_status" value={String(row.status ?? '')} fallback="-" />
                              {row.evaluationScore != null && row.evaluationScore !== ''
                                ? ` · 评分 ${String(row.evaluationScore)}`
                                : ''}
                            </div>
                            {row.evaluationNotes ? (
                              <div className="mt-1 text-xs text-slate-500">{String(row.evaluationNotes)}</div>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <div className="admin-settings-empty">暂无培养行动</div>
                    )}
                  </div>
                </article>
      
                <InnerTableSurface>
                  <div className="px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
                    继任提名 · 共 {archive.successorOf?.length ?? 0} 项
                  </div>
                  <div className="admin-horizontal-scroll">
                    <table className="unity-data-table admin-source-table min-w-[560px]">
                      <thead>
                        <tr>
                          <th>计划</th>
                          <th>就绪度</th>
                          <th>排序</th>
                          <th>差距</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(archive.successorOf ?? []).length ? (archive.successorOf ?? []).map((row: Record<string, unknown>, idx) => (
                          <tr key={`${row.id ?? idx}`}>
                            <td><strong>{asText(row.planName)}</strong></td>
                            <td><DictLabel dictType="hr_talent_readiness" value={String(row.readiness ?? '')} fallback="-" /></td>
                            <td>{asText(row.rankOrder)}</td>
                            <td className="max-w-[12rem] truncate text-xs">{asText(row.developmentGap)}</td>
                          </tr>
                        )) : (
                          <tr><td colSpan={4} className="admin-settings-empty">未被提名为继任人</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </InnerTableSurface>
              </div>
            </div>
          )
        }
      />
    </section>
  );
};

export default HrTalentArchivePage;
