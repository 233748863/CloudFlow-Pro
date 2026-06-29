import React, { useCallback, useEffect, useState } from 'react';
import { Award, BookOpen, Clock, GraduationCap, RefreshCcw, RotateCcw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input } from '@/components/common';
import { TablePageLayout, InnerTableSurface } from '@/components/layout/TablePageLayout';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  HrTrainingArchive,
  getMyTrainingArchive,
  getEmployeeTrainingArchive,
} from '@/services/api/hr';
import { formatDateValue } from './hrShared';
import { getTrainingEnrollmentStatusLabel } from '@/utils/enumLabels';

export const HrTrainingArchivePage: React.FC = () => {
  const [archive, setArchive] = useState<HrTrainingArchive | null>(null);
  const [loading, setLoading] = useState(true);
  const [employeeId, setEmployeeId] = useState('');

  const load = useCallback(async (id?: number) => {
    setLoading(true);
    try {
      const data = id ? await getEmployeeTrainingArchive(id) : await getMyTrainingArchive();
      setArchive(data);
    } catch (error) {
      toast.error(getErrorMessage(error, '培训档案加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleQuery = () => {
    const id = Number(employeeId);
    if (!id) { void load(); return; }
    void load(id);
  };

  return (
    <section className="admin-source-page">
      <TablePageLayout
        actions={
          <>
            <header className="admin-source-header">
              <div>
                <p className="admin-source-kicker">TRAINING ARCHIVE</p>
                <h2>培训档案</h2>
                <span>查看员工累计学时、课程完成情况、参训记录和证书状态</span>
              </div>
              <div className="admin-source-controls">
                <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
                  <RefreshCcw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />刷新
                </Button>
              </div>
            </header>
      
            <section className="admin-source-stat-grid">
              <article className="card admin-source-stat admin-source-tone-blue">
                <span className="admin-source-stat-icon"><Clock size={18} /></span>
                <div><p>累计学时</p><strong>{Number(archive?.totalCreditHours ?? 0).toFixed(1)}</strong><span>已记录培训时长</span></div>
              </article>
              <article className="card admin-source-stat admin-source-tone-green">
                <span className="admin-source-stat-icon"><BookOpen size={18} /></span>
                <div><p>已完成课程</p><strong>{archive?.completedCount ?? 0}</strong><span>完成培训数量</span></div>
              </article>
              <article className="card admin-source-stat admin-source-tone-amber">
                <span className="admin-source-stat-icon"><GraduationCap size={18} /></span>
                <div><p>进行中</p><strong>{archive?.ongoingCount ?? 0}</strong><span>正在参训记录</span></div>
              </article>
              <article className="card admin-source-stat admin-source-tone-violet">
                <span className="admin-source-stat-icon"><Award size={18} /></span>
                <div><p>获得证书</p><strong>{archive?.certificateCount ?? 0}</strong><span>证书档案数量</span></div>
              </article>
            </section>
          </>
        }
        filters={
          <section className="card admin-users-toolbar">
            <form
              className="admin-users-filter-grid admin-training-archive-filter-grid"
              onSubmit={(event) => {
                event.preventDefault();
                handleQuery();
              }}
            >
              <label>
                <span className="input-label">员工 ID</span>
                <div className="admin-source-search-field">
                  <Search size={16} />
                  <Input
                    className="h-[42px]"
                    value={employeeId}
                    onChange={(event) => setEmployeeId(event.target.value)}
                    placeholder="留空查我的"
                  />
                </div>
              </label>
              <div className="admin-users-toolbar-actions">
                <Button type="submit" size="sm">查询</Button>
                {employeeId ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => { setEmployeeId(''); void load(); }}>
                    <RotateCcw className="h-4 w-4" />查我的
                  </Button>
                ) : null}
                <span className="admin-users-filter-count">{employeeId ? `员工 ${employeeId}` : '本人档案'}</span>
              </div>
            </form>
          </section>
        }
        table={
          loading ? (
            <InnerTableSurface>
              <div className="py-12 text-center text-sm text-slate-400">加载中...</div>
            </InnerTableSurface>
          ) : !archive ? (
            <InnerTableSurface>
              <div className="py-12 text-center text-sm text-slate-400">无档案数据</div>
            </InnerTableSurface>
          ) : (
            <div className="admin-source-content-grid admin-training-archive-grid">
              <InnerTableSurface>
                <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800 dark:border-slate-800 dark:text-slate-100">参训记录</div>
                <div className="admin-horizontal-scroll">
                  <table className="unity-data-table admin-source-table min-w-[720px]">
                    <thead>
                      <tr>
                        <th>班次</th>
                        <th>课程</th>
                        <th>状态</th>
                        <th>完成状态</th>
                        <th>分数</th>
                        <th>签到时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {archive.enrollments?.length ? archive.enrollments.map((row: Record<string, unknown>) => (
                        <tr key={String(row.id)}>
                          <td className="text-sm">{String(row.sessionNo || `#${row.sessionId}`)}</td>
                          <td className="text-sm">{String(row.courseName || `#${row.courseId}`)}</td>
                          <td className="text-sm">{getTrainingEnrollmentStatusLabel(row.status as string)}</td>
                          <td className="text-sm">{getTrainingEnrollmentStatusLabel(row.completionStatus as string) || '-'}</td>
                          <td className="text-sm">{(row.score as React.ReactNode) ?? '-'}</td>
                          <td className="text-xs">{formatDateValue(row.checkInTime)}</td>
                        </tr>
                      )) : (
                        <tr><td colSpan={6} className="admin-settings-empty">无参训记录</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </InnerTableSurface>
      
              <InnerTableSurface>
                <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800 dark:border-slate-800 dark:text-slate-100">获得证书</div>
                <div className="admin-horizontal-scroll">
                  <table className="unity-data-table admin-source-table min-w-[560px]">
                    <thead>
                      <tr>
                        <th>证书号</th>
                        <th>课程</th>
                        <th>颁发日期</th>
                        <th>状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {archive.certificates?.length ? archive.certificates.map((row) => (
                        <tr key={row.id}>
                          <td className="font-mono text-xs">{row.certNo}</td>
                          <td className="text-sm">{`#${row.courseId}`}</td>
                          <td className="text-xs">{formatDateValue(row.issueDate)}</td>
                          <td className="text-sm">{row.status === 'VALID' ? '有效' : '已撤销'}</td>
                        </tr>
                      )) : (
                        <tr><td colSpan={4} className="admin-settings-empty">暂无证书</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </InnerTableSurface>
            </div>
          )
        }
      />
    </section>
  );
};

export default HrTrainingArchivePage;
