-- 绩效复杂场景演示数据
-- 导入顺序：03.cloudflow-hr.sql -> 06.cloudflow-business-seed.sql -> 本文件
-- 覆盖：自定义类型/单位、多指标权重、多部门级联、多层部门拆解、全状态、归档快照、超额封顶、低完成率、百分比指标、调薪联动
-- 可重复执行：先清理 PF_DEMO_* 与 SA_PERF_DEMO_* 演示数据，并补齐绩效分解依赖的演示员工档案

DELETE FROM cloud_flow_db.hr_salary_adjustment
WHERE tenant_id = 100000
  AND (
    application_no LIKE 'SA_PERF_DEMO_%'
    OR (source_type = 'PERFORMANCE_OBJECTIVE' AND source_id IN (910001, 910002, 910003, 910004, 910005, 910006, 910007, 910008))
  );

DELETE FROM cloud_flow_db.hr_performance_assignment
WHERE tenant_id = 100000
  AND objective_id IN (
    SELECT id FROM cloud_flow_db.hr_performance_objective
    WHERE tenant_id = 100000
      AND objective_no IN (
        'PF_DEMO_SALES_MULTI_2026Q2',
        'PF_DEMO_DELIVERY_COUNT_2026Q2',
        'PF_DEMO_CASCADE_MULTI_DEPT_2026Q2',
        'PF_DEMO_DRAFT_PERCENT_2026Q3',
        'PF_DEMO_PLAN_APPROVING_2026Q3',
        'PF_DEMO_RESULT_APPROVING_LOW_2026Q2',
        'PF_DEMO_COMPLETED_ARCHIVE_CAP_2026Q1',
        'PF_DEMO_REJECTED_2026Q3'
      )
  );

DELETE FROM cloud_flow_db.hr_performance_objective
WHERE tenant_id = 100000
  AND objective_no IN (
    'PF_DEMO_SALES_MULTI_2026Q2',
    'PF_DEMO_DELIVERY_COUNT_2026Q2',
    'PF_DEMO_CASCADE_MULTI_DEPT_2026Q2',
    'PF_DEMO_DRAFT_PERCENT_2026Q3',
    'PF_DEMO_PLAN_APPROVING_2026Q3',
    'PF_DEMO_RESULT_APPROVING_LOW_2026Q2',
    'PF_DEMO_COMPLETED_ARCHIVE_CAP_2026Q1',
        'PF_DEMO_REJECTED_2026Q3'
  );

INSERT INTO cloud_flow_db.hr_position (
  id, tenant_id, position_code, position_name, family_id, level_id, post_id,
  job_description, requirements, work_content, status, create_time, update_time
) VALUES
(107, 100000, 'PRODUCT_DIRECTOR_M3', '产品总监', 101, 110, 2,
 '负责产品方向、跨部门需求优先级与版本路线图管理', '具备企业软件产品规划、B端需求分析与跨部门推进能力', '统筹产品规划、交付协同与重点客户需求决策', 1, '2026-03-21 09:00:00', '2026-03-21 09:00:00'),
(108, 100000, 'DELIVERY_MANAGER_M2', '交付经理', 102, 109, 2,
 '负责实施团队管理与重点项目上线交付', '熟悉 SaaS 项目实施、培训、验收与风险管理', '统筹交付资源、项目计划与客户上线保障', 1, '2026-03-21 09:05:00', '2026-03-21 09:05:00'),
(109, 100000, 'CS_MANAGER_M2', '客户成功经理', 103, 109, 2,
 '负责重点客户续约、活跃度与客户经营体系建设', '具备续约经营、数据复盘与客户关系管理能力', '统筹客户经营计划、续约节奏与高风险客户治理', 1, '2026-03-21 09:10:00', '2026-03-21 09:10:00'),
(110, 100000, 'SALES_MANAGER_M2', '销售经理', 103, 109, 2,
 '负责商机管理、方案推进与销售目标达成', '具备企业软件销售与方案型沟通能力', '统筹商机漏斗、重点客户拜访与签约推进', 1, '2026-03-21 09:15:00', '2026-03-21 09:15:00'),
(111, 100000, 'OPS_MANAGER_M2', '运维经理', 100, 109, 2,
 '负责运维团队管理、发布保障与应急机制建设', '熟悉 DevOps、监控告警与稳定性治理', '统筹发布窗口、巡检计划和重大故障应急响应', 1, '2026-03-21 09:20:00', '2026-03-21 09:20:00'),
(112, 100000, 'PRODUCT_MANAGER_P4', '产品经理', 101, 103, 5,
 '负责流程、OA 与 HR 产品需求设计与版本管理', '熟悉原型设计、需求拆解和数据驱动优化', '输出需求文档、原型与版本验收标准', 1, '2026-03-21 09:25:00', '2026-03-21 09:25:00'),
(113, 100000, 'DELIVERY_CONSULTANT_P3', '实施顾问', 102, 102, 6,
 '负责客户现场实施、培训和上线支持', '熟悉流程配置、权限模型与项目交付方法论', '执行实施计划、培训客户管理员并收敛问题清单', 1, '2026-03-21 09:30:00', '2026-03-21 09:30:00'),
(114, 100000, 'CUSTOMER_SUCCESS_P3', '客户成功专员', 103, 102, 7,
 '负责客户活跃度、续约推进与经营分析', '具备客户沟通、经营计划和续约跟进能力', '跟进续约、使用情况和重点客户问题闭环', 1, '2026-03-21 09:35:00', '2026-03-21 09:35:00'),
(115, 100000, 'SALES_CONSULTANT_P3', '销售顾问', 103, 102, 8,
 '负责重点商机跟进、方案讲解和合同推进', '具备企业软件销售与行业方案沟通能力', '推进客户拜访、方案演示和签约流程', 1, '2026-03-21 09:40:00', '2026-03-21 09:40:00'),
(116, 100000, 'DEVOPS_P3', '运维工程师', 100, 102, 9,
 '负责环境巡检、发布保障和性能告警处理', '熟悉 CI/CD、监控平台和故障应急处理', '执行发布、巡检、备份和告警响应', 1, '2026-03-21 09:45:00', '2026-03-21 09:45:00'),
(117, 100000, 'QA_P3', '测试工程师', 100, 102, 10,
 '负责测试计划、回归验证与上线质量把控', '熟悉 Web 测试、接口测试和自动化用例设计', '执行测试用例、输出缺陷报告与上线验收', 1, '2026-03-21 09:50:00', '2026-03-21 09:50:00')
ON DUPLICATE KEY UPDATE
  position_name = VALUES(position_name),
  family_id = VALUES(family_id),
  level_id = VALUES(level_id),
  post_id = VALUES(post_id),
  job_description = VALUES(job_description),
  requirements = VALUES(requirements),
  work_content = VALUES(work_content),
  status = VALUES(status),
  update_time = VALUES(update_time);

INSERT INTO cloud_flow_db.hr_employee (
  id, tenant_id, employee_no, name, gender, birth_date, phone, email, dept_id, post_id, position_id,
  employee_type, employee_status, hire_date, regular_date, resign_date, user_id,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(1010, 100000, 'CF20240021', '孙雨澄', 'MALE', '1989-08-16', '13800010110', 'sun.pm@cloudflow.com', 109, 2, 107,
 'FULL_TIME', 'REGULAR', '2024-01-15', '2024-07-15', NULL, 10, '2026-03-21 10:00:00', '2026-03-21 10:00:00', 'admin', 'admin', 0),
(1011, 100000, 'CF20230112', '吴思远', 'MALE', '1990-03-09', '13800010111', 'wu.delivery@cloudflow.com', 110, 2, 108,
 'FULL_TIME', 'REGULAR', '2023-11-06', '2024-05-06', NULL, 11, '2026-03-21 10:05:00', '2026-03-21 10:05:00', 'admin', 'admin', 0),
(1012, 100000, 'CF20240018', '郑雅宁', 'FEMALE', '1992-07-23', '13800010112', 'zheng.cs@cloudflow.com', 111, 2, 109,
 'FULL_TIME', 'REGULAR', '2024-03-11', '2024-09-11', NULL, 12, '2026-03-21 10:10:00', '2026-03-21 10:10:00', 'admin', 'admin', 0),
(1013, 100000, 'CF20230019', '何嘉树', 'MALE', '1988-11-02', '13800010113', 'he.sales@cloudflow.com', 112, 2, 110,
 'FULL_TIME', 'REGULAR', '2023-08-21', '2024-02-21', NULL, 13, '2026-03-21 10:15:00', '2026-03-21 10:15:00', 'admin', 'admin', 0),
(1014, 100000, 'CF20240025', '唐志远', 'MALE', '1991-01-17', '13800010114', 'tang.ops@cloudflow.com', 113, 2, 111,
 'FULL_TIME', 'REGULAR', '2024-02-19', '2024-08-19', NULL, 14, '2026-03-21 10:20:00', '2026-03-21 10:20:00', 'admin', 'admin', 0),
(1015, 100000, 'CF20240101', '宋清妍', 'FEMALE', '1995-05-12', '13800010115', 'song.product@cloudflow.com', 114, 5, 112,
 'FULL_TIME', 'REGULAR', '2024-10-08', '2025-04-08', NULL, 15, '2026-03-21 10:25:00', '2026-03-21 10:25:00', 'admin', 'admin', 0),
(1016, 100000, 'CF20260011', '高牧', 'MALE', '1997-02-14', '13800010116', 'gao.delivery@cloudflow.com', 115, 6, 113,
 'FULL_TIME', 'PROBATION', '2026-01-15', '2026-07-15', NULL, 16, '2026-03-21 10:30:00', '2026-03-21 10:30:00', 'admin', 'admin', 0),
(1017, 100000, 'CF20250014', '徐珂', 'FEMALE', '1996-10-30', '13800010117', 'xu.cs@cloudflow.com', 116, 7, 114,
 'FULL_TIME', 'REGULAR', '2025-05-12', '2025-11-12', NULL, 17, '2026-03-21 10:35:00', '2026-03-21 10:35:00', 'admin', 'admin', 0),
(1018, 100000, 'CF20240028', '彭骁', 'MALE', '1994-09-07', '13800010118', 'peng.sales@cloudflow.com', 117, 8, 115,
 'FULL_TIME', 'REGULAR', '2024-09-09', '2025-03-09', NULL, 18, '2026-03-21 10:40:00', '2026-03-21 10:40:00', 'admin', 'admin', 0),
(1019, 100000, 'CF20240116', '许磊', 'MALE', '1995-12-19', '13800010119', 'xu.ops@cloudflow.com', 118, 9, 116,
 'FULL_TIME', 'REGULAR', '2024-12-02', '2025-06-02', NULL, 19, '2026-03-21 10:45:00', '2026-03-21 10:45:00', 'admin', 'admin', 0),
(1020, 100000, 'CF20260015', '韩悦', 'FEMALE', '1998-04-21', '13800010120', 'han.qa@cloudflow.com', 119, 10, 117,
 'FULL_TIME', 'PROBATION', '2026-02-03', '2026-08-03', NULL, 20, '2026-03-21 10:50:00', '2026-03-21 10:50:00', 'admin', 'admin', 0)
ON DUPLICATE KEY UPDATE
  employee_no = VALUES(employee_no),
  name = VALUES(name),
  gender = VALUES(gender),
  birth_date = VALUES(birth_date),
  phone = VALUES(phone),
  email = VALUES(email),
  dept_id = VALUES(dept_id),
  post_id = VALUES(post_id),
  position_id = VALUES(position_id),
  employee_type = VALUES(employee_type),
  employee_status = VALUES(employee_status),
  hire_date = VALUES(hire_date),
  regular_date = VALUES(regular_date),
  resign_date = VALUES(resign_date),
  user_id = VALUES(user_id),
  update_time = VALUES(update_time),
  update_by = VALUES(update_by),
  deleted = VALUES(deleted);

INSERT INTO cloud_flow_db.hr_performance_objective (
  id, tenant_id, objective_no, cycle_name, cycle_start_date, cycle_end_date,
  objective_name, total_target_amount, category_codes, category_config, metric_config,
  score_cap, archived_actual_amount, archived_completion_rate, archived_capped_rate,
  archived_score, archived_grade, archived_time, archive_snapshot,
  plan_process_instance_id, result_process_instance_id, status,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(910001, 100000, 'PF_DEMO_SALES_MULTI_2026Q2', '2026 Q2', '2026-04-01', '2026-06-30',
 '销售部多类型多指标绩效演示', 0.0000, 'CORE_GOODS,NEW_CUSTOMER',
 '[{"categoryCode":"CORE_GOODS","categoryName":"核心产品线"},{"categoryCode":"NEW_CUSTOMER","categoryName":"新签客户包"}]',
 '[{"metricCode":"SALES_AMOUNT","metricName":"销售额","metricUnit":"元","valueType":"DECIMAL","precision":2,"metricWeight":60},{"metricCode":"SALES_QTY","metricName":"销售量","metricUnit":"件","valueType":"INTEGER","precision":0,"metricWeight":40}]',
 120.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'seed_perf_plan_910001', NULL, 'PLAN_APPROVED',
 NOW(), NOW(), 'admin', 'admin', 0),
(910002, 100000, 'PF_DEMO_DELIVERY_COUNT_2026Q2', '2026 Q2', '2026-04-01', '2026-06-30',
 '交付部数量指标绩效演示', 48.0000, 'PROJECT_DELIVERY',
 '[{"categoryCode":"PROJECT_DELIVERY","categoryName":"项目交付"}]',
 '[{"metricCode":"DELIVERY_COUNT","metricName":"交付件数","metricUnit":"件","valueType":"INTEGER","precision":0,"metricWeight":100}]',
 120.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'seed_perf_plan_910002', NULL, 'PLAN_APPROVED',
 NOW(), NOW(), 'admin', 'admin', 0),
(910003, 100000, 'PF_DEMO_CASCADE_MULTI_DEPT_2026Q2', '2026 Q2', '2026-04-01', '2026-06-30',
 '多部门级联与多层拆解演示', 120.0000, 'SALES_PIPELINE,DELIVERY_TASK',
 '[{"categoryCode":"SALES_PIPELINE","categoryName":"销售商机推进"},{"categoryCode":"DELIVERY_TASK","categoryName":"交付任务闭环"}]',
 '[{"metricCode":"TASK_COUNT","metricName":"任务数量","metricUnit":"件","valueType":"INTEGER","precision":0,"metricWeight":100}]',
 120.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'seed_perf_plan_910003', NULL, 'PLAN_APPROVED',
 NOW(), NOW(), 'admin', 'admin', 0),
(910004, 100000, 'PF_DEMO_DRAFT_PERCENT_2026Q3', '2026 Q3', '2026-07-01', '2026-09-30',
 '草稿百分比指标演示', 95.0000, 'QUALITY',
 '[{"categoryCode":"QUALITY","categoryName":"质量目标"}]',
 '[{"metricCode":"PASS_RATE","metricName":"验收通过率","metricUnit":"%","valueType":"PERCENT","precision":2,"metricWeight":100}]',
 120.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'DRAFT',
 NOW(), NOW(), 'admin', 'admin', 0),
(910005, 100000, 'PF_DEMO_PLAN_APPROVING_2026Q3', '2026 Q3', '2026-07-01', '2026-09-30',
 '计划审批中状态演示', 20.0000, 'ROADMAP',
 '[{"categoryCode":"ROADMAP","categoryName":"路线图事项"}]',
 '[{"metricCode":"ITEM_COUNT","metricName":"事项数量","metricUnit":"个","valueType":"INTEGER","precision":0,"metricWeight":100}]',
 120.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'seed_perf_plan_910005', NULL, 'PLAN_APPROVING',
 NOW(), NOW(), 'admin', 'admin', 0),
(910006, 100000, 'PF_DEMO_RESULT_APPROVING_LOW_2026Q2', '2026 Q2', '2026-04-01', '2026-06-30',
 '结果审批中低完成率演示', 200000.0000, 'CUSTOMER_RENEWAL',
 '[{"categoryCode":"CUSTOMER_RENEWAL","categoryName":"客户续约"}]',
 '[{"metricCode":"RENEWAL_AMOUNT","metricName":"续约额","metricUnit":"元","valueType":"DECIMAL","precision":2,"metricWeight":100}]',
 120.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'seed_perf_plan_910006', 'seed_perf_result_910006', 'RESULT_APPROVING',
 NOW(), NOW(), 'admin', 'admin', 0),
(910007, 100000, 'PF_DEMO_COMPLETED_ARCHIVE_CAP_2026Q1', '2026 Q1', '2026-01-01', '2026-03-31',
 '归档超额封顶与调薪联动演示', 100000.0000, 'KEY_ACCOUNT',
 '[{"categoryCode":"KEY_ACCOUNT","categoryName":"重点客户"}]',
 '[{"metricCode":"SALES_AMOUNT","metricName":"销售额","metricUnit":"元","valueType":"DECIMAL","precision":2,"metricWeight":100}]',
 120.00, 150000.0000, 150.00, 120.00, 120.00, 'S', '2026-04-02 10:00:00',
 '{"id":910007,"objectiveNo":"PF_DEMO_COMPLETED_ARCHIVE_CAP_2026Q1","cycleName":"2026 Q1","cycleStartDate":"2026-01-01","cycleEndDate":"2026-03-31","objectiveName":"归档超额封顶与调薪联动演示","totalTargetAmount":100000.00,"actualAmount":150000.00,"completionRate":150.00,"cappedRate":120.00,"score":120.00,"grade":"S","categoryCodes":["KEY_ACCOUNT"],"categoryDefinitions":[{"categoryCode":"KEY_ACCOUNT","categoryName":"重点客户"}],"metrics":[{"metricCode":"SALES_AMOUNT","metricName":"销售额","metricUnit":"元","valueType":"DECIMAL","precision":2,"metricWeight":100}],"scoreCap":120.00,"archivedActualAmount":150000.00,"archivedCompletionRate":150.00,"archivedCappedRate":120.00,"archivedScore":120.00,"archivedGrade":"S","archivedTime":"2026-04-02T10:00:00","planProcessInstanceId":"seed_perf_plan_910007","resultProcessInstanceId":"seed_perf_result_910007","status":"COMPLETED","departmentCount":1,"leafTaskCount":2,"createTime":"2026-01-02T09:00:00","updateTime":"2026-04-02T10:00:00","assignments":[{"id":920701,"objectiveId":910007,"parentId":null,"nodeKey":"ROOT:DEPT:112","assigneeType":"DEPT","assigneeId":112,"assigneeName":"销售部","categoryCode":null,"categoryName":null,"metricCode":null,"metricName":null,"metricUnit":null,"metricValueType":null,"metricPrecision":2,"metricWeight":100.00,"targetAmount":100000.00,"actualAmount":150000.00,"completionRate":150.00,"cappedRate":120.00,"score":120.00,"grade":"S","quotaSource":"MANAGER","locked":true,"ownerEmployeeId":1013,"sortOrder":1,"status":"COMPLETED","createTime":"2026-01-02T09:00:00","updateTime":"2026-04-02T10:00:00","children":[{"id":920710,"objectiveId":910007,"parentId":920701,"nodeKey":"CATEGORY:920701:KEY_ACCOUNT:SALES_AMOUNT","assigneeType":"DEPT","assigneeId":112,"assigneeName":"销售部","categoryCode":"KEY_ACCOUNT","categoryName":"重点客户","metricCode":"SALES_AMOUNT","metricName":"销售额","metricUnit":"元","metricValueType":"DECIMAL","metricPrecision":2,"metricWeight":100.00,"targetAmount":100000.00,"actualAmount":150000.00,"completionRate":150.00,"cappedRate":120.00,"score":120.00,"grade":"S","quotaSource":"MANAGER","locked":true,"ownerEmployeeId":1013,"sortOrder":1,"status":"COMPLETED","createTime":"2026-01-02T09:00:00","updateTime":"2026-04-02T10:00:00","children":[{"id":920711,"objectiveId":910007,"parentId":920710,"nodeKey":"EMPLOYEE:920710:1013","assigneeType":"EMPLOYEE","assigneeId":1013,"assigneeName":"何嘉树","categoryCode":"KEY_ACCOUNT","categoryName":"重点客户","metricCode":"SALES_AMOUNT","metricName":"销售额","metricUnit":"元","metricValueType":"DECIMAL","metricPrecision":2,"metricWeight":100.00,"targetAmount":40000.00,"actualAmount":70000.00,"completionRate":175.00,"cappedRate":120.00,"score":120.00,"grade":"S","quotaSource":"DEPT_OWNER","locked":false,"ownerEmployeeId":1013,"sortOrder":1,"status":"COMPLETED","createTime":"2026-01-02T09:00:00","updateTime":"2026-04-02T10:00:00","children":[]},{"id":920712,"objectiveId":910007,"parentId":920710,"nodeKey":"EMPLOYEE:920710:1018","assigneeType":"EMPLOYEE","assigneeId":1018,"assigneeName":"彭骁","categoryCode":"KEY_ACCOUNT","categoryName":"重点客户","metricCode":"SALES_AMOUNT","metricName":"销售额","metricUnit":"元","metricValueType":"DECIMAL","metricPrecision":2,"metricWeight":100.00,"targetAmount":60000.00,"actualAmount":80000.00,"completionRate":133.33,"cappedRate":120.00,"score":120.00,"grade":"S","quotaSource":"DEPT_OWNER","locked":false,"ownerEmployeeId":1013,"sortOrder":2,"status":"COMPLETED","createTime":"2026-01-02T09:00:00","updateTime":"2026-04-02T10:00:00","children":[]}]}]}]}',
 'seed_perf_plan_910007', 'seed_perf_result_910007', 'COMPLETED',
 '2026-01-02 09:00:00', '2026-04-02 10:00:00', 'admin', 'admin', 0),
(910008, 100000, 'PF_DEMO_REJECTED_2026Q3', '2026 Q3', '2026-07-01', '2026-09-30',
 '已驳回绩效计划演示', 30.0000, 'OPS_CHECK',
 '[{"categoryCode":"OPS_CHECK","categoryName":"运维巡检"}]',
 '[{"metricCode":"CHECK_COUNT","metricName":"巡检次数","metricUnit":"次","valueType":"INTEGER","precision":0,"metricWeight":100}]',
 120.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'seed_perf_plan_910008', NULL, 'REJECTED',
 NOW(), NOW(), 'admin', 'admin', 0);

INSERT INTO cloud_flow_db.hr_performance_assignment (
  id, tenant_id, objective_id, parent_id, node_key, assignee_type, assignee_id, assignee_name,
  category_code, category_name, metric_code, metric_name, metric_unit, metric_value_type,
  metric_precision, metric_weight, target_amount, actual_amount, quota_source, locked,
  owner_employee_id, sort_order, status, create_time, update_time, create_by, update_by, deleted
) VALUES
-- 910001：销售额 + 销售量，多类型多权重。
(920001, 100000, 910001, NULL, 'ROOT:DEPT:112', 'DEPT', 112, '销售部', NULL, NULL, NULL, NULL, NULL, NULL, 2, 100.00, 0.0000, 0.0000, 'MANAGER', 1, 1013, 1, 'PLAN_APPROVED', NOW(), NOW(), 'admin', 'admin', 0),
(920010, 100000, 910001, 920001, 'CATEGORY:920001:CORE_GOODS:SALES_AMOUNT', 'DEPT', 112, '销售部', 'CORE_GOODS', '核心产品线', 'SALES_AMOUNT', '销售额', '元', 'DECIMAL', 2, 35.00, 120000.0000, 98000.0000, 'MANAGER', 1, 1013, 1, 'PLAN_APPROVED', NOW(), NOW(), 'admin', 'admin', 0),
(920011, 100000, 910001, 920010, 'EMPLOYEE:920010:1013', 'EMPLOYEE', 1013, '何嘉树', 'CORE_GOODS', '核心产品线', 'SALES_AMOUNT', '销售额', '元', 'DECIMAL', 2, 35.00, 60000.0000, 50000.0000, 'DEPT_OWNER', 0, 1013, 1, 'PLAN_APPROVED', NOW(), NOW(), 'admin', 'admin', 0),
(920012, 100000, 910001, 920010, 'EMPLOYEE:920010:1018', 'EMPLOYEE', 1018, '彭骁', 'CORE_GOODS', '核心产品线', 'SALES_AMOUNT', '销售额', '元', 'DECIMAL', 2, 35.00, 60000.0000, 48000.0000, 'DEPT_OWNER', 0, 1013, 2, 'PLAN_APPROVED', NOW(), NOW(), 'admin', 'admin', 0),
(920020, 100000, 910001, 920001, 'CATEGORY:920001:CORE_GOODS:SALES_QTY', 'DEPT', 112, '销售部', 'CORE_GOODS', '核心产品线', 'SALES_QTY', '销售量', '件', 'INTEGER', 0, 25.00, 240.0000, 232.0000, 'MANAGER', 1, 1013, 2, 'PLAN_APPROVED', NOW(), NOW(), 'admin', 'admin', 0),
(920021, 100000, 910001, 920020, 'EMPLOYEE:920020:1013', 'EMPLOYEE', 1013, '何嘉树', 'CORE_GOODS', '核心产品线', 'SALES_QTY', '销售量', '件', 'INTEGER', 0, 25.00, 100.0000, 96.0000, 'DEPT_OWNER', 0, 1013, 1, 'PLAN_APPROVED', NOW(), NOW(), 'admin', 'admin', 0),
(920022, 100000, 910001, 920020, 'EMPLOYEE:920020:1018', 'EMPLOYEE', 1018, '彭骁', 'CORE_GOODS', '核心产品线', 'SALES_QTY', '销售量', '件', 'INTEGER', 0, 25.00, 140.0000, 136.0000, 'DEPT_OWNER', 0, 1013, 2, 'PLAN_APPROVED', NOW(), NOW(), 'admin', 'admin', 0),
(920030, 100000, 910001, 920001, 'CATEGORY:920001:NEW_CUSTOMER:SALES_AMOUNT', 'DEPT', 112, '销售部', 'NEW_CUSTOMER', '新签客户包', 'SALES_AMOUNT', '销售额', '元', 'DECIMAL', 2, 25.00, 80000.0000, 76000.0000, 'MANAGER', 1, 1013, 3, 'PLAN_APPROVED', NOW(), NOW(), 'admin', 'admin', 0),
(920031, 100000, 910001, 920030, 'EMPLOYEE:920030:1013', 'EMPLOYEE', 1013, '何嘉树', 'NEW_CUSTOMER', '新签客户包', 'SALES_AMOUNT', '销售额', '元', 'DECIMAL', 2, 25.00, 30000.0000, 32000.0000, 'DEPT_OWNER', 0, 1013, 1, 'PLAN_APPROVED', NOW(), NOW(), 'admin', 'admin', 0),
(920032, 100000, 910001, 920030, 'EMPLOYEE:920030:1018', 'EMPLOYEE', 1018, '彭骁', 'NEW_CUSTOMER', '新签客户包', 'SALES_AMOUNT', '销售额', '元', 'DECIMAL', 2, 25.00, 50000.0000, 44000.0000, 'DEPT_OWNER', 0, 1013, 2, 'PLAN_APPROVED', NOW(), NOW(), 'admin', 'admin', 0),
(920040, 100000, 910001, 920001, 'CATEGORY:920001:NEW_CUSTOMER:SALES_QTY', 'DEPT', 112, '销售部', 'NEW_CUSTOMER', '新签客户包', 'SALES_QTY', '销售量', '件', 'INTEGER', 0, 15.00, 160.0000, 150.0000, 'MANAGER', 1, 1013, 4, 'PLAN_APPROVED', NOW(), NOW(), 'admin', 'admin', 0),
(920041, 100000, 910001, 920040, 'EMPLOYEE:920040:1013', 'EMPLOYEE', 1013, '何嘉树', 'NEW_CUSTOMER', '新签客户包', 'SALES_QTY', '销售量', '件', 'INTEGER', 0, 15.00, 60.0000, 62.0000, 'DEPT_OWNER', 0, 1013, 1, 'PLAN_APPROVED', NOW(), NOW(), 'admin', 'admin', 0),
(920042, 100000, 910001, 920040, 'EMPLOYEE:920040:1018', 'EMPLOYEE', 1018, '彭骁', 'NEW_CUSTOMER', '新签客户包', 'SALES_QTY', '销售量', '件', 'INTEGER', 0, 15.00, 100.0000, 88.0000, 'DEPT_OWNER', 0, 1013, 2, 'PLAN_APPROVED', NOW(), NOW(), 'admin', 'admin', 0),

-- 910002：非销售额，数量单位为件。
(920101, 100000, 910002, NULL, 'ROOT:DEPT:110', 'DEPT', 110, '实施交付部', NULL, NULL, NULL, NULL, NULL, NULL, 0, 100.00, 48.0000, 42.0000, 'MANAGER', 1, 1011, 1, 'PLAN_APPROVED', NOW(), NOW(), 'admin', 'admin', 0),
(920110, 100000, 910002, 920101, 'CATEGORY:920101:PROJECT_DELIVERY:DELIVERY_COUNT', 'DEPT', 110, '实施交付部', 'PROJECT_DELIVERY', '项目交付', 'DELIVERY_COUNT', '交付件数', '件', 'INTEGER', 0, 100.00, 48.0000, 42.0000, 'MANAGER', 1, 1011, 1, 'PLAN_APPROVED', NOW(), NOW(), 'admin', 'admin', 0),
(920111, 100000, 910002, 920110, 'EMPLOYEE:920110:1011', 'EMPLOYEE', 1011, '吴思远', 'PROJECT_DELIVERY', '项目交付', 'DELIVERY_COUNT', '交付件数', '件', 'INTEGER', 0, 100.00, 22.0000, 20.0000, 'DEPT_OWNER', 0, 1011, 1, 'PLAN_APPROVED', NOW(), NOW(), 'admin', 'admin', 0),
(920112, 100000, 910002, 920110, 'EMPLOYEE:920110:1016', 'EMPLOYEE', 1016, '高牧', 'PROJECT_DELIVERY', '项目交付', 'DELIVERY_COUNT', '交付件数', '件', 'INTEGER', 0, 100.00, 26.0000, 22.0000, 'DEPT_OWNER', 0, 1011, 2, 'PLAN_APPROVED', NOW(), NOW(), 'admin', 'admin', 0),

-- 910003：根部门 -> 子部门 -> 类型指标 -> 员工，多部门级联。
(920201, 100000, 910003, NULL, 'ROOT:DEPT:112', 'DEPT', 112, '销售部', NULL, NULL, NULL, NULL, NULL, NULL, 0, 100.00, 70.0000, 62.0000, 'MANAGER', 1, 1013, 1, 'PLAN_APPROVED', NOW(), NOW(), 'admin', 'admin', 0),
(920202, 100000, 910003, 920201, 'DEPT:920201:117', 'DEPT', 117, '华东销售组', NULL, NULL, NULL, NULL, NULL, NULL, 0, 100.00, 70.0000, 62.0000, 'DEPT_OWNER', 1, 1018, 1, 'PLAN_APPROVED', NOW(), NOW(), 'admin', 'admin', 0),
(920210, 100000, 910003, 920202, 'CATEGORY:920202:SALES_PIPELINE:TASK_COUNT', 'DEPT', 117, '华东销售组', 'SALES_PIPELINE', '销售商机推进', 'TASK_COUNT', '任务数量', '件', 'INTEGER', 0, 60.00, 70.0000, 62.0000, 'DEPT_OWNER', 1, 1018, 1, 'PLAN_APPROVED', NOW(), NOW(), 'admin', 'admin', 0),
(920211, 100000, 910003, 920210, 'EMPLOYEE:920210:1013', 'EMPLOYEE', 1013, '何嘉树', 'SALES_PIPELINE', '销售商机推进', 'TASK_COUNT', '任务数量', '件', 'INTEGER', 0, 60.00, 30.0000, 28.0000, 'DEPT_OWNER', 0, 1018, 1, 'PLAN_APPROVED', NOW(), NOW(), 'admin', 'admin', 0),
(920212, 100000, 910003, 920210, 'EMPLOYEE:920210:1018', 'EMPLOYEE', 1018, '彭骁', 'SALES_PIPELINE', '销售商机推进', 'TASK_COUNT', '任务数量', '件', 'INTEGER', 0, 60.00, 40.0000, 34.0000, 'DEPT_OWNER', 0, 1018, 2, 'PLAN_APPROVED', NOW(), NOW(), 'admin', 'admin', 0),
(920231, 100000, 910003, NULL, 'ROOT:DEPT:110', 'DEPT', 110, '实施交付部', NULL, NULL, NULL, NULL, NULL, NULL, 0, 100.00, 50.0000, 44.0000, 'MANAGER', 1, 1011, 2, 'PLAN_APPROVED', NOW(), NOW(), 'admin', 'admin', 0),
(920232, 100000, 910003, 920231, 'DEPT:920231:115', 'DEPT', 115, '交付一组', NULL, NULL, NULL, NULL, NULL, NULL, 0, 100.00, 50.0000, 44.0000, 'DEPT_OWNER', 1, 1016, 1, 'PLAN_APPROVED', NOW(), NOW(), 'admin', 'admin', 0),
(920240, 100000, 910003, 920232, 'CATEGORY:920232:DELIVERY_TASK:TASK_COUNT', 'DEPT', 115, '交付一组', 'DELIVERY_TASK', '交付任务闭环', 'TASK_COUNT', '任务数量', '件', 'INTEGER', 0, 40.00, 50.0000, 44.0000, 'DEPT_OWNER', 1, 1016, 1, 'PLAN_APPROVED', NOW(), NOW(), 'admin', 'admin', 0),
(920241, 100000, 910003, 920240, 'EMPLOYEE:920240:1011', 'EMPLOYEE', 1011, '吴思远', 'DELIVERY_TASK', '交付任务闭环', 'TASK_COUNT', '任务数量', '件', 'INTEGER', 0, 40.00, 20.0000, 18.0000, 'DEPT_OWNER', 0, 1016, 1, 'PLAN_APPROVED', NOW(), NOW(), 'admin', 'admin', 0),
(920242, 100000, 910003, 920240, 'EMPLOYEE:920240:1016', 'EMPLOYEE', 1016, '高牧', 'DELIVERY_TASK', '交付任务闭环', 'TASK_COUNT', '任务数量', '件', 'INTEGER', 0, 40.00, 30.0000, 26.0000, 'DEPT_OWNER', 0, 1016, 2, 'PLAN_APPROVED', NOW(), NOW(), 'admin', 'admin', 0),

-- 910004：草稿 + 百分比指标。
(920301, 100000, 910004, NULL, 'ROOT:DEPT:119', 'DEPT', 119, '测试组', NULL, NULL, NULL, NULL, NULL, NULL, 2, 100.00, 95.0000, 0.0000, 'MANAGER', 1, 1020, 1, 'DRAFT', NOW(), NOW(), 'admin', 'admin', 0),
(920310, 100000, 910004, 920301, 'CATEGORY:920301:QUALITY:PASS_RATE', 'DEPT', 119, '测试组', 'QUALITY', '质量目标', 'PASS_RATE', '验收通过率', '%', 'PERCENT', 2, 100.00, 95.0000, 0.0000, 'MANAGER', 1, 1020, 1, 'DRAFT', NOW(), NOW(), 'admin', 'admin', 0),
(920311, 100000, 910004, 920310, 'EMPLOYEE:920310:1020', 'EMPLOYEE', 1020, '韩悦', 'QUALITY', '质量目标', 'PASS_RATE', '验收通过率', '%', 'PERCENT', 2, 100.00, 95.0000, 0.0000, 'DEPT_OWNER', 0, 1020, 1, 'DRAFT', NOW(), NOW(), 'admin', 'admin', 0),

-- 910005：计划审批中。
(920401, 100000, 910005, NULL, 'ROOT:DEPT:109', 'DEPT', 109, '产品部', NULL, NULL, NULL, NULL, NULL, NULL, 0, 100.00, 20.0000, 0.0000, 'MANAGER', 1, 1010, 1, 'PLAN_APPROVING', NOW(), NOW(), 'admin', 'admin', 0),
(920410, 100000, 910005, 920401, 'CATEGORY:920401:ROADMAP:ITEM_COUNT', 'DEPT', 109, '产品部', 'ROADMAP', '路线图事项', 'ITEM_COUNT', '事项数量', '个', 'INTEGER', 0, 100.00, 20.0000, 0.0000, 'MANAGER', 1, 1010, 1, 'PLAN_APPROVING', NOW(), NOW(), 'admin', 'admin', 0),
(920411, 100000, 910005, 920410, 'EMPLOYEE:920410:1010', 'EMPLOYEE', 1010, '孙雨澄', 'ROADMAP', '路线图事项', 'ITEM_COUNT', '事项数量', '个', 'INTEGER', 0, 100.00, 12.0000, 0.0000, 'DEPT_OWNER', 0, 1010, 1, 'PLAN_APPROVING', NOW(), NOW(), 'admin', 'admin', 0),
(920412, 100000, 910005, 920410, 'EMPLOYEE:920410:1015', 'EMPLOYEE', 1015, '宋清妍', 'ROADMAP', '路线图事项', 'ITEM_COUNT', '事项数量', '个', 'INTEGER', 0, 100.00, 8.0000, 0.0000, 'DEPT_OWNER', 0, 1010, 2, 'PLAN_APPROVING', NOW(), NOW(), 'admin', 'admin', 0),

-- 910006：结果审批中 + 低完成率。
(920501, 100000, 910006, NULL, 'ROOT:DEPT:111', 'DEPT', 111, '客户成功部', NULL, NULL, NULL, NULL, NULL, NULL, 2, 100.00, 200000.0000, 80000.0000, 'MANAGER', 1, 1012, 1, 'RESULT_APPROVING', NOW(), NOW(), 'admin', 'admin', 0),
(920510, 100000, 910006, 920501, 'CATEGORY:920501:CUSTOMER_RENEWAL:RENEWAL_AMOUNT', 'DEPT', 111, '客户成功部', 'CUSTOMER_RENEWAL', '客户续约', 'RENEWAL_AMOUNT', '续约额', '元', 'DECIMAL', 2, 100.00, 200000.0000, 80000.0000, 'MANAGER', 1, 1012, 1, 'RESULT_APPROVING', NOW(), NOW(), 'admin', 'admin', 0),
(920511, 100000, 910006, 920510, 'EMPLOYEE:920510:1012', 'EMPLOYEE', 1012, '郑雅宁', 'CUSTOMER_RENEWAL', '客户续约', 'RENEWAL_AMOUNT', '续约额', '元', 'DECIMAL', 2, 100.00, 100000.0000, 50000.0000, 'DEPT_OWNER', 0, 1012, 1, 'RESULT_APPROVING', NOW(), NOW(), 'admin', 'admin', 0),
(920512, 100000, 910006, 920510, 'EMPLOYEE:920510:1017', 'EMPLOYEE', 1017, '徐珂', 'CUSTOMER_RENEWAL', '客户续约', 'RENEWAL_AMOUNT', '续约额', '元', 'DECIMAL', 2, 100.00, 100000.0000, 30000.0000, 'DEPT_OWNER', 0, 1012, 2, 'RESULT_APPROVING', NOW(), NOW(), 'admin', 'admin', 0),

-- 910007：已归档 + 超额封顶，另有来源调薪单。
(920701, 100000, 910007, NULL, 'ROOT:DEPT:112', 'DEPT', 112, '销售部', NULL, NULL, NULL, NULL, NULL, NULL, 2, 100.00, 100000.0000, 150000.0000, 'MANAGER', 1, 1013, 1, 'COMPLETED', '2026-01-02 09:00:00', '2026-04-02 10:00:00', 'admin', 'admin', 0),
(920710, 100000, 910007, 920701, 'CATEGORY:920701:KEY_ACCOUNT:SALES_AMOUNT', 'DEPT', 112, '销售部', 'KEY_ACCOUNT', '重点客户', 'SALES_AMOUNT', '销售额', '元', 'DECIMAL', 2, 100.00, 100000.0000, 150000.0000, 'MANAGER', 1, 1013, 1, 'COMPLETED', '2026-01-02 09:00:00', '2026-04-02 10:00:00', 'admin', 'admin', 0),
(920711, 100000, 910007, 920710, 'EMPLOYEE:920710:1013', 'EMPLOYEE', 1013, '何嘉树', 'KEY_ACCOUNT', '重点客户', 'SALES_AMOUNT', '销售额', '元', 'DECIMAL', 2, 100.00, 40000.0000, 70000.0000, 'DEPT_OWNER', 0, 1013, 1, 'COMPLETED', '2026-01-02 09:00:00', '2026-04-02 10:00:00', 'admin', 'admin', 0),
(920712, 100000, 910007, 920710, 'EMPLOYEE:920710:1018', 'EMPLOYEE', 1018, '彭骁', 'KEY_ACCOUNT', '重点客户', 'SALES_AMOUNT', '销售额', '元', 'DECIMAL', 2, 100.00, 60000.0000, 80000.0000, 'DEPT_OWNER', 0, 1013, 2, 'COMPLETED', '2026-01-02 09:00:00', '2026-04-02 10:00:00', 'admin', 'admin', 0),

-- 910008：已驳回。
(920801, 100000, 910008, NULL, 'ROOT:DEPT:113', 'DEPT', 113, '运维部', NULL, NULL, NULL, NULL, NULL, NULL, 0, 100.00, 30.0000, 0.0000, 'MANAGER', 1, 1014, 1, 'REJECTED', NOW(), NOW(), 'admin', 'admin', 0),
(920810, 100000, 910008, 920801, 'CATEGORY:920801:OPS_CHECK:CHECK_COUNT', 'DEPT', 113, '运维部', 'OPS_CHECK', '运维巡检', 'CHECK_COUNT', '巡检次数', '次', 'INTEGER', 0, 100.00, 30.0000, 0.0000, 'MANAGER', 1, 1014, 1, 'REJECTED', NOW(), NOW(), 'admin', 'admin', 0),
(920811, 100000, 910008, 920810, 'EMPLOYEE:920810:1014', 'EMPLOYEE', 1014, '唐志远', 'OPS_CHECK', '运维巡检', 'CHECK_COUNT', '巡检次数', '次', 'INTEGER', 0, 100.00, 12.0000, 0.0000, 'DEPT_OWNER', 0, 1014, 1, 'REJECTED', NOW(), NOW(), 'admin', 'admin', 0),
(920812, 100000, 910008, 920810, 'EMPLOYEE:920810:1019', 'EMPLOYEE', 1019, '许磊', 'OPS_CHECK', '运维巡检', 'CHECK_COUNT', '巡检次数', '次', 'INTEGER', 0, 100.00, 18.0000, 0.0000, 'DEPT_OWNER', 0, 1014, 2, 'REJECTED', NOW(), NOW(), 'admin', 'admin', 0);

-- 兼容分段导入或旧数据残留：显式回填所有演示目标的指标配置和指标节点。
UPDATE cloud_flow_db.hr_performance_objective
SET category_codes = 'CORE_GOODS,NEW_CUSTOMER',
    category_config = '[{"categoryCode":"CORE_GOODS","categoryName":"核心产品线"},{"categoryCode":"NEW_CUSTOMER","categoryName":"新签客户包"}]',
    metric_config = '[{"metricCode":"SALES_AMOUNT","metricName":"销售额","metricUnit":"元","valueType":"DECIMAL","precision":2,"metricWeight":60},{"metricCode":"SALES_QTY","metricName":"销售量","metricUnit":"件","valueType":"INTEGER","precision":0,"metricWeight":40}]'
WHERE tenant_id = 100000 AND id = 910001;

UPDATE cloud_flow_db.hr_performance_objective
SET category_codes = 'PROJECT_DELIVERY',
    category_config = '[{"categoryCode":"PROJECT_DELIVERY","categoryName":"项目交付"}]',
    metric_config = '[{"metricCode":"DELIVERY_COUNT","metricName":"交付件数","metricUnit":"件","valueType":"INTEGER","precision":0,"metricWeight":100}]'
WHERE tenant_id = 100000 AND id = 910002;

UPDATE cloud_flow_db.hr_performance_objective
SET category_codes = 'SALES_PIPELINE,DELIVERY_TASK',
    category_config = '[{"categoryCode":"SALES_PIPELINE","categoryName":"销售商机推进"},{"categoryCode":"DELIVERY_TASK","categoryName":"交付任务闭环"}]',
    metric_config = '[{"metricCode":"TASK_COUNT","metricName":"任务数量","metricUnit":"件","valueType":"INTEGER","precision":0,"metricWeight":100}]',
    total_target_amount = 120.0000
WHERE tenant_id = 100000 AND id = 910003;

UPDATE cloud_flow_db.hr_performance_objective
SET category_codes = 'QUALITY',
    category_config = '[{"categoryCode":"QUALITY","categoryName":"质量目标"}]',
    metric_config = '[{"metricCode":"PASS_RATE","metricName":"验收通过率","metricUnit":"%","valueType":"PERCENT","precision":2,"metricWeight":100}]'
WHERE tenant_id = 100000 AND id = 910004;

UPDATE cloud_flow_db.hr_performance_objective
SET category_codes = 'ROADMAP',
    category_config = '[{"categoryCode":"ROADMAP","categoryName":"路线图事项"}]',
    metric_config = '[{"metricCode":"ITEM_COUNT","metricName":"事项数量","metricUnit":"个","valueType":"INTEGER","precision":0,"metricWeight":100}]'
WHERE tenant_id = 100000 AND id = 910005;

UPDATE cloud_flow_db.hr_performance_objective
SET category_codes = 'CUSTOMER_RENEWAL',
    category_config = '[{"categoryCode":"CUSTOMER_RENEWAL","categoryName":"客户续约"}]',
    metric_config = '[{"metricCode":"RENEWAL_AMOUNT","metricName":"续约额","metricUnit":"元","valueType":"DECIMAL","precision":2,"metricWeight":100}]'
WHERE tenant_id = 100000 AND id = 910006;

UPDATE cloud_flow_db.hr_performance_objective
SET category_codes = 'KEY_ACCOUNT',
    category_config = '[{"categoryCode":"KEY_ACCOUNT","categoryName":"重点客户"}]',
    metric_config = '[{"metricCode":"SALES_AMOUNT","metricName":"销售额","metricUnit":"元","valueType":"DECIMAL","precision":2,"metricWeight":100}]'
WHERE tenant_id = 100000 AND id = 910007;

UPDATE cloud_flow_db.hr_performance_objective
SET category_codes = 'OPS_CHECK',
    category_config = '[{"categoryCode":"OPS_CHECK","categoryName":"运维巡检"}]',
    metric_config = '[{"metricCode":"CHECK_COUNT","metricName":"巡检次数","metricUnit":"次","valueType":"INTEGER","precision":0,"metricWeight":100}]'
WHERE tenant_id = 100000 AND id = 910008;

UPDATE cloud_flow_db.hr_performance_assignment
SET metric_code = 'SALES_AMOUNT', metric_name = '销售额', metric_unit = '元', metric_value_type = 'DECIMAL', metric_precision = 2, metric_weight = 35.00
WHERE tenant_id = 100000 AND id IN (920010, 920011, 920012);

UPDATE cloud_flow_db.hr_performance_assignment
SET metric_code = 'SALES_QTY', metric_name = '销售量', metric_unit = '件', metric_value_type = 'INTEGER', metric_precision = 0, metric_weight = 25.00
WHERE tenant_id = 100000 AND id IN (920020, 920021, 920022);

UPDATE cloud_flow_db.hr_performance_assignment
SET metric_code = 'SALES_AMOUNT', metric_name = '销售额', metric_unit = '元', metric_value_type = 'DECIMAL', metric_precision = 2, metric_weight = 25.00
WHERE tenant_id = 100000 AND id IN (920030, 920031, 920032);

UPDATE cloud_flow_db.hr_performance_assignment
SET metric_code = 'SALES_QTY', metric_name = '销售量', metric_unit = '件', metric_value_type = 'INTEGER', metric_precision = 0, metric_weight = 15.00
WHERE tenant_id = 100000 AND id IN (920040, 920041, 920042);

UPDATE cloud_flow_db.hr_performance_assignment
SET metric_code = 'DELIVERY_COUNT', metric_name = '交付件数', metric_unit = '件', metric_value_type = 'INTEGER', metric_precision = 0, metric_weight = 100.00
WHERE tenant_id = 100000 AND id IN (920110, 920111, 920112);

UPDATE cloud_flow_db.hr_performance_assignment
SET metric_code = 'TASK_COUNT', metric_name = '任务数量', metric_unit = '件', metric_value_type = 'INTEGER', metric_precision = 0, metric_weight = 60.00
WHERE tenant_id = 100000 AND id IN (920210, 920211, 920212);

UPDATE cloud_flow_db.hr_performance_assignment
SET metric_code = 'TASK_COUNT', metric_name = '任务数量', metric_unit = '件', metric_value_type = 'INTEGER', metric_precision = 0, metric_weight = 40.00
WHERE tenant_id = 100000 AND id IN (920240, 920241, 920242);

UPDATE cloud_flow_db.hr_performance_assignment
SET metric_code = 'PASS_RATE', metric_name = '验收通过率', metric_unit = '%', metric_value_type = 'PERCENT', metric_precision = 2, metric_weight = 100.00
WHERE tenant_id = 100000 AND id IN (920310, 920311);

UPDATE cloud_flow_db.hr_performance_assignment
SET metric_code = 'ITEM_COUNT', metric_name = '事项数量', metric_unit = '个', metric_value_type = 'INTEGER', metric_precision = 0, metric_weight = 100.00
WHERE tenant_id = 100000 AND id IN (920410, 920411, 920412);

UPDATE cloud_flow_db.hr_performance_assignment
SET metric_code = 'RENEWAL_AMOUNT', metric_name = '续约额', metric_unit = '元', metric_value_type = 'DECIMAL', metric_precision = 2, metric_weight = 100.00
WHERE tenant_id = 100000 AND id IN (920510, 920511, 920512);

UPDATE cloud_flow_db.hr_performance_assignment
SET metric_code = 'SALES_AMOUNT', metric_name = '销售额', metric_unit = '元', metric_value_type = 'DECIMAL', metric_precision = 2, metric_weight = 100.00
WHERE tenant_id = 100000 AND id IN (920710, 920711, 920712);

UPDATE cloud_flow_db.hr_performance_assignment
SET metric_code = 'CHECK_COUNT', metric_name = '巡检次数', metric_unit = '次', metric_value_type = 'INTEGER', metric_precision = 0, metric_weight = 100.00
WHERE tenant_id = 100000 AND id IN (920810, 920811, 920812);

INSERT INTO cloud_flow_db.hr_salary_adjustment (
  id, tenant_id, application_no, employee_id, adjustment_type, adjustment_reason,
  before_salary_data, after_salary_data, before_total, after_total, adjustment_amount, adjustment_rate,
  effective_date, process_instance_id, source_type, source_id, status,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(910101, 100000, 'SA_PERF_DEMO_910007_1018', 1018, 'PERFORMANCE',
 '来源于归档绩效目标 PF_DEMO_COMPLETED_ARCHIVE_CAP_2026Q1，彭骁重点客户销售额超额完成，演示绩效调薪联动。',
 '{"100":13000,"101":3000,"102":300,"103":300,"104":4900}',
 '{"100":14500,"101":3500,"102":300,"103":300,"104":5400}',
 21500.00, 24000.00, 2500.00, 11.63,
 '2026-04-15', NULL, 'PERFORMANCE_OBJECTIVE', 910007, 'APPROVED',
 '2026-04-03 09:00:00', '2026-04-03 09:00:00', 'admin', 'admin', 0);
