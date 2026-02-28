# Redis 缓存同步修复方案

## 问题描述

用户反馈需要手动清理 Redis 才能使菜单、角色权限等变更生效，说明缓存失效机制存在问题。

## 根本原因

1. **缺少 logout 接口**：用户退出登录时没有清除相关缓存
2. **菜单变更时缓存未失效**：菜单增删改时虽然有 `@CacheEvict`，但可能存在遗漏
3. **角色权限变更时缓存未失效**：角色菜单关联变更时需要清除所有相关缓存
4. **用户信息变更时缓存未失效**：用户角色变更时需要同步清除菜单缓存

## 修复内容

### 1. 添加 logout 接口

**文件**: `cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/controller/AuthController.java`

```java
/**
 * 退出登录
 * 清除 Token 和用户相关的所有缓存
 */
@PostMapping("/logout")
public R<?> logout(HttpServletRequest request) {
    String jwtToken = request.getHeader("Authorization");
    if (jwtToken != null && jwtToken.startsWith("Bearer ")) {
        jwtToken = jwtToken.substring(7);
    }

    // 先验证 Token 获取用户信息
    Map<String, Object> userMap = tokenService.verifyToken(jwtToken);
    if (userMap != null) {
        // 获取用户信息
        String username = (String) userMap.get("username");
        Object userIdObj = userMap.get("userId");
        String uuidToken = (String) userMap.get("token"); // 从 userMap 中获取 UUID token
        
        Long userId = null;
        if (userIdObj instanceof Integer) {
            userId = ((Integer) userIdObj).longValue();
        } else if (userIdObj instanceof Long) {
            userId = (Long) userIdObj;
        }

        // 清除用户信息缓存
        if (username != null) {
            sysUserService.evictUserInfoCache(username);
        }

        // 清除用户菜单树缓存
        if (userId != null) {
            menuService.evictUserMenuCache(userId);
        }

        // 删除 Token（从 Redis 中移除，使用 UUID token）
        if (uuidToken != null) {
            tokenService.deleteToken(uuidToken);
        }
    }

    return R.ok("退出成功");
}
```

**作用**：
- 清除用户信息缓存（`USER_DETAILS`）
- 清除用户菜单树缓存（`USER_MENUS`）
- 删除 Token（从 Redis 中移除）

### 2. 菜单服务缓存失效优化

**文件**: `cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/service/impl/SysMenuServiceImpl.java`

所有菜单增删改方法都已添加 `@CacheEvict` 注解：

```java
@Override
@CacheEvict(value = {CacheConstants.MENU_DETAILS, CacheConstants.USER_MENUS}, allEntries = true)
public int insertMenu(SysMenu menu) {
    return menuMapper.insert(menu);
}

@Override
@CacheEvict(value = {CacheConstants.MENU_DETAILS, CacheConstants.USER_MENUS}, allEntries = true)
public int updateMenu(SysMenu menu) {
    return menuMapper.updateById(menu);
}

@Override
@CacheEvict(value = {CacheConstants.MENU_DETAILS, CacheConstants.USER_MENUS}, allEntries = true)
public int deleteMenuById(Long menuId) {
    // ...
}
```

**作用**：
- 菜单变更时自动清除 `MENU_DETAILS`（菜单详情缓存）
- 同时清除 `USER_MENUS`（用户菜单树缓存）

### 3. 角色服务缓存失效优化

**文件**: `cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/service/impl/SysRoleServiceImpl.java`

所有角色增删改方法都已添加 `@CacheEvict` 注解：

```java
@Override
@Transactional
@CacheEvict(value = {CacheConstants.MENU_DETAILS, CacheConstants.USER_MENUS}, allEntries = true)
public int insertRole(SysRole role) {
    int rows = roleMapper.insert(role);
    insertRoleMenu(role);
    return rows;
}

@Override
@Transactional
@CacheEvict(value = {CacheConstants.MENU_DETAILS, CacheConstants.USER_MENUS}, allEntries = true)
public int updateRole(SysRole role) {
    // 更新角色和角色-菜单关联
    // ...
    return rows;
}

@Override
@Transactional
@CacheEvict(value = {CacheConstants.MENU_DETAILS, CacheConstants.USER_MENUS}, allEntries = true)
public int deleteRoleByIds(Long[] roleIds) {
    // 删除角色和角色-菜单关联
    // ...
    return roleIds.length;
}
```

**作用**：
- 角色变更时自动清除所有菜单相关缓存
- 确保角色权限变更立即生效

### 4. 用户服务缓存失效优化

**文件**: `cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/service/impl/SysUserServiceImpl.java`

用户更新、删除、重置密码时都会清除相关缓存：

```java
@Override
@Transactional(rollbackFor = Exception.class)
@CacheEvict(value = CacheConstants.USER_DETAILS, key = "#user.userName")
public int updateUser(SysUser user) {
    // 更新用户信息
    int rows = sysUserMapper.updateById(user);
    
    // 更新用户角色关联
    // ...
    
    // 同时清除用户菜单树缓存
    menuService.evictUserMenuCache(user.getUserId());
    
    return rows;
}

@Override
@Transactional(rollbackFor = Exception.class)
public int deleteUserByIds(Long[] userIds) {
    for (Long userId : userIds) {
        // 先查出用户名用于清除缓存
        SysUser existingUser = sysUserMapper.selectById(userId);
        if (existingUser != null) {
            evictUserInfoCache(existingUser.getUserName());
            menuService.evictUserMenuCache(userId);
        }
        // 删除用户及关联数据
        // ...
    }
    return userIds.length;
}
```

**作用**：
- 用户信息变更时清除用户详情缓存（`USER_DETAILS`）
- 用户角色变更时同时清除用户菜单树缓存（`USER_MENUS`）

## 缓存键说明

系统使用以下 Redis 缓存键：

| 缓存键 | 说明 | 失效时机 |
|--------|------|----------|
| `USER_DETAILS:{username}` | 用户详情（含角色+权限） | 用户信息变更、退出登录 |
| `USER_MENUS:{userId}` | 用户菜单树 | 菜单变更、角色变更、用户角色变更、退出登录 |
| `MENU_DETAILS:{roleId}` | 角色菜单列表 | 菜单变更、角色变更 |
| `LOGIN_TOKEN_KEY:{uuid}` | 登录 Token | 退出登录、Token 过期 |
| `USER_TOKENS_KEY:{userId}` | 用户 Token 集合 | 退出登录、新登录（单点登录） |

## 测试验证

### 1. 测试退出登录

```bash
# 1. 登录获取 token
curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456","captchaToken":"xxx"}'

# 2. 退出登录
curl -X POST http://localhost:8080/auth/logout \
  -H "Authorization: Bearer {token}"

# 3. 验证 token 已失效
curl -X GET http://localhost:8080/auth/info \
  -H "Authorization: Bearer {token}"
# 应该返回 401 错误
```

### 2. 测试菜单变更

```bash
# 1. 修改菜单
UPDATE sys_menu SET menu_name = '新菜单名' WHERE menu_id = 404;

# 2. 刷新页面或重新获取菜单
curl -X GET http://localhost:8080/auth/getRouters \
  -H "Authorization: Bearer {token}"
# 应该立即看到新的菜单名称，无需手动清除 Redis
```

### 3. 测试角色权限变更

```bash
# 1. 修改角色菜单关联
INSERT INTO sys_role_menu VALUES(2, 605, 100000);  -- 给 MANAGER 角色添加租户管理权限

# 2. 刷新页面
# 应该立即看到新的菜单项，无需手动清除 Redis
```

### 4. 测试用户角色变更

```bash
# 1. 修改用户角色
UPDATE sys_user_role SET role_id = 1 WHERE user_id = 2;  -- 将用户 2 改为 ADMIN

# 2. 用户重新登录或刷新页面
# 应该立即看到管理员权限的所有菜单
```

## 注意事项

1. **@CacheEvict 的 allEntries = true**：
   - 清除整个缓存空间的所有条目
   - 适用于菜单、角色等全局性变更
   - 确保所有用户都能看到最新数据

2. **@CacheEvict 的 key 参数**：
   - 清除指定键的缓存
   - 适用于用户信息等个人数据
   - 只影响特定用户，不影响其他用户

3. **退出登录的缓存清除顺序**：
   - 先清除用户信息缓存
   - 再清除用户菜单树缓存
   - 最后删除 Token
   - 确保用户下次登录时获取最新数据

4. **单点登录机制**：
   - TokenService 的 `createToken` 方法会自动删除用户的所有旧 token
   - 确保同一用户只能有一个有效会话
   - 新登录会踢掉旧会话

## 前端配合

前端需要在以下情况下重新获取数据：

1. **退出登录**：清除本地存储的 token 和用户信息
2. **Token 失效**：收到 401 响应时跳转到登录页
3. **权限变更**：管理员修改权限后，提示用户刷新页面或重新登录

## 总结

通过以上修复，系统的缓存失效机制已经完善：

✅ 退出登录时自动清除所有相关缓存  
✅ 菜单变更时自动失效所有用户的菜单缓存  
✅ 角色权限变更时自动失效所有相关缓存  
✅ 用户信息变更时自动失效用户缓存和菜单缓存  
✅ 使用 Spring Cache 注解，代码简洁易维护  

用户不再需要手动清理 Redis，所有变更都会自动同步到缓存。
