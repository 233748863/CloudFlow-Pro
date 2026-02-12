# P1任务 - 前端调整需求文档

## 概述

P1任务的后端实现已完成，包括租户管理、租户数据隔离和Workflow模块数据权限集成。前端需要进行相应的调整以支持这些新功能。

## 一、租户管理功能（高优先级）

### 1.1 租户管理页面

需要创建租户管理页面，提供以下功能：

**页面路径建议：** `/system/tenant`

**功能需求：**

1. **租户列表展示**
   - 表格展示租户信息（租户ID、名称、联系人、状态、过期时间等）
   - 支持分页、搜索、筛选
   - 状态标识（正常/停用/过期）

2. **租户新增**
   - 表单字段：
     - 租户名称（必填）
     - 联系人姓名（必填）
     - 联系电话（必填）
     - 联系邮箱（必填）
     - 域名配置（选填）
     - 过期时间（必填）
     - 用户数量限制（必填）
     - 存储空间限制（必填，单位MB）
     - 状态（正常/停用）
     - 备注（选填）

3. **租户编辑**
   - 支持修改租户信息
   - 不允许修改租户ID

4. **租户删除**
   - 逻辑删除（软删除）
   - 删除前确认提示

5. **租户状态管理**
   - 快速启用/停用租户
   - 状态切换确认提示

**API接口：**
```javascript
// 租户列表查询
GET /tenant/list?pageNum=1&pageSize=10&tenantName=xxx&status=0

// 租户详情查询
GET /tenant/{id}

// 创建租户
POST /tenant
{
  "tenantName": "测试租户",
  "contactName": "张三",
  "contactPhone": "13800138000",
  "contactEmail": "test@example.com",
  "domain": "test.example.com",
  "expireTime": "2025-12-31",
  "maxUsers": 100,
  "maxStorage": 10240,
  "status": "0",
  "remark": "测试租户"
}

// 更新租户
PUT /tenant
{
  "tenantId": 100001,
  "tenantName": "测试租户",
  // ... 其他字段
}

// 删除租户
DELETE /tenant/{id}

// 更新租户状态
PUT /tenant/{id}/status?status=0
```

### 1.2 菜单配置

需要在系统管理菜单下添加"租户管理"菜单项：

```javascript
{
  "menuName": "租户管理",
  "parentId": 1, // 系统管理的菜单ID
  "orderNum": 5,
  "path": "tenant",
  "component": "system/tenant/index",
  "isFrame": 1,
  "menuType": "C",
  "visible": "0",
  "status": "0",
  "perms": "system:tenant:list",
  "icon": "peoples"
}
```

### 1.3 权限配置

需要配置租户管理相关权限：

- `system:tenant:list` - 租户列表查询
- `system:tenant:query` - 租户详情查询
- `system:tenant:add` - 新增租户
- `system:tenant:edit` - 编辑租户
- `system:tenant:remove` - 删除租户
- `system:tenant:status` - 修改租户状态

## 二、用户信息扩展（高优先级）

### 2.1 登录响应处理

后端登录接口返回的用户信息中已包含 `tenantId` 字段，前端需要：

1. **存储租户ID**
   - 将 `tenantId` 存储到 Vuex store 或 localStorage
   - 与用户信息一起管理

2. **请求头添加租户ID**
   - 在 axios 请求拦截器中，为所有请求添加 `X-Tenant-Id` 请求头
   - 示例代码：

```javascript
// request.js
service.interceptors.request.use(
  config => {
    // 获取租户ID
    const tenantId = store.getters.tenantId || localStorage.getItem('tenantId');
    if (tenantId) {
      config.headers['X-Tenant-Id'] = tenantId;
    }
    
    // ... 其他请求头配置
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);
```

3. **Vuex Store 扩展**

```javascript
// store/modules/user.js
const state = {
  token: '',
  userId: '',
  userName: '',
  tenantId: '', // 新增租户ID
  // ... 其他用户信息
}

const mutations = {
  SET_TENANT_ID: (state, tenantId) => {
    state.tenantId = tenantId;
  },
  // ... 其他mutations
}

const actions = {
  // 登录
  Login({ commit }, userInfo) {
    return new Promise((resolve, reject) => {
      login(userInfo).then(res => {
        const data = res.data;
        commit('SET_TOKEN', data.token);
        commit('SET_TENANT_ID', data.tenantId); // 存储租户ID
        // ... 其他信息存储
        resolve();
      }).catch(error => {
        reject(error);
      });
    });
  },
  
  // 获取用户信息
  GetInfo({ commit }) {
    return new Promise((resolve, reject) => {
      getInfo().then(res => {
        const user = res.user;
        commit('SET_TENANT_ID', user.tenantId); // 存储租户ID
        // ... 其他信息存储
        resolve(res);
      }).catch(error => {
        reject(error);
      });
    });
  }
}
```

## 三、Workflow模块调整（中优先级）

### 3.1 流程定义列表

由于后端已实现数据权限，前端无需特殊处理，但需要注意：

1. **列表查询**
   - 后端会自动根据用户的数据权限过滤数据
   - 前端只需正常调用列表接口

2. **创建流程定义**
   - 创建时后端会自动填充 `deptId`、`createBy` 等字段
   - 前端无需手动传递这些字段

3. **编辑流程定义**
   - 后端会自动更新 `updateBy`、`updateTime` 字段
   - 前端无需手动传递这些字段

### 3.2 流程实例列表

同流程定义列表，后端已自动处理数据权限。

### 3.3 UI优化建议

1. **数据权限提示**
   - 在列表页面添加提示，说明当前用户只能看到有权限的数据
   - 例如："当前显示您有权限查看的流程"

2. **创建人/更新人显示**
   - 在列表中显示创建人、更新人信息
   - 在详情页显示完整的审计信息（创建时间、创建人、更新时间、更新人）

## 四、其他模块调整（低优先级）

### 4.1 角色管理

角色实体已添加审计字段，前端可以：

1. **列表展示**
   - 显示创建人、创建时间
   - 显示更新人、更新时间

2. **详情页**
   - 显示完整的审计信息

### 4.2 用户管理

如果用户表也添加了租户ID字段，需要：

1. **用户列表**
   - 显示用户所属租户（如果是超级管理员）
   - 普通用户只能看到同租户的用户

2. **用户创建**
   - 后端会自动设置租户ID
   - 前端无需手动传递

## 五、测试要点

### 5.1 租户隔离测试

1. **创建多个租户**
   - 创建租户A和租户B
   - 分别创建用户

2. **数据隔离验证**
   - 使用租户A的用户登录，创建流程定义
   - 使用租户B的用户登录，验证看不到租户A的流程定义
   - 验证租户B的用户无法访问租户A的数据

3. **租户切换测试**
   - 如果支持超级管理员切换租户，测试切换功能
   - 验证切换后数据正确显示

### 5.2 数据权限测试

1. **不同权限用户测试**
   - 创建不同数据权限的角色（全部数据、自定义、本级及下级、本级、本人）
   - 分配给不同用户
   - 验证各用户看到的数据范围正确

2. **跨部门数据访问**
   - 创建多个部门
   - 验证用户只能看到有权限的部门数据

### 5.3 审计字段测试

1. **创建操作**
   - 创建数据后，验证创建人、创建时间正确记录

2. **更新操作**
   - 更新数据后，验证更新人、更新时间正确记录

3. **删除操作**
   - 删除数据后，验证逻辑删除生效（数据仍存在但标记为已删除）

## 六、实施优先级

### 高优先级（必须完成）
1. ✅ 用户信息扩展 - 存储和传递租户ID
2. ✅ 租户管理页面 - 基础CRUD功能

### 中优先级（建议完成）
1. Workflow模块UI优化 - 显示审计信息
2. 租户管理页面 - 高级功能（配额管理、统计信息）

### 低优先级（可选）
1. 其他模块审计信息展示
2. 数据权限可视化展示

## 七、注意事项

1. **租户ID传递**
   - 所有API请求都必须携带 `X-Tenant-Id` 请求头
   - 后端会根据此请求头进行租户数据隔离

2. **错误处理**
   - 如果用户访问无权限的数据，后端会返回403错误
   - 前端需要友好地提示用户

3. **超级管理员**
   - 超级管理员可能需要跨租户访问数据
   - 需要提供租户切换功能（如果需要）

4. **兼容性**
   - 确保现有功能不受影响
   - 渐进式添加新功能

## 八、前端文件清单

需要创建或修改的文件：

### 新增文件
```
src/views/system/tenant/
├── index.vue           # 租户列表页面
├── components/
│   ├── TenantForm.vue  # 租户表单组件
│   └── TenantDetail.vue # 租户详情组件
└── api/
    └── tenant.js       # 租户API接口
```

### 修改文件
```
src/
├── store/modules/user.js    # 添加租户ID管理
├── utils/request.js         # 添加租户ID请求头
├── permission.js            # 权限路由配置（如需要）
└── api/
    └── workflow/
        ├── definition.js    # 流程定义API（可能需要调整）
        └── instance.js      # 流程实例API（可能需要调整）
```

## 九、API接口汇总

### 租户管理接口
- `GET /tenant/list` - 租户列表
- `GET /tenant/{id}` - 租户详情
- `POST /tenant` - 创建租户
- `PUT /tenant` - 更新租户
- `DELETE /tenant/{id}` - 删除租户
- `PUT /tenant/{id}/status` - 更新状态

### 现有接口调整
- 所有接口请求需添加 `X-Tenant-Id` 请求头
- 后端会自动处理租户数据隔离和数据权限

## 十、总结

P1任务的后端实现已全部完成，前端主要需要：

1. **必须完成**：用户信息扩展，存储和传递租户ID
2. **必须完成**：创建租户管理页面
3. **建议完成**：Workflow模块UI优化，显示审计信息
4. **可选完成**：其他模块的审计信息展示

前端调整相对简单，主要是添加租户管理页面和在请求中携带租户ID。后端已经处理了所有复杂的租户隔离和数据权限逻辑。
