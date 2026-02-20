-- =====================================================
-- P0-7: 节点级按钮权限控制 - 测试数据
-- 更新现有流程定义的 model_json，为审批节点添加 buttons 配置
-- buttons 配置位于节点的 props.buttons 数组中
-- 可选值：APPROVE(同意), REJECT(拒绝), RETURN(驳回), DELEGATE(转办), ADD_SIGN(加签)
-- 未配置 buttons 或为空数组时，前端显示所有默认按钮（向后兼容）
-- =====================================================

-- 1. 请假审批流程：部门经理只能同意/驳回（不能拒绝和转办），总经理/HR拥有全部权限
UPDATE wf_process_definition SET model_json = '{"id": "root", "type": "START", "title": "提交请假", "next": {"id": "n1", "type": "APPROVAL", "title": "部门经理", "icon": "briefcase", "approverType": "DEPT_MANAGER", "props": {"buttons": ["APPROVE", "RETURN"]}, "next": {"id": "gw_leave", "type": "CONDITION", "title": "天数校验", "branches": [{"id": "b1", "type": "APPROVAL", "title": "HR备案", "icon": "file-box", "approverType": "ROLE", "approverValue": "HR", "props": {"buttons": ["APPROVE", "REJECT", "RETURN", "DELEGATE"]}, "condition": "days <= 3"}, {"id": "b2", "type": "APPROVAL", "title": "总经理审批", "icon": "shield", "approverType": "ROLE", "approverValue": "ADMIN", "props": {"buttons": ["APPROVE", "REJECT", "RETURN", "DELEGATE"]}, "condition": "days > 3"}], "next": {"id": "end", "type": "END", "title": "归档"}}}}'
WHERE definition_id = 'wf_leave';

-- 2. 财务报销流程：直属上级只能同意/驳回，财务主管/总监可同意/拒绝/驳回/转办
UPDATE wf_process_definition SET model_json = '{"id": "root", "type": "START", "title": "提交报销", "next": {"id": "n1", "type": "APPROVAL", "title": "直属上级", "icon": "briefcase", "approverType": "DIRECT_LEADER", "props": {"buttons": ["APPROVE", "RETURN"]}, "next": {"id": "gw1", "type": "CONDITION", "title": "金额校验", "branches": [{"id": "b1", "type": "APPROVAL", "title": "财务主管", "icon": "credit-card", "approverType": "ROLE", "approverValue": "FINANCE", "props": {"buttons": ["APPROVE", "REJECT", "RETURN", "DELEGATE"]}, "condition": "amount < 1000"}, {"id": "b2", "type": "APPROVAL", "title": "财务总监", "icon": "credit-card", "approverType": "ROLE", "approverValue": "FINANCE", "props": {"buttons": ["APPROVE", "REJECT", "RETURN", "DELEGATE"]}, "condition": "amount >= 1000"}], "next": {"id": "end", "type": "END", "title": "打款"}}}}'
WHERE definition_id = 'wf_reimburse';

-- 3. 合同审批流程：会签节点只能同意/拒绝（不能驳回和转办），总经理可同意/拒绝/驳回
UPDATE wf_process_definition SET model_json = '{"id": "root", "type": "START", "title": "起草合同", "next": {"id": "n1", "type": "APPROVAL", "title": "法务&财务会签审核", "icon": "scale", "signType": "ALL", "approverType": "USERS", "approverValue": "1", "props": {"buttons": ["APPROVE", "REJECT"]}, "next": {"id": "n2", "type": "APPROVAL", "title": "总经理签发", "icon": "shield", "approverType": "ROLE", "approverValue": "ADMIN", "props": {"buttons": ["APPROVE", "REJECT", "RETURN"]}, "next": {"id": "end", "type": "END", "title": "盖章归档"}}}}'
WHERE definition_id = 'wf_contract';

-- 4. 人员招聘流程：部门总监只能同意/驳回，HR可同意/拒绝/转办，总经理全部权限
UPDATE wf_process_definition SET model_json = '{"id": "root", "type": "START", "title": "提交招聘需求", "next": {"id": "n1", "type": "APPROVAL", "title": "部门总监审批", "icon": "briefcase", "approverType": "DEPT_MANAGER", "props": {"buttons": ["APPROVE", "RETURN"]}, "next": {"id": "n2", "type": "APPROVAL", "title": "HR审核", "icon": "users", "approverType": "ROLE", "approverValue": "HR", "props": {"buttons": ["APPROVE", "REJECT", "DELEGATE"]}, "next": {"id": "n3", "type": "APPROVAL", "title": "总经理审批", "icon": "shield", "approverType": "ROLE", "approverValue": "ADMIN", "props": {"buttons": ["APPROVE", "REJECT", "RETURN", "DELEGATE"]}, "next": {"id": "end", "type": "END", "title": "开始招聘"}}}}}'
WHERE definition_id = 'wf_recruit';

-- 5. 对公付款流程：财务主管可同意/驳回/转办，财务总监/总经理可同意/拒绝/驳回/转办
UPDATE wf_process_definition SET model_json = '{"id": "root", "type": "START", "title": "提交付款申请", "next": {"id": "n1", "type": "APPROVAL", "title": "财务主管审批", "icon": "credit-card", "approverType": "ROLE", "approverValue": "FINANCE", "props": {"buttons": ["APPROVE", "RETURN", "DELEGATE"]}, "next": {"id": "gw1", "type": "CONDITION", "title": "金额校验", "branches": [{"id": "b1", "type": "APPROVAL", "title": "财务总监审批", "icon": "credit-card", "approverType": "ROLE", "approverValue": "FINANCE", "props": {"buttons": ["APPROVE", "REJECT", "RETURN", "DELEGATE"]}, "condition": "amount < 50000"}, {"id": "b2", "type": "APPROVAL", "title": "总经理审批", "icon": "shield", "approverType": "ROLE", "approverValue": "ADMIN", "props": {"buttons": ["APPROVE", "REJECT", "RETURN", "DELEGATE"]}, "condition": "amount >= 50000"}], "next": {"id": "end", "type": "END", "title": "财务打款"}}}}'
WHERE definition_id = 'wf_payment';
