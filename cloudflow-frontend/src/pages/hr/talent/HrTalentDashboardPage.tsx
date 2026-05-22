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
import { StatCard } from '@/components/common/StatCard';
import { TableSurfaceCard } from '@/components/layout/TablePageLayout';
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
import { enumLabel, normalizeRows } from '../hrShared';

const cycleLabel: Record<string, string> = {
  ANNUAL: '年度',
  H1: '上半年',
  H2: '下半年',
  QUARTER: '季度',
};

const reviewStatusLabel: Record<string, string> = {
  DRAFT: '草稿',
  IN_PROGRESS: '进行中',
  CALIBRATING: '校准中',
  PUBLISHED: '已发布',
};

interface TalentDashboardData {
  ongoingReviews: number;
  hipoCount: number;
  pendingSuccession: number;
  pendingActions: number;
  recentReviews: HrTalentReview[];
  recentSuccession: HrTalentSuccessionPlan[];
}

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
        ongoingReviews: reviews.filter((r) =>
          ['DRAFT', 'IN_PROGRESS', 'CALIBRATING'].includes(String(r.status)),
        ).length,
        hipoCount: pools.filter((p) => String(p.poolType) === 'HIPO' && String(p.status) === 'ACTIVE').length,
        pendingSuccession: plans.filter((p) => String(p.status) === 'DRAFT').length,
        pendingActions: actions.filter((a) =>
          ['PLANNED', 'ONGOING'].includes(String(a.status)),
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

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900 dark:text-slate-50">人才盘点工作台</div>
          <div className="mt-1 text-xs text-slate-500">
            盘点 / 高潜池 / 继任 / 培养行动 一站式概览
          </div>
        </div>
        <Button variant="outline" disabled={loading} onClick={() => void load()}>
          <RefreshCcw className="mr-2 h-4 w-4" />刷新
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="进行中盘点"
          value={data.ongoingReviews}
          icon={<ClipboardList className="h-5 w-5" />}
          iconVariant="primary"
          meta="DRAFT / IN_PROGRESS / CALIBRATING"
        />
        <StatCard
          title="高潜人才池"
          value={data.hipoCount}
          icon={<Sparkles className="h-5 w-5" />}
          iconVariant="success"
          meta="ACTIVE · poolType=HIPO"
        />
        <StatCard
          title="待发布继任计划"
          value={data.pendingSuccession}
          icon={<TrendingUp className="h-5 w-5" />}
          iconVariant="warning"
          meta="状态 = DRAFT"
        />
        <StatCard
          title="进行中培养行动"
          value={data.pendingActions}
          icon={<Users className="h-5 w-5" />}
          iconVariant="gray"
          meta="PLANNED / ONGOING"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TableSurfaceCard>
          <div className="flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-800">
            <span>最近盘点活动</span>
            <Button size="sm" variant="ghost" onClick={() => navigate('/hr/talent/reviews')}>
              全部 <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
          <div className="space-y-2 px-4 pb-4">
            {data.recentReviews.length ? data.recentReviews.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded border border-slate-200 px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">{r.reviewName}</div>
                  <div className="text-xs text-slate-500">
                    {r.reviewYear} · {enumLabel(cycleLabel, r.cycleType)} · {enumLabel(reviewStatusLabel, r.status)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => navigate('/hr/talent/nine-box')}>
                    <Grid3x3 className="mr-1 h-3 w-3" />校准
                  </Button>
                </div>
              </div>
            )) : (
              <div className="py-6 text-center text-sm text-slate-400">暂无盘点活动</div>
            )}
          </div>
        </TableSurfaceCard>

        <TableSurfaceCard>
          <div className="flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-800">
            <span>最近继任计划</span>
            <Button size="sm" variant="ghost" onClick={() => navigate('/hr/talent/succession')}>
              全部 <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
          <div className="space-y-2 px-4 pb-4">
            {data.recentSuccession.length ? data.recentSuccession.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded border border-slate-200 px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">{p.planName}</div>
                  <div className="text-xs text-slate-500">
                    岗位 #{p.positionId ?? '-'} · 风险 {p.riskLevel ?? '-'} · 状态 {p.status}
                  </div>
                </div>
              </div>
            )) : (
              <div className="py-6 text-center text-sm text-slate-400">暂无继任计划</div>
            )}
          </div>
        </TableSurfaceCard>
      </div>

      <TableSurfaceCard>
        <div className="px-4 py-3 text-sm font-semibold text-slate-800">快速入口</div>
        <div className="grid grid-cols-2 gap-3 px-4 pb-4 md:grid-cols-4">
          {[
            { label: '盘点活动', path: '/hr/talent/reviews', icon: <ClipboardList className="h-4 w-4" /> },
            { label: '九宫格校准', path: '/hr/talent/nine-box', icon: <Grid3x3 className="h-4 w-4" /> },
            { label: '校准会议', path: '/hr/talent/calibration', icon: <Users className="h-4 w-4" /> },
            { label: '继任计划', path: '/hr/talent/succession', icon: <TrendingUp className="h-4 w-4" /> },
            { label: '人才池', path: '/hr/talent/pools', icon: <Sparkles className="h-4 w-4" /> },
            { label: '培养行动', path: '/hr/talent/development', icon: <Users className="h-4 w-4" /> },
            { label: '人才档案', path: '/hr/talent/archive', icon: <ArrowRight className="h-4 w-4" /> },
          ].map((item) => (
            <Button
              key={item.path}
              variant="outline"
              className="justify-start"
              onClick={() => navigate(item.path)}
            >
              {item.icon}
              <span className="ml-2">{item.label}</span>
            </Button>
          ))}
        </div>
      </TableSurfaceCard>
    </div>
  );
};

export default HrTalentDashboardPage;
