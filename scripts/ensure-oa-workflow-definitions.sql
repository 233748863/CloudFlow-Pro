INSERT IGNORE INTO cloud_flow_db.wf_process_definition
(definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time)
VALUES
('wf_project_approval', '项目立项审批流程', 'project_approval', 1, 'PUBLISHED', 1, 'OA',
'{"nodes":[{"id":"root","type":"START","title":"提交项目立项"},{"id":"n1","type":"APPROVAL","title":"项目经理初审","approverType":"ROLE","approverValue":"manager","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"n2","type":"APPROVAL","title":"财务预算复核","approverType":"ROLE","approverValue":"finance","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"n3","type":"APPROVAL","title":"管理员终审","approverType":"ROLE","approverValue":"admin","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->n3","source":"n2","target":"n3"},{"id":"n3->end","source":"n3","target":"end"}]}',
NOW());

INSERT IGNORE INTO cloud_flow_db.wf_process_definition
(definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time)
VALUES
('wf_budget_plan_approval', '预算计划审批流程', 'budget_plan_approval', 1, 'PUBLISHED', 1, 'OA',
'{"nodes":[{"id":"root","type":"START","title":"提交预算计划"},{"id":"n1","type":"APPROVAL","title":"部门负责人审核","approverType":"ROLE","approverValue":"manager","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"n2","type":"APPROVAL","title":"财务复核","approverType":"ROLE","approverValue":"finance","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->end","source":"n2","target":"end"}]}',
NOW());

INSERT IGNORE INTO cloud_flow_db.wf_process_definition
(definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time)
VALUES
('wf_budget_adjustment_approval', '预算调整审批流程', 'budget_adjustment_approval', 1, 'PUBLISHED', 1, 'OA',
'{"nodes":[{"id":"root","type":"START","title":"提交预算调整"},{"id":"n1","type":"APPROVAL","title":"财务复核","approverType":"ROLE","approverValue":"finance","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"n2","type":"APPROVAL","title":"部门负责人审批","approverType":"ROLE","approverValue":"manager","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->end","source":"n2","target":"end"}]}',
NOW());
