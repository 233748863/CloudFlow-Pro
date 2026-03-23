-- =========================================================
-- CloudFlow Pro - HR 工作流缺失定义修复脚本
-- 目的：为已初始化环境补齐 HR 微服务依赖的审批流程定义
-- 日期：2026-03-22
-- =========================================================

SET NAMES utf8mb4;

-- 说明：
-- 1. 当前组织主数据中的 leader 字段存在大量历史占位值，无法稳定解析 DIRECT_LEADER / DEPT_MANAGER。
-- 2. 这些 HR 审批链先统一使用显式 ROLE 节点，保证 HR 微服务可独立拉起并完成真实闭环回归。
-- 3. 后续若组织主数据治理完成，可通过 workflow 自身的版本升级机制演进为更复杂的审批链。

INSERT INTO wf_process_definition (
  definition_id, tenant_id, process_name, process_key, version,
  status, is_latest, category, description, model_json, create_time, update_time
) VALUES
(
  'wf_offer_approval', 100000, 'Offer审批流程', 'offer_approval', 1,
  'PUBLISHED', 1, 'HR', 'Offer发放前的审批流程，使用显式角色审批避免依赖组织leader脏数据。',
  '{"nodes":[{"id":"root","type":"START","title":"提交Offer审批"},{"id":"n1","type":"APPROVAL","title":"总经理审批","approverType":"ROLE","approverValue":"admin","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->end","source":"n1","target":"end"}]}',
  NOW(), NOW()
),
(
  'wf_onboarding_approval', 100000, '入职审批流程', 'onboarding_approval', 1,
  'PUBLISHED', 1, 'HR', '入职申请审批流程，使用显式角色审批保证HR模块可独立运行。',
  '{"nodes":[{"id":"root","type":"START","title":"提交入职申请"},{"id":"n1","type":"APPROVAL","title":"总经理审批","approverType":"ROLE","approverValue":"admin","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->end","source":"n1","target":"end"}]}',
  NOW(), NOW()
),
(
  'wf_probation_confirmation_approval', 100000, '转正审批流程', 'probation_confirmation_approval', 1,
  'PUBLISHED', 1, 'HR', '转正申请审批流程，先保障闭环可用，再按组织策略做版本化升级。',
  '{"nodes":[{"id":"root","type":"START","title":"提交转正申请"},{"id":"n1","type":"APPROVAL","title":"总经理审批","approverType":"ROLE","approverValue":"admin","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->end","source":"n1","target":"end"}]}',
  NOW(), NOW()
),
(
  'wf_resignation_approval', 100000, '离职审批流程', 'resignation_approval', 1,
  'PUBLISHED', 1, 'HR', '离职申请审批流程，避免对部门leader解析的强依赖。',
  '{"nodes":[{"id":"root","type":"START","title":"提交离职申请"},{"id":"n1","type":"APPROVAL","title":"总经理审批","approverType":"ROLE","approverValue":"admin","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->end","source":"n1","target":"end"}]}',
  NOW(), NOW()
),
(
  'wf_salary_adjustment_approval', 100000, '调薪审批流程', 'salary_adjustment_approval', 1,
  'PUBLISHED', 1, 'HR', '调薪申请审批流程，先使用稳定的角色审批保障真实业务可跑通。',
  '{"nodes":[{"id":"root","type":"START","title":"提交调薪申请"},{"id":"n1","type":"APPROVAL","title":"总经理审批","approverType":"ROLE","approverValue":"admin","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->end","source":"n1","target":"end"}]}',
  NOW(), NOW()
),
(
  'wf_transfer_approval', 100000, '调岗审批流程', 'transfer_approval', 1,
  'PUBLISHED', 1, 'HR', '调岗申请审批流程，使用显式角色节点降低与组织主数据的耦合。',
  '{"nodes":[{"id":"root","type":"START","title":"提交调岗申请"},{"id":"n1","type":"APPROVAL","title":"总经理审批","approverType":"ROLE","approverValue":"admin","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->end","source":"n1","target":"end"}]}',
  NOW(), NOW()
)
ON DUPLICATE KEY UPDATE
  process_name = VALUES(process_name),
  status = VALUES(status),
  is_latest = VALUES(is_latest),
  category = VALUES(category),
  description = VALUES(description),
  model_json = VALUES(model_json),
  update_time = NOW();
