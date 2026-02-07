import json
import os

# Define Mock Data Structure

# --- 1. Forms ---
MOCK_FORMS = [
  {
    "id": 'form_reimburse',
    "name": '通用报销申请',
    "fields": [
      { "id": 'f1', "type": 'SELECT', "label": '费用类型', "required": True, "options": ['差旅费', '招待费', '办公费', '团建费'] },
      { "id": 'f2', "type": 'NUMBER', "label": '报销金额', "required": True },
      { "id": 'f3', "type": 'DATE', "label": '发生日期', "required": True },
      { "id": 'f4', "type": 'TEXTAREA', "label": '费用明细说明', "required": True },
    ]
  },
  {
    "id": 'form_payment',
    "name": '对公付款申请',
    "fields": [
      { "id": 'p1', "type": 'TEXT', "label": '收款方名称', "required": True },
      { "id": 'p2', "type": 'TEXT', "label": '银行账号', "required": True, "regex": '^\\d{10,20}$', "errorMsg": '请输入正确的银行账号' },
      { "id": 'p3', "type": 'NUMBER', "label": '付款金额', "required": True },
      { "id": 'p4', "type": 'TEXT', "label": '合同编号', "required": False },
    ]
  },
  {
    "id": 'form_leave',
    "name": '请假申请单',
    "fields": [
      { "id": 'l1', "type": 'SELECT', "label": '请假类型', "required": True, "options": ['年假', '事假', '病假', '婚假', '产假'] },
      { "id": 'l2', "type": 'DATE', "label": '开始时间', "required": True },
      { "id": 'l3', "type": 'DATE', "label": '结束时间', "required": True },
      { "id": 'l4', "type": 'NUMBER', "label": '共计天数', "required": True },
      { "id": 'l5', "type": 'TEXTAREA', "label": '请假事由', "required": True },
    ]
  },
  {
    "id": 'form_recruit',
    "name": '人员招聘需求',
    "fields": [
      { "id": 'r1', "type": 'TEXT', "label": '招聘岗位', "required": True },
      { "id": 'r2', "type": 'NUMBER', "label": '需求人数', "required": True },
      { "id": 'r3', "type": 'SELECT', "label": '期望职级', "required": True, "options": ['P5', 'P6', 'P7', 'P8'] },
      { "id": 'r4', "type": 'TEXTAREA', "label": '岗位职责要求', "required": True },
      { "id": 'r5', "type": 'NUMBER', "label": '薪资预算(k)', "required": True },
    ]
  },
  {
    "id": 'form_overtime',
    "name": '加班申请单',
    "fields": [
      { "id": 'o1', "type": 'DATE', "label": '加班日期', "required": True },
      { "id": 'o2', "type": 'NUMBER', "label": '加班时长(小时)', "required": True },
      { "id": 'o3', "type": 'TEXTAREA', "label": '工作内容', "required": True },
    ]
  },
  {
    "id": 'form_resign',
    "name": '离职申请表',
    "fields": [
      { "id": 'rs1', "type": 'DATE', "label": '预计最后工作日', "required": True },
      { "id": 'rs2', "type": 'SELECT', "label": '离职原因', "required": True, "options": ['个人发展', '薪资不满意', '家庭原因', '其他'] },
      { "id": 'rs3', "type": 'TEXTAREA', "label": '详细说明', "required": False },
    ]
  },
  {
    "id": 'form_supplies',
    "name": '办公用品领用',
    "fields": [
      { "id": 's1', "type": 'SELECT', "label": '物品类别', "required": True, "options": ['笔记本', '显示器', '键盘鼠标', '文具'] },
      { "id": 's2', "type": 'NUMBER', "label": '数量', "required": True },
      { "id": 's3', "type": 'TEXT', "label": '用途说明', "required": False },
    ]
  },
  {
    "id": 'form_stamp',
    "name": '印章使用申请',
    "fields": [
      { "id": 'st1', "type": 'SELECT', "label": '印章类型', "required": True, "options": ['公章', '合同章', '财务章', '法人章'] },
      { "id": 'st2', "type": 'TEXT', "label": '文件名称', "required": True },
      { "id": 'st3', "type": 'NUMBER', "label": '用印份数', "required": True },
      { "id": 'st4', "type": 'SELECT', "label": '是否外带', "required": True, "options": ['否', '是'] },
    ]
  },
  {
    "id": 'form_it_access',
    "name": 'IT权限申请',
    "fields": [
      { "id": 'it1', "type": 'TEXT', "label": '系统名称', "required": True },
      { "id": 'it2', "type": 'SELECT', "label": '权限级别', "required": True, "options": ['只读', '读写', '管理员'] },
      { "id": 'it3', "type": 'TEXTAREA', "label": '申请理由', "required": True },
      { "id": 'it4', "type": 'DATE', "label": '有效期至', "required": False },
    ]
  },
  {
    "id": 'form_vpn',
    "name": 'VPN开通申请',
    "fields": [
      { "id": 'v1', "type": 'TEXT', "label": '工号', "required": True },
      { "id": 'v2', "type": 'TEXT', "label": '手机号', "required": True, "regex": '^1[3-9]\\d{9}$', "errorMsg": '手机号格式错误' },
      { "id": 'v3', "type": 'TEXTAREA', "label": '业务需求', "required": True },
    ]
  },
  {
    "id": 'form_contract',
    "name": '合同审批单',
    "fields": [
      { "id": 'c1', "type": 'TEXT', "label": '合同名称', "required": True },
      { "id": 'c2', "type": 'TEXT', "label": '对方单位', "required": True },
      { "id": 'c3', "type": 'NUMBER', "label": '合同金额', "required": True },
      { "id": 'c4', "type": 'SELECT', "label": '合同类型', "required": True, "options": ['采购合同', '销售合同', '服务协议'] },
      { "id": 'c5', "type": 'TEXTAREA', "label": '主要条款摘要', "required": True },
    ]
  },
  {
    "id": 'form_project',
    "name": '项目立项申请',
    "fields": [
      { "id": 'pr1', "type": 'TEXT', "label": '项目名称', "required": True },
      { "id": 'pr2', "type": 'NUMBER', "label": '预算金额(万)', "required": True },
      { "id": 'pr3', "type": 'DATE', "label": '预计开始', "required": True },
      { "id": 'pr4', "type": 'DATE', "label": '预计结束', "required": True },
      { "id": 'pr5', "type": 'TEXTAREA', "label": '项目背景及价值', "required": True },
    ]
  }
]

# --- 2. Workflows ---
MOCK_WORKFLOWS = [
  {
    "id": 'wf_reimburse',
    "name": '财务报销流程',
    "key": 'biz_reimburse',
    "version": 3,
    "formId": 'form_reimburse',
    "nodes": {
      "id": 'root', "type": 'START', "title": '提交报销',
      "next": {
        "id": 'n1', "type": 'APPROVAL', "title": '直属上级', "icon": 'briefcase', "approverType": 'DIRECT_LEADER',
        "next": {
          "id": 'gw1', "type": 'CONDITION', "title": '金额校验',
          "branches": [
            { "id": 'b1', "type": 'APPROVAL', "title": '财务主管', "icon": 'credit-card', "approverType": 'ROLE', "approverValue": 'FINANCE', "condition": 'amount < 1000' },
            { "id": 'b2', "type": 'APPROVAL', "title": '财务总监', "icon": 'credit-card', "approverType": 'ROLE', "approverValue": 'FINANCE', "condition": 'amount >= 1000' }
          ],
          "next": { "id": 'end', "type": 'END', "title": '打款' }
        }
      }
    }
  },
  {
    "id": 'wf_leave',
    "name": '员工请假流程',
    "key": 'biz_leave',
    "version": 1,
    "formId": 'form_leave',
    "nodes": {
      "id": 'root', "type": 'START', "title": '提交请假',
      "next": {
        "id": 'n1', "type": 'APPROVAL', "title": '部门经理', "icon": 'briefcase', "approverType": 'DEPT_MANAGER',
        "next": {
          "id": 'gw_leave', "type": 'CONDITION', "title": '天数校验',
          "branches": [
            { "id": 'b1', "type": 'APPROVAL', "title": 'HR备案', "icon": 'file-box', "approverType": 'ROLE', "approverValue": 'HR', "condition": 'days <= 3' },
            { "id": 'b2', "type": 'APPROVAL', "title": '总经理审批', "icon": 'shield', "approverType": 'ROLE', "approverValue": 'ADMIN', "condition": 'days > 3' }
          ],
          "next": { "id": 'end', "type": 'END', "title": '归档' }
        }
      }
    }
  },
  {
    "id": 'wf_recruit',
    "name": '人员招聘流程',
    "key": 'biz_recruit',
    "version": 2,
    "formId": 'form_recruit',
    "nodes": {
      "id": 'root', "type": 'START', "title": '提出需求',
      "next": {
        "id": 'n1', "type": 'APPROVAL', "title": 'HRBP初审', "icon": 'user-check', "approverType": 'ROLE', "approverValue": 'HR',
        "next": {
          "id": 'n2', "type": 'APPROVAL', "title": '部门负责人', "icon": 'briefcase', "approverType": 'DEPT_MANAGER',
          "next": {
            "id": 'n3', "type": 'APPROVAL', "title": '总经理终审', "icon": 'shield', "approverType": 'ROLE', "approverValue": 'ADMIN',
            "next": { "id": 'end', "type": 'END', "title": '发布职位' }
          }
        }
      }
    }
  },
  {
    "id": 'wf_it',
    "name": 'IT系统权限申请',
    "key": 'biz_it_access',
    "version": 1,
    "formId": 'form_it_access',
    "nodes": {
      "id": 'root', "type": 'START', "title": '提交申请',
      "next": {
        "id": 'n1', "type": 'APPROVAL', "title": '直属领导', "icon": 'briefcase', "approverType": 'DIRECT_LEADER',
        "next": {
          "id": 'n2', "type": 'APPROVAL', "title": '系统管理员', "icon": 'server', "approverType": 'ROLE', "approverValue": 'ADMIN',
          "next": { "id": 'end', "type": 'END', "title": '开通权限' }
        }
      }
    }
  },
  {
    "id": 'wf_contract',
    "name": '合同审批流程',
    "key": 'biz_contract',
    "version": 5,
    "formId": 'form_contract',
    "nodes": {
      "id": 'root', "type": 'START', "title": '起草合同',
      "next": {
        "id": 'n1', "type": 'PARALLEL', "title": '会签',
        "branches": [
          { "id": 'b1', "type": 'APPROVAL', "title": '法务审核', "icon": 'scale', "approverType": 'ROLE', "approverValue": 'ADMIN' },
          { "id": 'b2', "type": 'APPROVAL', "title": '财务审核', "icon": 'credit-card', "approverType": 'ROLE', "approverValue": 'FINANCE' }
        ],
        "next": {
          "id": 'n2', "type": 'APPROVAL', "title": '总经理签发', "icon": 'shield', "approverType": 'ROLE', "approverValue": 'ADMIN',
          "next": { "id": 'end', "type": 'END', "title": '盖章归档' }
        }
      }
    }
  },
  {
    "id": 'wf_stamp',
    "name": '印章使用流程',
    "key": 'biz_stamp',
    "version": 1,
    "formId": 'form_stamp',
    "nodes": {
      "id": 'root', "type": 'START', "title": '用印申请',
      "next": {
        "id": 'n1', "type": 'APPROVAL', "title": '部门负责人', "icon": 'briefcase', "approverType": 'DEPT_MANAGER',
        "next": {
          "id": 'n2', "type": 'APPROVAL', "title": '印章管理员', "icon": 'stamp', "approverType": 'ROLE', "approverValue": 'ADMIN',
          "next": { "id": 'end', "type": 'END', "title": '盖章' }
        }
      }
    }
  },
  {
    "id": 'wf_project',
    "name": '项目立项审批',
    "key": 'biz_project_init',
    "version": 1,
    "formId": 'form_project',
    "nodes": {
      "id": 'root', "type": 'START', "title": '立项申请',
      "next": {
        "id": 'n1', "type": 'APPROVAL', "title": 'PMO审核', "icon": 'clipboard-list', "approverType": 'ROLE', "approverValue": 'MANAGER',
        "next": {
          "id": 'n2', "type": 'APPROVAL', "title": '技术委员会', "icon": 'code', "approverType": 'ROLE', "approverValue": 'ADMIN',
          "next": {
            "id": 'n3', "type": 'APPROVAL', "title": '预算委员会', "icon": 'dollar-sign', "approverType": 'ROLE', "approverValue": 'FINANCE',
            "next": { "id": 'end', "type": 'END', "title": '立项成功' }
          }
        }
      }
    }
  },
  {
    "id": 'wf_supplies',
    "name": '办公用品领用',
    "key": 'biz_supplies',
    "version": 1,
    "formId": 'form_supplies',
    "nodes": {
      "id": 'root', "type": 'START', "title": '领用申请',
      "next": {
        "id": 'n1', "type": 'APPROVAL', "title": '行政专员', "icon": 'package', "approverType": 'ROLE', "approverValue": 'HR',
        "next": { "id": 'end', "type": 'END', "title": '发放' }
      }
    }
  },
  {
    "id": 'wf_resign',
    "name": '离职审批流程',
    "key": 'biz_resign',
    "version": 2,
    "formId": 'form_resign',
    "nodes": {
      "id": 'root', "type": 'START', "title": '提交离职',
      "next": {
        "id": 'n1', "type": 'APPROVAL', "title": '直属上级面谈', "icon": 'message-circle', "approverType": 'DIRECT_LEADER',
        "next": {
          "id": 'n2', "type": 'APPROVAL', "title": '部门负责人确认', "icon": 'briefcase', "approverType": 'DEPT_MANAGER',
          "next": {
            "id": 'n3', "type": 'APPROVAL', "title": 'HR离职办理', "icon": 'user-x', "approverType": 'ROLE', "approverValue": 'HR',
             "next": { "id": 'end', "type": 'END', "title": '离职生效' }
          }
        }
      }
    }
  },
  {
    "id": 'wf_payment',
    "name": '对公付款审批',
    "key": 'biz_payment',
    "version": 4,
    "formId": 'form_payment',
    "nodes": {
      "id": 'root', "type": 'START', "title": '发起付款',
      "next": {
        "id": 'n1', "type": 'APPROVAL', "title": '业务负责人', "icon": 'user', "approverType": 'DIRECT_LEADER',
        "next": {
          "id": 'gw_pay', "type": 'CONDITION', "title": '金额分级',
          "branches": [
            { "id": 'b1', "type": 'APPROVAL', "title": '财务经理', "icon": 'dollar-sign', "approverType": 'ROLE', "approverValue": 'FINANCE', "condition": 'amount <= 50000' },
            { "id": 'b2', "type": 'APPROVAL', "title": '总经理', "icon": 'shield', "approverType": 'ROLE', "approverValue": 'ADMIN', "condition": 'amount > 50000' }
          ],
          "next": { "id": 'end', "type": 'END', "title": '出纳付款' }
        }
      }
    }
  }
]

# --- 3. Users ---
# Role mapping: ADMIN=1, MANAGER=2, FINANCE=3, HR=4, EMPLOYEE=5
MOCK_USERS = [
  { "id": 1, "name": 'Admin (管理员)', "username": 'admin', "email": 'admin@cloudflow.com', "role": 'ADMIN', "role_id": 1 },
  { "id": 2, "name": '李经理 (Manager)', "username": 'li', "email": 'li@cloudflow.com', "role": 'MANAGER', "role_id": 2 },
  { "id": 3, "name": '王财务 (Finance)', "username": 'wang', "email": 'wang@cloudflow.com', "role": 'FINANCE', "role_id": 3 },
  { "id": 4, "name": '赵HR (HR)', "username": 'zhao', "email": 'zhao@cloudflow.com', "role": 'HR', "role_id": 4 },
  { "id": 5, "name": '张三 (员工)', "username": 'zhang', "email": 'zhang@cloudflow.com', "role": 'EMPLOYEE', "role_id": 5 },
  { "id": 6, "name": '刘法务 (Legal)', "username": 'liu', "email": 'liu@cloudflow.com', "role": 'ADMIN', "role_id": 1 },
  { "id": 7, "name": '陈IT (IT Admin)', "username": 'chen', "email": 'chen@cloudflow.com', "role": 'ADMIN', "role_id": 1 },
]

# --- 3.5 Departments ---
MOCK_DEPTS = [
    { "id": 100, "parent_id": 0, "name": "CloudFlow 集团总部", "leader": "admin" },
    { "id": 200, "parent_id": 100, "name": "研发中心", "leader": "zhao" },
    { "id": 201, "parent_id": 200, "name": "后端架构组", "leader": "zhang" },
    { "id": 202, "parent_id": 200, "name": "前端交互组", "leader": "liu" },
    { "id": 300, "parent_id": 100, "name": "人力资源部", "leader": "li" },
    { "id": 400, "parent_id": 100, "name": "财务部", "leader": "wang" },
]

# --- 4. Tasks ---
MOCK_TASKS = [
  {
    "id": 't1', "processInstanceId": 'pi_101', "workflowId": 'wf_reimburse', "workflowName": '财务报销流程', "nodeName": '财务主管审批', "nodeKey": 'n1',
    "applicantId": 5, "applicantName": '张三 (员工)', "assigneeRole": 'FINANCE', "assigneeName": '财务部', "type": 'DYNAMIC', "amount": 5800, "reason": '购买高性能开发服务器',
    "status": 'PENDING', "createdTime": '2023-11-02 14:20:00', "dueDate": '2023-11-05 18:00:00', "formId": 'form_reimburse'
  },
  {
    "id": 't2', "processInstanceId": 'pi_102', "workflowId": 'wf_leave', "workflowName": '员工请假流程', "nodeName": '超时预警', "nodeKey": 'gw_leave',
    "applicantId": 3, "applicantName": '王财务', "assigneeId": 2, "assigneeName": '李经理', "type": 'DYNAMIC', "days": 3, "reason": '处理家庭私事',
    "status": 'TIMED_OUT', "createdTime": '2023-10-30 09:00:00', "dueDate": '2023-11-01 09:00:00', "formId": 'form_leave'
  },
  {
    "id": 't3', "processInstanceId": 'pi_103', "workflowId": 'wf_contract', "workflowName": '合同审批流程', "nodeName": '法务审核', "nodeKey": 'b1',
    "applicantId": 2, "applicantName": '李经理', "assigneeRole": 'ADMIN', "assigneeName": '法务部', "type": 'DYNAMIC', "amount": 120000, "reason": '年度采购合同',
    "status": 'PENDING', "createdTime": '2023-11-03 10:00:00', "dueDate": '2023-11-06 12:00:00', "formId": 'form_contract'
  }
]

sql_content = ""

# Forms
sql_content += "\n-- ----------------------------\n"
sql_content += "-- 7. 初始化表单定义 (Mock Forms)\n"
sql_content += "-- ----------------------------\n"

for form in MOCK_FORMS:
    fields_json = json.dumps(form['fields'], ensure_ascii=False).replace("'", "\\'")
    sql_content += f"INSERT INTO wf_form_definition (form_id, form_name, fields_json, create_time) VALUES ('{form['id']}', '{form['name']}', '{fields_json}', sysdate());\n"

# Workflows
sql_content += "\n-- ----------------------------\n"
sql_content += "-- 8. 初始化流程定义 (Mock Workflows)\n"
sql_content += "-- ----------------------------\n"

for wf in MOCK_WORKFLOWS:
    model_json = json.dumps(wf['nodes'], ensure_ascii=False).replace("'", "\\'")
    sql_content += f"INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, form_id, model_json, create_time) VALUES ('{wf['id']}', '{wf['name']}', '{wf['key']}', {wf['version']}, '{wf['formId']}', '{model_json}', sysdate());\n"

# Departments
sql_content += "\n-- ----------------------------\n"
sql_content += "-- 8.5 初始化部门数据 (Mock Depts)\n"
sql_content += "-- ----------------------------\n"

for dept in MOCK_DEPTS:
    sql_content += f"REPLACE INTO sys_dept (dept_id, parent_id, dept_name, leader, order_num, status) VALUES ({dept['id']}, {dept['parent_id']}, '{dept['name']}', '{dept['leader']}', 0, '0');\n"

# Users
sql_content += "\n-- ----------------------------\n"
sql_content += "-- 9. 初始化用户数据 (Mock Users)\n"
sql_content += "-- ----------------------------\n"

# Ensure Role 5 exists
sql_content += "INSERT IGNORE INTO sys_role (role_id, role_name, role_key, role_sort, data_scope, status, del_flag, create_by, create_time, remark) VALUES (5, '普通员工', 'employee', 5, '1', '0', '0', 'admin', sysdate(), '普通员工角色');\n"

for user in MOCK_USERS:
    # Password hash for 123456
    pwd = "$2a$10$7JB720yubVSZv5W8vNGkxOW4Q.WBFGvMay.k.e3nA.YJ.Libn.qK"
    sql_content += f"REPLACE INTO sys_user (user_id, dept_id, user_name, nick_name, email, phonenumber, sex, password, status, del_flag, create_by, create_time, remark) VALUES ({user['id']}, 100, '{user['username']}', '{user['name']}', '{user['email']}', '1380000000{user['id']}', '1', '{pwd}', '0', '0', 'admin', sysdate(), '{user['name']}');\n"
    sql_content += f"REPLACE INTO sys_user_role (user_id, role_id) VALUES ({user['id']}, {user['role_id']});\n"

# Tasks
sql_content += "\n-- ----------------------------\n"
sql_content += "-- 10. 初始化待办任务 (Mock Tasks)\n"
sql_content += "-- ----------------------------\n"

for task in MOCK_TASKS:
    # Find workflow key
    wf = next((w for w in MOCK_WORKFLOWS if w['id'] == task['workflowId']), None)
    process_key = wf['key'] if wf else 'unknown_key'
    
    # Construct title
    title = f"{task['workflowName']} - {task['applicantName']}"
    if 'amount' in task:
        title += f" (金额: {task['amount']})"
    if 'reason' in task:
        title += f" (事由: {task['reason']})"
        
    # Process Instance
    sql_content += f"REPLACE INTO wf_process_instance (instance_id, process_def_key, business_key, title, start_user_id, start_user_name, status, start_time) VALUES ('{task['processInstanceId']}', '{process_key}', 'BK_{task['processInstanceId']}', '{title}', {task['applicantId']}, '{task['applicantName']}', 'RUNNING', '{task['createdTime']}');\n"
    
    # Task
    assignee = task.get('assigneeId', 'NULL')
    candidate_roles = f"'{task['assigneeRole']}'" if 'assigneeRole' in task else 'NULL'
    
    sql_content += f"REPLACE INTO wf_task (task_id, instance_id, node_key, node_name, assignee, candidate_roles, status, create_time, due_time) VALUES ('{task['id']}', '{task['processInstanceId']}', '{task['nodeKey']}', '{task['nodeName']}', {assignee}, {candidate_roles}, '{task['status']}', '{task['createdTime']}', '{task['dueDate']}');\n"


# Define output file path
output_file = os.path.join(os.path.dirname(__file__), 'DB', '05_init_data.sql')

# Write to file
with open(output_file, 'w', encoding='utf-8') as f:
    f.write(sql_content)

print(f"Successfully generated SQL to: {output_file}")
