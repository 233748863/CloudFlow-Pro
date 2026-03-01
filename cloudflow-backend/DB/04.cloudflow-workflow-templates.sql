-- CloudFlow Pro - Preset Workflow Templates
-- Version: v1.0
-- Created: 2026-02-28

SET NAMES utf8mb4;

-- 1. Leave Request Template
INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-leave-001', 'Leave Request', 'Employee leave request approval workflow', 'cat-hr', 
'["leave", "approval", "hr"]', 
'{
  "nodes": [
    {"id": "start-001", "type": "start", "name": "Start", "position": {"x": 100, "y": 100}},
    {"id": "form-001", "type": "form", "name": "Submit Leave Request", "position": {"x": 100, "y": 200}, "config": {"formFields": [{"name": "leaveType", "label": "Leave Type", "type": "select", "required": true}, {"name": "startDate", "label": "Start Date", "type": "date", "required": true}, {"name": "endDate", "label": "End Date", "type": "date", "required": true}, {"name": "reason", "label": "Reason", "type": "textarea", "required": true}]}},
    {"id": "approval-001", "type": "approval", "name": "Manager Approval", "position": {"x": 100, "y": 300}, "config": {"assigneeType": "ROLE", "assigneeValue": "manager"}},
    {"id": "end-001", "type": "end", "name": "End", "position": {"x": 100, "y": 400}}
  ],
  "edges": [
    {"id": "edge-001", "source": "start-001", "target": "form-001"},
    {"id": "edge-002", "source": "form-001", "target": "approval-001"},
    {"id": "edge-003", "source": "approval-001", "target": "end-001"}
  ]
}',
1, 'active', 'system', 100000);

-- 2. Expense Reimbursement Template
INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-expense-001', 'Expense Reimbursement', 'Employee expense reimbursement approval workflow', 'cat-finance', 
'["expense", "finance", "approval"]', 
'{
  "nodes": [
    {"id": "start-002", "type": "start", "name": "Start", "position": {"x": 100, "y": 100}},
    {"id": "form-002", "type": "form", "name": "Submit Expense", "position": {"x": 100, "y": 200}, "config": {"formFields": [{"name": "expenseType", "label": "Expense Type", "type": "select", "required": true}, {"name": "amount", "label": "Amount", "type": "number", "required": true}, {"name": "description", "label": "Description", "type": "textarea", "required": true}, {"name": "attachments", "label": "Attachments", "type": "file", "required": true}]}},
    {"id": "approval-002", "type": "approval", "name": "Manager Approval", "position": {"x": 100, "y": 300}, "config": {"assigneeType": "ROLE", "assigneeValue": "dept_manager"}},
    {"id": "approval-003", "type": "approval", "name": "Finance Review", "position": {"x": 100, "y": 400}, "config": {"assigneeType": "ROLE", "assigneeValue": "finance"}},
    {"id": "end-002", "type": "end", "name": "End", "position": {"x": 100, "y": 500}}
  ],
  "edges": [
    {"id": "edge-004", "source": "start-002", "target": "form-002"},
    {"id": "edge-005", "source": "form-002", "target": "approval-002"},
    {"id": "edge-006", "source": "approval-002", "target": "approval-003"},
    {"id": "edge-007", "source": "approval-003", "target": "end-002"}
  ]
}',
1, 'active', 'system', 100000);

-- 3. Purchase Request Template
INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-purchase-001', 'Purchase Request', 'Material purchase approval workflow', 'cat-procurement', 
'["purchase", "approval", "procurement"]', 
'{
  "nodes": [
    {"id": "start-003", "type": "start", "name": "Start", "position": {"x": 100, "y": 100}},
    {"id": "form-003", "type": "form", "name": "Submit Purchase Request", "position": {"x": 100, "y": 200}, "config": {"formFields": [{"name": "itemName", "label": "Item Name", "type": "text", "required": true}, {"name": "quantity", "label": "Quantity", "type": "number", "required": true}, {"name": "estimatedPrice", "label": "Estimated Price", "type": "number", "required": true}, {"name": "reason", "label": "Reason", "type": "textarea", "required": true}]}},
    {"id": "approval-004", "type": "approval", "name": "Department Approval", "position": {"x": 100, "y": 300}, "config": {"assigneeType": "ROLE", "assigneeValue": "dept_manager"}},
    {"id": "end-003", "type": "end", "name": "End", "position": {"x": 100, "y": 400}}
  ],
  "edges": [
    {"id": "edge-008", "source": "start-003", "target": "form-003"},
    {"id": "edge-009", "source": "form-003", "target": "approval-004"},
    {"id": "edge-010", "source": "approval-004", "target": "end-003"}
  ]
}',
1, 'active', 'system', 100000);

-- 4. Contract Approval Template
INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-contract-001', 'Contract Approval', 'Contract approval workflow with legal review', 'cat-contract', 
'["contract", "approval", "legal"]', 
'{
  "nodes": [
    {"id": "start-004", "type": "start", "name": "Start", "position": {"x": 100, "y": 100}},
    {"id": "form-004", "type": "form", "name": "Submit Contract", "position": {"x": 100, "y": 200}, "config": {"formFields": [{"name": "contractName", "label": "Contract Name", "type": "text", "required": true}, {"name": "contractType", "label": "Contract Type", "type": "select", "required": true}, {"name": "amount", "label": "Contract Amount", "type": "number", "required": true}, {"name": "contractFile", "label": "Contract File", "type": "file", "required": true}]}},
    {"id": "approval-005", "type": "approval", "name": "Legal Review", "position": {"x": 100, "y": 300}, "config": {"assigneeType": "ROLE", "assigneeValue": "legal"}},
    {"id": "approval-006", "type": "approval", "name": "Leadership Approval", "position": {"x": 100, "y": 400}, "config": {"assigneeType": "ROLE", "assigneeValue": "leader"}},
    {"id": "end-004", "type": "end", "name": "End", "position": {"x": 100, "y": 500}}
  ],
  "edges": [
    {"id": "edge-011", "source": "start-004", "target": "form-004"},
    {"id": "edge-012", "source": "form-004", "target": "approval-005"},
    {"id": "edge-013", "source": "approval-005", "target": "approval-006"},
    {"id": "edge-014", "source": "approval-006", "target": "end-004"}
  ]
}',
1, 'active', 'system', 100000);

-- 5. Business Trip Template
INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-trip-001', 'Business Trip Request', 'Employee business trip approval workflow', 'cat-admin', 
'["trip", "approval", "admin"]', 
'{
  "nodes": [
    {"id": "start-005", "type": "start", "name": "Start", "position": {"x": 100, "y": 100}},
    {"id": "form-005", "type": "form", "name": "Submit Trip Request", "position": {"x": 100, "y": 200}, "config": {"formFields": [{"name": "destination", "label": "Destination", "type": "text", "required": true}, {"name": "startDate", "label": "Start Date", "type": "date", "required": true}, {"name": "endDate", "label": "End Date", "type": "date", "required": true}, {"name": "purpose", "label": "Purpose", "type": "textarea", "required": true}]}},
    {"id": "approval-007", "type": "approval", "name": "Manager Approval", "position": {"x": 100, "y": 300}, "config": {"assigneeType": "ROLE", "assigneeValue": "manager"}},
    {"id": "end-005", "type": "end", "name": "End", "position": {"x": 100, "y": 400}}
  ],
  "edges": [
    {"id": "edge-015", "source": "start-005", "target": "form-005"},
    {"id": "edge-016", "source": "form-005", "target": "approval-007"},
    {"id": "edge-017", "source": "approval-007", "target": "end-005"}
  ]
}',
1, 'active', 'system', 100000);
