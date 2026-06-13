import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  Compass,
  FileJson,
  GitBranch,
  Loader2,
  Play,
  Sparkles,
  Target,
  XCircle,
} from 'lucide-react';
import {
  simulateProcess,
  validateDefinition,
  type SimulationNodeDetail,
  type SimulationResult,
} from '@/services/api/workflow';
import { Button, Switch, Textarea } from '@/components/common';
import {
  WorkspaceDialogShell,
  WorkspaceMetricCard,
  WorkspaceSectionCard,
} from '@/components/workspace';

interface SimulationDialogProps {
  open: boolean;
  onClose: () => void;
  definitionId: string;
}

const getNodeStatusMeta = (detail: SimulationNodeDetail) => {
  if (!detail.reached) {
    return {
      icon: <XCircle size={14} className="text-slate-400 dark:text-slate-500" />,
      badgeClassName:
        'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
      badgeLabel: '未到达',
    };
  }
  if (detail.warnings.length > 0) {
    return {
      icon: <AlertTriangle size={14} className="text-amber-600 dark:text-amber-300" />,
      badgeClassName:
        'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
      badgeLabel: '警告',
    };
  }
  return {
    icon: <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-300" />,
    badgeClassName:
      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
    badgeLabel: '通过',
  };
};

export const SimulationDialog: React.FC<SimulationDialogProps> = ({
  open,
  onClose,
  definitionId,
}) => {
  const [variables, setVariables] = useState('{}');
  const [simulateAll, setSimulateAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);

  const metrics = useMemo(
    () => [
      {
        label: '总节点',
        value: result?.totalNodes ?? 0,
        hint: result ? '流程图中参与分析的节点数' : '等待分析',
        icon: <Compass size={18} />,
        iconClassName:
          'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-200',
      },
      {
        label: '可达节点',
        value: result?.reachableNodes ?? 0,
        hint: result ? '变量条件下可被命中的节点数' : '等待分析',
        icon: <Target size={18} />,
        iconClassName:
          'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200',
      },
      {
        label: '路径数',
        value: result?.paths.length ?? 0,
        hint: result ? '本次模拟得到的执行路径' : '等待分析',
        icon: <GitBranch size={18} />,
        iconClassName:
          'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200',
      },
    ],
    [result],
  );

  if (!open) return null;

  const handleSimulate = async () => {
    setLoading(true);
    try {
      let parsedVars: Record<string, unknown> = {};
      try {
        parsedVars = JSON.parse(variables);
      } catch {
        toast.error('变量 JSON 格式错误');
        setLoading(false);
        return;
      }

      const res = await simulateProcess({
        definitionId,
        variables: parsedVars,
        simulateAllBranches: simulateAll,
        maxDepth: 50,
      });
      setResult(res);
    } catch (e: any) {
      toast.error(e.message || '模拟执行失败');
    } finally {
      setLoading(false);
    }
  };

  const handleValidate = async () => {
    setLoading(true);
    try {
      const res = await validateDefinition(definitionId);
      setResult(res);
    } catch (e: any) {
      toast.error(e.message || '验证失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <WorkspaceDialogShell
      title="流程模拟测试"
      description={`Definition ${definitionId} · 验证结构、条件分支和节点可达性`}
      onClose={onClose}
      maxWidthClassName="w-full sm:max-w-5xl lg:max-w-6xl"
      bodyClassName="overflow-y-auto !px-0 !py-0"
      headerAside={(
        <div className="hidden items-center gap-2 rounded-full border border-cyan-200/70 bg-cyan-50/90 px-3 py-1 text-xs font-semibold text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-200 md:inline-flex">
          <Sparkles size={14} />
          Simulation
        </div>
      )}
    >
      <div className="space-y-4 bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.12),transparent_26%),linear-gradient(180deg,rgba(248,250,252,0.74),rgba(255,255,255,0.88))] px-4 py-4 dark:bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.12),transparent_26%),linear-gradient(180deg,rgba(2,6,23,0.74),rgba(2,6,23,0.92))] sm:px-6 sm:py-5">
        <div className="grid gap-3 md:grid-cols-3">
          {metrics.map((item) => (
            <WorkspaceMetricCard
              key={item.label}
              label={item.label}
              value={item.value}
              hint={item.hint}
              aside={(
                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${item.iconClassName}`}>
                  {item.icon}
                </div>
              )}
            />
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.92fr)]">
          <WorkspaceSectionCard
            eyebrow="Config"
            title="模拟配置"
            description="JSON 变量用于条件分支求值；开启“模拟所有分支”后，会忽略条件结果并穷举可能路径。"
            bodyClassName="space-y-4"
            headerAside={(
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={handleValidate} disabled={loading}>
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Compass size={14} />}
                  验证结构
                </Button>
                <Button size="sm" onClick={handleSimulate} disabled={loading}>
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  执行模拟
                </Button>
              </div>
            )}
          >
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/60">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <FileJson size={16} />
                模拟变量 JSON
              </div>
              <Textarea
                value={variables}
                onChange={(event) => setVariables(event.target.value)}
                className="min-h-[220px] resize-none font-mono text-[13px] leading-6"
                placeholder='{"amount": 5000, "department": "finance"}'
              />
              <div className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                变量 = 流程条件节点解析时可读取的键值对。示例：金额审批流可传入 `amount`、`department`、`urgent`。
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  模拟所有分支
                </div>
                <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  开启后跳过条件真假限制，用于检查整张流程图是否存在不可达或异常闭环。
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {simulateAll ? '已开启' : '按真实条件'}
                </span>
                <Switch checked={simulateAll} onCheckedChange={setSimulateAll} />
              </div>
            </div>
          </WorkspaceSectionCard>

          <WorkspaceSectionCard
            eyebrow="Overview"
            title="模拟概览"
            description={
              result
                ? result.success
                  ? '当前流程定义在本次条件下可通过基本模拟。'
                  : '当前流程定义存在错误或不可达问题。'
                : '执行模拟或结构验证后，这里汇总错误、警告和可达性。'
            }
            bodyClassName="space-y-4"
          >
            {result ? (
              <>
                <div
                  className={[
                    'rounded-2xl border px-4 py-4',
                    result.success
                      ? 'border-emerald-200 bg-emerald-50/90 dark:border-emerald-500/20 dark:bg-emerald-500/10'
                      : 'border-rose-200 bg-rose-50/90 dark:border-rose-500/20 dark:bg-rose-500/10',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    {result.success ? (
                      <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-300" />
                    ) : (
                      <XCircle size={16} className="text-rose-600 dark:text-rose-300" />
                    )}
                    <span className="text-slate-900 dark:text-slate-100">
                      {result.success ? '模拟通过' : '存在错误'}
                    </span>
                  </div>
                  <div className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    总节点 {result.totalNodes} · 可达 {result.reachableNodes} · 不可达 {result.unreachableNodes.length}
                  </div>
                </div>

                {result.errors.length > 0 ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-4 dark:border-rose-500/20 dark:bg-rose-500/10">
                    <div className="text-sm font-semibold text-rose-700 dark:text-rose-300">错误</div>
                    <div className="mt-2 space-y-2">
                      {result.errors.map((item, index) => (
                        <div key={`${item}-${index}`} className="flex items-start gap-2 text-sm text-rose-700 dark:text-rose-300">
                          <XCircle size={14} className="mt-0.5 shrink-0" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {result.warnings.length > 0 ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-4 dark:border-amber-500/20 dark:bg-amber-500/10">
                    <div className="text-sm font-semibold text-amber-700 dark:text-amber-300">警告</div>
                    <div className="mt-2 space-y-2">
                      {result.warnings.map((item, index) => (
                        <div key={`${item}-${index}`} className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
                          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {result.unreachableNodes.length > 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-4 dark:border-slate-700 dark:bg-slate-900/70">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">不可达节点</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {result.unreachableNodes.map((nodeId) => (
                        <span
                          key={nodeId}
                          className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                        >
                          {nodeId}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-5 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
                暂无模拟结果。
              </div>
            )}
          </WorkspaceSectionCard>
        </div>

        {result?.paths.length ? (
          <WorkspaceSectionCard
            eyebrow="Paths"
            title={`执行路径 (${result.paths.length})`}
            description="每条路径代表一次可能的节点命中顺序，终止类型用于识别正常结束、条件终止或异常终止。"
            bodyClassName="space-y-3"
          >
            {result.paths.map((path, index) => (
              <div
                key={`${path.terminationType}-${index}`}
                className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/60"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {path.nodeTitles.map((title, nodeIndex) => (
                    <React.Fragment key={`${title}-${nodeIndex}`}>
                      {nodeIndex > 0 ? <ArrowSeparator /> : null}
                      <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-medium text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300">
                        {title}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
                <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  终止类型：{path.terminationType}
                </div>
              </div>
            ))}
          </WorkspaceSectionCard>
        ) : null}

        {result?.nodeDetails.length ? (
          <WorkspaceSectionCard
            eyebrow="Nodes"
            title="节点详情"
            description="节点详情 = 单个节点在本次模拟中的到达状态、条件求值与参与人解析结果。"
            bodyClassName="overflow-hidden"
          >
            <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="max-h-[28rem] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50/95 backdrop-blur dark:bg-slate-900/95">
                    <tr className="text-left text-slate-500 dark:text-slate-400">
                      <th className="px-4 py-3 font-medium">节点</th>
                      <th className="px-4 py-3 font-medium">类型</th>
                      <th className="px-4 py-3 font-medium">状态</th>
                      <th className="px-4 py-3 font-medium">条件</th>
                      <th className="px-4 py-3 font-medium">参与人</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {result.nodeDetails.map((detail) => {
                      const statusMeta = getNodeStatusMeta(detail);
                      return (
                        <tr
                          key={detail.nodeId}
                          className="bg-white/90 transition-colors hover:bg-slate-50/90 dark:bg-slate-950/40 dark:hover:bg-slate-900/70"
                        >
                          <td className="px-4 py-3 align-top">
                            <div className={detail.reached ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'}>
                              {detail.title || detail.nodeId}
                            </div>
                            <div className="mt-1 text-xs font-mono text-slate-400 dark:text-slate-500">
                              {detail.nodeId}
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top text-slate-600 dark:text-slate-300">
                            {detail.nodeType}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${statusMeta.badgeClassName}`}
                            >
                              {statusMeta.icon}
                              {statusMeta.badgeLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3 align-top text-slate-500 dark:text-slate-400">
                            {detail.conditionResult === null || detail.conditionResult === undefined
                              ? '-'
                              : detail.conditionResult
                                ? '条件满足'
                                : '条件不满足'}
                          </td>
                          <td className="px-4 py-3 align-top text-slate-500 dark:text-slate-400">
                            {detail.resolvedAssignees.length > 0
                              ? detail.resolvedAssignees.join(', ')
                              : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </WorkspaceSectionCard>
        ) : null}
      </div>
    </WorkspaceDialogShell>
  );
};

const ArrowSeparator = () => (
  <span className="text-slate-300 dark:text-slate-600">→</span>
);
