import React from 'react';
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  FilePlus2,
  Layers3,
  PenTool,
  Route,
  Settings2,
  Workflow,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/common';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

type LaunchMetric = {
  label: string;
  value: string;
};

type LaunchOption = {
  id: 'template' | 'blank';
  title: string;
  subtitle: string;
  description: string;
  metrics: LaunchMetric[];
  steps: string[];
  actionLabel: string;
  target: string;
  icon: React.ComponentType<{ className?: string }>;
};

type SetupStep = {
  label: string;
  value: string;
  meta: string;
  icon: React.ComponentType<{ size?: number }>;
  tone: 'blue' | 'green' | 'amber';
};

const launchOptions: LaunchOption[] = [
  {
    id: 'template',
    title: '从模板创建',
    subtitle: '复用成熟流程，先选模板再进入设计器',
    description: '适合请假、报销、采购、合同等已有相似规则的流程，先带入节点结构，再调整审批人与字段。',
    metrics: [
      { label: '入口', value: '模板库' },
      { label: '起点', value: '已有结构' },
      { label: '落点', value: '流程草稿' },
    ],
    steps: ['筛选业务模板', '填写流程名称', '进入设计工作台'],
    actionLabel: '进入模板库',
    target: '/templates?entry=create',
    icon: Layers3,
  },
  {
    id: 'blank',
    title: '空白创建',
    subtitle: '直接打开画布，从零配置流程规则',
    description: '适合新业务、新审批链路或需要完全自定义节点结构的场景，进入设计器后从开始节点搭建。',
    metrics: [
      { label: '入口', value: '空白画布' },
      { label: '起点', value: '新建结构' },
      { label: '落点', value: '直接编辑' },
    ],
    steps: ['打开空白画布', '配置流程节点', '保存流程草稿'],
    actionLabel: '进入空白设计',
    target: '/workflow/design?mode=blank&entry=create',
    icon: PenTool,
  },
];

const setupSteps: SetupStep[] = [
  { label: '创建方式', value: '2 个入口', meta: '模板 / 空白', icon: FilePlus2, tone: 'blue' },
  { label: '模板能力', value: '已连接', meta: '复用成熟结构', icon: BadgeCheck, tone: 'green' },
  { label: '设计器', value: '统一落点', meta: '草稿保存后发布', icon: Workflow, tone: 'amber' },
];

const reviewRows = [
  { label: '后续配置', value: '节点、条件、审批人、字段权限都在流程设计器完成。' },
  { label: '保存策略', value: '模板创建和空白创建都会先进入草稿，再由发布流程生效。' },
  { label: '权限边界', value: '创建入口只负责跳转，不改变后端接口和发布规则。' },
];

export const WorkflowCreate: React.FC = () => {
  const navigate = useNavigate();

  const go = (target: string) => {
    navigate(target);
  };

  const pageActions = (
    <header className="admin-source-header workflow-create-command">
      <div>
        <p className="admin-source-kicker">WORKFLOW SETUP</p>
        <h2>创建流程</h2>
        <span>选择流程创建起点，下一步进入统一设计器完成节点配置、保存和发布。</span>
        <div className="admin-source-context-row">
          <span className="admin-source-context-chip">
            <Route className="admin-source-context-icon" />
            <strong>落点</strong>
            <em>统一设计器</em>
          </span>
          <span className="admin-source-context-chip">
            <Settings2 className="admin-source-context-icon" />
            <strong>保存</strong>
            <em>流程草稿</em>
          </span>
          <span className="admin-source-context-chip">
            <BadgeCheck className="admin-source-context-icon" />
            <strong>接口</strong>
            <em>保持不变</em>
          </span>
        </div>
      </div>
      <div className="admin-source-controls">
        <Button variant="outline" onClick={() => go('/templates?entry=create')}>
          <Layers3 className="h-4 w-4" />
          模板库
        </Button>
        <Button onClick={() => go('/workflow/design?mode=blank&entry=create')}>
          <PenTool className="h-4 w-4" />
          空白创建
        </Button>
      </div>
    </header>
  );

  const pageFilters = (
    <section className="admin-source-stat-grid">
      {setupSteps.map((step) => {
        const Icon = step.icon;

        return (
          <article key={step.label} className={`card admin-source-stat admin-source-tone-${step.tone}`}>
            <div className="admin-source-stat-icon"><Icon size={18} /></div>
            <div>
              <p>{step.label}</p>
              <strong>{step.value}</strong>
              <span>{step.meta}</span>
            </div>
          </article>
        );
      })}
    </section>
  );

  const pageContent = (
    <InnerTableSurface className="workflow-create-workbench" wrapperClassName="workflow-create-workbench-shell">
      <div className="admin-source-section-head workflow-create-workbench-head">
        <div>
          <strong>创建方式</strong>
          <span>两条入口进入同一套流程设计器，按业务场景选择起点。</span>
        </div>
        <div className="admin-source-controls workflow-create-guidebar">
          <span className="workflow-create-guide">
            <CheckCircle2 size={14} />
            <span><strong>草稿</strong> 先保存再发布</span>
          </span>
          <span className="workflow-create-guide">
            <Route size={14} />
            <span><strong>路径</strong> 设计器统一承接</span>
          </span>
        </div>
      </div>

      <div className="workflow-create-option-list">
        {launchOptions.map((option) => {
          const Icon = option.icon;
          const accent = option.id === 'template' ? '#0d95b5' : '#d97706';

          return (
            <article key={option.id} className="workflow-create-option">
              <span className="workflow-create-option-accent" style={{ background: accent }} />
              <div className="workflow-create-option-main">
                <span className="workflow-create-option-icon" style={{ color: accent }}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="workflow-create-option-copy">
                  <h3>{option.title}</h3>
                  <p>{option.subtitle}</p>
                  <span>{option.description}</span>
                </div>
              </div>

              <dl className="workflow-create-detail-grid">
                {option.metrics.map((metric) => (
                  <div key={`${option.id}-${metric.label}`}>
                    <dt>{metric.label}</dt>
                    <dd>{metric.value}</dd>
                  </div>
                ))}
              </dl>

              <ul className="workflow-create-checklist">
                {option.steps.map((step) => (
                  <li key={`${option.id}-${step}`}>
                    <CheckCircle2 size={14} />
                    <span>{step}</span>
                  </li>
                ))}
              </ul>

              <Button className="workflow-create-option-action" onClick={() => go(option.target)}>
                {option.actionLabel}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </article>
          );
        })}
      </div>

      <div className="admin-source-inline-toolbar workflow-create-reviewbar">
        {reviewRows.map((row) => (
          <div key={row.label} className="workflow-create-reviewitem">
            <span>{row.label}</span>
            <p>{row.value}</p>
          </div>
        ))}
        <Button variant="outline" className="workflow-create-direct" onClick={() => go('/workflow/design?mode=blank&entry=create')}>
          <Route className="h-4 w-4" />
          进入设计器
        </Button>
      </div>
    </InnerTableSurface>
  );

  return (
    <section className="admin-source-page workflow-create-page">
      <TablePageLayout
        className="workflow-create-layout"
        actions={pageActions}
        filters={pageFilters}
        table={pageContent}
      />
    </section>
  );
};

export default WorkflowCreate;
