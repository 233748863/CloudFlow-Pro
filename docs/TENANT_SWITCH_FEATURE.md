# 租户切换功能实施文档

## 功能概述

为超级管理员（ADMIN角色）添加了租户切换功能，允许管理员在不同租户之间切换，以便查看和管理不同租户的数据。

## 实施日期
2026年2月12日

## 功能特性

### 1. 权限控制
- **仅超级管理员可用**：只有角色为ADMIN的用户才能看到和使用租户切换器
- **安全验证**：后端API会验证用户角色，非管理员无法调用切换接口

### 2. 用户体验
- **下拉选择器**：在顶部导航栏提供简洁的租户切换下拉菜单
- **当前租户显示**：清晰显示当前所在租户
- **实时切换**：切换后自动刷新页面，加载新租户的数据
- **加载状态**：切换过程中显示加载动画

### 3. 数据隔离
- **自动更新Token**：切换租户后自动更新JWT Token
- **请求头更新**：所有后续请求自动携带新的租户ID
- **页面刷新**：切换后刷新页面，确保所有数据都是新租户的

## 技术实现

### 后端实现

#### 1. 租户切换API
**文件：** `cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/controller/AuthController.java`

```java
@PostMapping("/switchTenant")
public R<?> switchTenant(@RequestBody Map<String, Object> params, HttpServletRequest request) {
    // 验证Token
    String token = request.getHeader("Authorization");
    Map<String, Object> userMap = tokenService.verifyToken(token);
    
    // 检查是否为超级管理员
    List<String> roles = (List<String>) userMap.get("roles");
    if (roles == null || !roles.contains("ADMIN")) {
        return R.fail(403, "只有超级管理员才能切换租户");
    }
    
    // 获取目标租户ID并更新Token
    Long targetTenantId = // ... 解析租户ID
    userMap.put("tenantId", targetTenantId);
    String newToken = tokenService.createToken(userMap);
    
    return R.ok(Map.of(
        "token", newToken,
        "tenantId", targetTenantId,
        "message", "租户切换成功"
    ));
}
```

**功能说明：**
- 验证用户身份和权限
- 检查是否为超级管理员
- 更新Token中的租户ID
- 返回新的Token和租户信息

### 前端实现

#### 1. API接口
**文件：** `cloudflow-frontend/src/services/api/auth.ts`

```typescript
export const switchTenant = async (tenantId: number): Promise<{
  token: string;
  tenantId: number;
  message: string;
}> => {
  return request.post('/auth/switchTenant', { tenantId });
};
```

#### 2. AuthContext扩展
**文件：** `cloudflow-frontend/src/context/AuthContext.tsx`

```typescript
interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => void;
  switchTenant: (tenantId: number) => Promise<void>; // 新增
}

const switchTenant = async (tenantId: number) => {
  try {
    // 调用租户切换API
    const response = await switchTenantApi(tenantId);
    
    // 更新token
    localStorage.setItem('token', response.token);
    
    // 重新获取用户信息
    const userInfo = await getInfo();
    const updatedUser = { /* ... */ };
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
    
    toast.success(`已切换到租户 ${tenantId}`);
    
    // 刷新页面以重新加载数据
    window.location.reload();
  } catch (error) {
    toast.error('租户切换失败，请重试');
    throw error;
  }
};
```

#### 3. 租户切换组件
**文件：** `cloudflow-frontend/src/components/TenantSwitcher.tsx`

**组件特性：**
- 只对ADMIN角色用户显示
- 下拉菜单展示所有可用租户
- 当前租户高亮显示
- 点击切换到目标租户
- 加载状态和错误处理

**UI设计：**
```typescript
<div className="relative">
  <button onClick={() => setIsOpen(!isOpen)}>
    <Building2 size={16} />
    <span>{currentTenant?.tenantName || `租户 ${user.tenantId}`}</span>
    <ChevronDown size={14} />
  </button>
  
  {isOpen && (
    <div className="dropdown-menu">
      {tenants.map(tenant => (
        <button onClick={() => handleSwitchTenant(tenant.tenantId)}>
          <Building2 size={14} />
          <span>{tenant.tenantName}</span>
          {tenant.tenantId === user.tenantId && <Check size={14} />}
        </button>
      ))}
    </div>
  )}
</div>
```

#### 4. 集成到MainLayout
**文件：** `cloudflow-frontend/src/layouts/MainLayout.tsx`

```typescript
import { TenantSwitcher } from '../components/TenantSwitcher';

// 在header中添加
<div className="flex items-center gap-4">
  <div className="hidden md:flex items-center gap-2 bg-slate-100 rounded-full px-3 py-1.5">
    <ShieldCheck size={14} className="text-emerald-500"/>
    <span className="text-xs font-medium text-slate-600">环境: 开发版 (Dev)</span>
  </div>
  <TenantSwitcher /> {/* 租户切换器 */}
  <button onClick={() => navigate('/office/announcement')}>
    <Bell size={20} />
  </button>
</div>
```

## 使用流程

### 1. 超级管理员登录
- 使用ADMIN角色账号登录系统
- 系统自动显示租户切换器

### 2. 查看当前租户
- 在顶部导航栏可以看到当前租户名称
- 点击租户切换器查看所有可用租户

### 3. 切换租户
1. 点击租户切换器打开下拉菜单
2. 选择目标租户
3. 系统自动切换并刷新页面
4. 切换成功后显示提示信息

### 4. 验证切换结果
- 检查顶部导航栏显示的租户名称
- 验证页面数据是否为新租户的数据
- 所有后续操作都在新租户上下文中进行

## 安全考虑

### 1. 权限验证
- **前端验证**：只有ADMIN角色才显示切换器
- **后端验证**：API接口验证用户角色
- **双重保护**：前后端都进行权限检查

### 2. Token安全
- 切换后生成新的JWT Token
- Token中包含新的租户ID
- 所有请求自动携带新Token

### 3. 数据隔离
- 切换后的所有请求都携带新租户ID
- 后端自动根据租户ID过滤数据
- 确保不会访问到其他租户的数据

## 测试建议

### 1. 功能测试
- [ ] 测试超级管理员可以看到租户切换器
- [ ] 测试普通用户看不到租户切换器
- [ ] 测试租户列表正确加载
- [ ] 测试切换到不同租户
- [ ] 测试切换后数据正确显示

### 2. 权限测试
- [ ] 测试非管理员调用切换API被拒绝
- [ ] 测试Token验证失败的情况
- [ ] 测试切换到不存在的租户

### 3. 边界测试
- [ ] 测试网络断开时的切换
- [ ] 测试并发切换
- [ ] 测试切换过程中的页面操作

## 后续优化建议

### 1. 用户体验优化
- 添加租户搜索功能
- 显示租户的更多信息（用户数、存储使用等）
- 记住最近切换的租户
- 添加快捷键支持

### 2. 性能优化
- 缓存租户列表
- 优化切换后的页面加载
- 减少不必要的API调用

### 3. 功能增强
- 添加租户切换历史记录
- 支持租户收藏功能
- 添加租户分组
- 提供租户快速切换快捷方式

## 相关文档

- [P1任务 - 前端实施完成总结](./P1_FRONTEND_IMPLEMENTATION_SUMMARY.md)
- [P1任务 - 前端调整需求文档](./P1_FRONTEND_REQUIREMENTS.md)
- [P1任务 - 租户实施进度](./P1_TENANT_IMPLEMENTATION_PROGRESS.md)

## 总结

租户切换功能已经完整实现，为超级管理员提供了便捷的租户管理能力。该功能：

1. ✅ **安全可靠**：前后端双重权限验证
2. ✅ **用户友好**：简洁直观的UI设计
3. ✅ **数据隔离**：确保租户数据安全
4. ✅ **易于使用**：一键切换，自动刷新

该功能可以立即投入使用，帮助管理员更高效地管理多租户系统。
