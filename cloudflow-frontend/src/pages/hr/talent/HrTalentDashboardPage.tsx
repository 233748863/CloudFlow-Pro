import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ClipboardList,
  Grid3x3,
  RefreshCcw,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/common';
import { TablePageLayout, InnerTableSurface } from '@/components/layout/TablePageLayout';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  HrTalentDevelopmentAction,
  HrTalentPool,
  HrTalentReview,
  HrTalentSuccessionPlan,
  listDevelopmentActions,
  listSuccessionPlans,
  listTalentPools,
  listTalentReviews,
} from '@/services/api/hr';
import { normalizeRows } from '../hrShared';
import { DictLabel } from '@/components/common/DictLabel';

interface TalentDashboardData {
  ongoingReviews: number;
  hipoCount: number;
  pendingSuccession: number;
  pendingActions: number;
  recentReviews: HrTalentReview[];
  recentSuccession: HrTalentSuccessionPlan[];
}

const shortcuts = [
  { label: '盘点活动', path: '/hr/talent/reviews', icon: <ClipboardList className="h-4 w-4" /> },
  { label: '九宫格校准', path: '/hr/talent/nine-box', icon: <Grid3x3 className="h-4 w-4" /> },
  { label: '校准会议', path: '/hr/talent/calibration', icon: <Users className="h-4 w-4" /> },
  { label: '继任计划', path: '/hr/talent/succession', icon: <TrendingUp className="h-4 w-4" /> },
  { label: '人才池', path: '/hr/talent/pools', icon: <Sparkles className="h-4 w-4" /> },
  { label: '培养行动', path: '/hr/talent/development', icon: <Users className="h-4 w-4" /> },
  { label: '人才档案', path: '/hr/talent/archive', icon: <ArrowRight className="h-4 w-4" /> },
];

export const HrTalentDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TalentDashboardData>({
    ongoingReviews: 0,
    hipoCount: 0,
    pendingSuccession: 0,
    pendingActions: 0,
    recentReviews: [],
    recentSuccession: [],
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reviewsRes, poolsRes, plansRes, actionsRes] = await Promise.all([
        listTalentReviews({ pageSize: 50 }),
        listTalentPools({ pageSize: 200 }),
        listSuccessionPlans({ pageSize: 50 }),
        listDevelopmentActions({ pageSize: 200 }),
      ]);
      const reviews = normalizeRows<HrTalentReview>(reviewsRes);
      const pools = normalizeRows<HrTalentPool>(poolsRes);
      const plans = normalizeRows<HrTalentSuccessionPlan>(plansRes);
      const actions = normalizeRows<HrTalentDevelopmentAction>(actionsRes);

      setData({
        ongoingReviews: reviews.filter((review) =>
          ['DRAFT', 'IN_PROGRESS', 'CALIBRATING'].includes(String(review.status)),
        ).length,
        hipoCount: pools.filter((pool) => String(pool.poolType) === 'HIPO' && String(pool.status) === 'ACTIVE').length,
        pendingSuccession: plans.filter((plan) => String(plan.status) === 'DRAFT').length,
        pendingActions: actions.filter((action) =>
          ['PLANNED', 'ONGOING'].includes(String(action.status)),
        ).length,
        recentReviews: reviews.slice(0, 5),
        recentSuccession: plans.slice(0, 5),
      });
    } catch (error) {
      toast.error(getErrorMessage(error, '工作台加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const statusTiles = [
    {
      label: '进行中盘点',
      value: data.ongoingReviews,
      meta: 'DRAFT / IN_PROGRESS / CALIBRATING',
      icon: <ClipboardList size={17} />,
      tone: 'blue',
    },
    {
      label: '高潜人才池',
      value: data.hipoCount,
      meta: 'ACTIVE · HIPO',
      icon: <Sparkles size={17} />,
      tone: 'green',
    },
    {
      label: '待发布继任计划',
      value: data.pendingSuccession,
      meta: '草稿状态',
      icon: <TrendingUp size={17} />,
      tone: 'amber',
    },
    {
      label: '进行中培养行动',
      value: data.pendingActions,
      meta: 'PLANNED / ONGOING',
      icon: <Users size={17} />,
      tone: 'violet',
    },
  ];

  return (
    <section className="admin-source-page admin-talent-dashboard-page">
      <TablePageLayout
        actions={
          <header className="admin-source-header">
            <div>
              <p className="admin-source-kicker">TALENT COMMAND CENTER</p>
              <h2>人才工作台</h2>
              <span>汇总人才盘点、人才池、继任计划和培养行动状态</span>
            </div>
            <div className="admin-source-controls">
              <Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
                <RefreshCcw className={loading ? 'mr-1.5 h-4 w-4 animate-spin' : 'mr-1.5 h-4 w-4'} />刷新
              </Button>
            </div>
          </header>
        }
        filters={
          <section className="card admin-talent-command-strip">
            <div className="admin-talent-status-grid">
              {statusTiles.map((item) => (
                <article key={item.label} className={`admin-talent-status-cell tone-${item.tone}`}>
                  <span>{item.icon}</span>
                  <div>
                    <p>{item.label}</p>
                    <strong>{item.value}</strong>
                    <em>{item.meta}</em>
                  </div>
                </article>
              ))}
            </div>
            <div className="admin-talent-shortcut-rail">
              <span>最近盘点 {data.recentReviews.length} 条 · 最近继任 {data.recentSuccession.length} 条</span>
              <div>
                {shortcuts.map((item) => (
                  <button key={item.path} type="button" onClick={() => navigate(item.path)}>
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        }
        table={
          <div className="grid grid-cols-1 gap-4">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <InnerTableSurface>
                <div className="flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  <span>最近盘点活动</span>
                  <Button size="sm" variant="ghost" onClick={() => navigate('/hr/talent/reviews')}>
                    全部 <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </div>
                <div className="admin-horizontal-scroll">
                  <table className="unity-data-table admin-source-table min-w-full">
                    <thead>
                      <tr>
                        <th>盘点活动</th>
                        <th>年度</th>
                        <th>周期</th>
                        <th>状态</th>
                        <th className="text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentReviews.length ? data.recentReviews.map((review) => (
                        <tr key={review.id}>
                          <td><strong>{review.reviewName}</strong></td>
                          <td>{review.reviewYear}</td>
                          <td><DictLabel dictType="hr_talent_cycle" value={String(review.cycleType ?? '')} fallback="-" /></td>
                          <td><DictLabel dictType="hr_talent_review_status" value={String(review.status ?? '')} fallback="-" /></td>
                          <td>
                            <div className="admin-users-row-actions">
                              <button type="button" title="九宫格校准" onClick={() => navigate('/hr/talent/nine-box')}>
                                <Grid3x3 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )) : (
                        <tr><td colSpan={5} className="admin-settings-empty">暂无盘点活动</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </InnerTableSurface>
      
              <InnerTableSurface>
                <div className="flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  <span>最近继任计划</span>
                  <Button size="sm" variant="ghost" onClick={() => navigate('/hr/talent/succession')}>
                    全部 <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </div>
                <div className="admin-horizontal-scroll">
                  <table className="unity-data-table admin-source-table min-w-full">
                    <thead>
                      <tr>
                        <th>计划</th>
                        <th>岗位</th>
                        <th>风险</th>
                        <th>状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentSuccession.length ? data.recentSuccession.map((plan) => (
                        <tr key={plan.id}>
                          <td><strong>{plan.planName}</strong></td>
                          <td>#{plan.positionId ?? '-'}</td>
                          <td><DictLabel dictType="hr_talent_succession_risk" value={String(plan.riskLevel ?? '')} fallback="-" /></td>
                          <td><DictLabel dictType="hr_publish_status" value={String(plan.status ?? '')} fallback="-" /></td>
                        </tr>
                      )) : (
                        <tr><td colSpan={4} className="admin-settings-empty">暂无继任计划</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </InnerTableSurface>
            </div>
          </div>
        }
      />
    </section>
  );
};

export default HrTalentDashboardPage;
