# CloudFlow 前端数据权限配置指南

## 概述

前端角色管理页面已集成数据权限配置功能,管理员可以为每个角色设置不同的数据访问范围。

## 功能说明

### 数据权限类型

在角色编辑/新增对话框中,新增了"数据权限范围"下拉选择框,提供5种权限类型:

1. **全部数据权限 (dsType=0)**
   - 可以查看所有数据
   - 不受部门限制
   - 适用于系统管理员等高级角色

2. **自定义数据权限 (dsType=1)**
   - 可以查看指定部门的数据
   - 需要在下方的部门树中勾选具体部门
   - 适用于跨部门管理的角色

3. **本级及下级部门数据 (dsType=2)**
   - 可以查看本部门及下级部门的数据
   - 自动根据用户所属部门计算
   - 适用于部门经理等管理角色

4. **本级部门数据 (dsType=3)**
   - 只能查看本部门的数据
   - 不包含下级部门
   - 适用于部门普通管理员

5. **仅本人数据 (dsType=4)**
   - 只能查看自己创建的数据
   - 最严格的权限控制
   - 适用于普通员工

### 自定义部门选择

当选择"自定义数据权限"时,会显示部门树选择器:

- 支持树形结构展示部门层级
- 可以展开/折叠部门节点
- 勾选部门即可授予该部门的数据访问权限
- 可以选择多个部门

## 使用流程

### 1. 创建/编辑角色

1. 进入"系统管理" -> "角色管理"
2. 点击"新增角色"或编辑现有角色
3. 填写基本信息(角色名称、权限字符等)

### 2. 配置数据权限

1. 在"数据权限范围"下拉框中选择合适的权限类型
2. 如果选择"自定义数据权限",在下方的部门树中勾选需要授权的部门
3. 配置菜单权限(原有功能)
4. 点击"保存修改"或"立即创建"

### 3. 权限生效

- 保存后,该角色的所有用户将自动应用新的数据权限
- 用户在查询数据时,后端会自动根据角色的数据权限进行过滤
- 无需前端额外处理,权限控制在后端自动完成

## 技术实现

### 前端修改点

1. **状态管理**
   ```typescript
   const [formData, setFormData] = useState({
     roleName: '',
     roleKey: '',
     roleSort: 0,
     status: '0',
     menuIds: [] as number[],
     dsType: 1,        // 新增:数据权限类型
     dsScope: ''       // 新增:自定义部门范围
   });
   ```

2. **部门树获取**
   ```typescript
   const fetchDepts = async () => {
     const res = await getDeptTree();
     // 转换为树形结构
     setDeptTree(buildTree(res.map(d => ({
       ...d, 
       menuId: d.deptId, 
       parentId: d.parentId || 0, 
       menuName: d.deptName
     })), 0));
   };
   ```

3. **部门选择处理**
   ```typescript
   const toggleDeptCheck = (deptId: number) => {
     const currentIds = formData.dsScope
       .split(',')
       .map(id => parseInt(id.trim()))
       .filter(id => !isNaN(id));
     
     const isChecked = currentIds.includes(deptId);
     const newIds = isChecked 
       ? currentIds.filter(id => id !== deptId)
       : [...currentIds, deptId];
     
     setFormData({ ...formData, dsScope: newIds.join(',') });
   };
   ```

### API交互

提交角色数据时,会包含以下字段:

```json
{
  "roleName": "部门经理",
  "roleKey": "DEPT_MANAGER",
  "roleSort": 2,
  "status": "0",
  "menuIds": [1, 2, 3],
  "dsType": 2,           // 数据权限类型
  "dsScope": "101,102"   // 自定义部门ID列表(仅dsType=1时有值)
}
```

## 注意事项

1. **权限类型选择**
   - 根据角色的实际职责选择合适的权限类型
   - 避免授予过高的权限

2. **自定义部门**
   - 只有选择"自定义数据权限"时才需要选择部门
   - 其他权限类型会自动根据用户部门计算

3. **权限继承**
   - 用户可以拥有多个角色
   - 系统会取权限最大的角色(数值最小的dsType)

4. **数据隔离**
   - 数据权限在后端自动生效
   - 前端无需额外处理权限过滤逻辑

## 示例场景

### 场景1: 系统管理员
```
角色名称: 系统管理员
权限字符: ADMIN
数据权限: 全部数据权限 (dsType=0)
说明: 可以查看和管理所有数据
```

### 场景2: 部门经理
```
角色名称: 销售部经理
权限字符: SALES_MANAGER
数据权限: 本级及下级部门数据 (dsType=2)
说明: 可以查看销售部及其下属团队的数据
```

### 场景3: 跨部门协调员
```
角色名称: 项目协调员
权限字符: PROJECT_COORDINATOR
数据权限: 自定义数据权限 (dsType=1)
选择部门: 研发部、市场部、销售部
说明: 可以查看指定的多个部门的数据
```

### 场景4: 普通员工
```
角色名称: 普通员工
权限字符: EMPLOYEE
数据权限: 仅本人数据 (dsType=4)
说明: 只能查看自己创建的数据
```

## 后续扩展

如需在其他业务模块中应用数据权限,只需确保:

1. 业务表包含`dept_id`和`create_by`字段
2. Mapper继承`CloudFlowBaseMapper`
3. 创建数据时设置`dept_id`

后端会自动应用数据权限过滤,无需前端额外处理。

## 相关文档

- 后端数据权限设计: `cloudflow-backend/cloudflow-common/DATASCOPE_README.md`
- 后端集成指南: `cloudflow-backend/cloudflow-common/DATASCOPE_INTEGRATION_GUIDE.md`
- 使用示例: `cloudflow-backend/cloudflow-common/DATASCOPE_USAGE_EXAMPLE.md`
