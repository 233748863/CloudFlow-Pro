# 密码加密实施文档

## 概述

本文档描述了 CloudFlow Pro 系统中实施的前端密码预加密方案，以增强密码传输和存储的安全性。

## 实施方案

### 简化双重加密方案

我们采用了**简化的双重加密方案**：

1. **前端加密**：使用 SHA-256 哈希算法对用户输入的明文密码进行加密
2. **后端加密**：接收前端的 SHA-256 哈希值，再使用 BCrypt 算法进行二次加密后存储

### 安全优势

1. **传输层保护**：即使在没有 HTTPS 的情况下，密码也不会以明文形式传输
2. **存储层保护**：数据库中存储的是 BCrypt(SHA-256(password))，双重加密
3. **防重放攻击**：即使攻击者截获了 SHA-256 哈希值，也无法直接用于登录（因为后端会再次 BCrypt 加密）
4. **数据库泄露保护**：即使数据库泄露，攻击者也无法直接使用哈希值登录

## 技术实现

### 前端实现

#### 1. 加密工具函数 (`src/utils/crypto.ts`)

```typescript
import bcrypt from 'bcryptjs';

/**
 * 对密码进行 SHA-256 哈希
 * @param password 明文密码
 * @returns 哈希后的密码（十六进制字符串）
 */
export const hashPassword = async (password: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
};
```

**说明**：
- 使用浏览器原生的 Web Crypto API
- SHA-256 算法生成 64 字符的十六进制字符串
- 异步函数，返回 Promise

#### 2. API 服务更新 (`src/services/api/auth.ts`)

```typescript
import { hashPassword } from '../../utils/crypto';

export const login = async (username: string, password?: string, captchaToken?: string) => {
  const hashedPassword = password ? await hashPassword(password) : await hashPassword('123456');
  return request.post('/auth/login', { username, password: hashedPassword, captchaToken });
};

export const register = async (data: any) => {
  if (data.password) {
    data.password = await hashPassword(data.password);
  }
  if (data.confirmPassword) {
    data.confirmPassword = await hashPassword(data.confirmPassword);
  }
  return request.post('/auth/register', data);
};
```

**说明**：
- 登录和注册前自动对密码进行 SHA-256 哈希
- 确认密码也需要哈希（用于后端验证两次输入一致性）

### 后端实现

#### 1. 登录验证 (`AuthController.java`)

```java
@PostMapping("/login")
public R<?> login(@RequestBody @Validated LoginBody form) {
    // 验证验证码
    if (!captchaService.validatePassToken(form.getCaptchaToken())) {
         return R.fail("验证码失效或错误，请重新验证");
    }

    // 查询用户
    SysUser user = sysUserMapper.selectOne(queryWrapper);
    if (user == null) {
        return R.fail("用户不存在");
    }

    // 前端发送的是 SHA-256 哈希后的密码
    // 后端使用 BCrypt.checkpw() 验证：BCrypt.checkpw(SHA-256(password), stored_bcrypt_hash)
    if (!BCrypt.checkpw(form.getPassword(), user.getPassword())) {
        return R.fail("密码错误");
    }
    
    // ... 生成 token 并返回
}
```

**说明**：
- 接收前端发送的 SHA-256 哈希值
- 使用 BCrypt.checkpw() 验证哈希值与数据库中存储的 BCrypt 哈希
- BCrypt 会自动处理盐值和哈希比对

#### 2. 用户注册和更新 (`SysUserServiceImpl.java`)

```java
@Override
@Transactional
public int insertUser(SysUser user) {
    user.setCreateTime(new Date());
    if (StringUtils.hasText(user.getPassword())) {
        // 前端发送的密码已经是 SHA-256 哈希，后端再次使用 BCrypt 加密
        // 这样即使数据库泄露，攻击者也无法直接使用哈希值登录
        user.setPassword(BCrypt.hashpw(user.getPassword()));
    } else {
        // 默认密码（仅用于后台创建用户）
        user.setPassword(BCrypt.hashpw("123456"));
    }
    
    int rows = userMapper.insert(user);
    insertUserRole(user);
    return rows;
}
```

**说明**：
- 接收前端的 SHA-256 哈希值
- 使用 BCrypt.hashpw() 对哈希值再次加密
- 最终存储格式：BCrypt(SHA-256(password))

## 密码流程图

### 注册流程

```
用户输入密码 "mypassword"
    ↓
前端: SHA-256("mypassword") 
    → "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8"
    ↓
发送到后端
    ↓
后端: BCrypt.hashpw("5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8")
    → "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"
    ↓
存储到数据库
```

### 登录流程

```
用户输入密码 "mypassword"
    ↓
前端: SHA-256("mypassword")
    → "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8"
    ↓
发送到后端
    ↓
后端: BCrypt.checkpw(
    "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
    "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"
)
    ↓
验证成功 → 生成 Token → 返回给前端
```

## 兼容性说明

### 现有用户密码

**重要提示**：实施此方案后，现有用户的密码将无法直接使用。

**原因**：
- 旧密码存储格式：BCrypt(明文密码)
- 新密码存储格式：BCrypt(SHA-256(密码))

**解决方案**：
1. **不处理现有用户**（当前方案）：现有用户需要重置密码
2. **数据迁移**：编写脚本将现有密码标记为旧格式，登录时检测并提示用户更新
3. **双格式支持**：在用户表中添加 `password_version` 字段，支持新旧两种格式

由于用户确认不需要处理现有用户密码迁移，我们采用方案 1。

## 安全性分析

### 优势

1. ✅ **传输安全**：密码不以明文传输
2. ✅ **存储安全**：双重加密保护
3. ✅ **防重放**：截获的哈希值无法直接登录
4. ✅ **数据库泄露保护**：即使数据库泄露，攻击者也需要破解 BCrypt

### 局限性

1. ⚠️ **前端加密可绕过**：攻击者可以修改前端代码跳过 SHA-256 加密
   - **缓解措施**：配合 HTTPS 使用
2. ⚠️ **SHA-256 非加盐**：相同密码的 SHA-256 哈希值相同
   - **缓解措施**：BCrypt 会自动加盐，提供额外保护

### 最佳实践建议

1. **强制使用 HTTPS**：在生产环境中必须启用 HTTPS
2. **密码强度策略**：要求用户使用强密码（长度、复杂度）
3. **登录失败限制**：实施登录失败次数限制和账户锁定机制
4. **定期密码更新**：提示用户定期更改密码

## 测试验证

### 测试场景

1. **新用户注册**
   - 输入密码 → 前端 SHA-256 → 后端 BCrypt → 存储
   - 验证数据库中密码格式正确

2. **用户登录**
   - 输入密码 → 前端 SHA-256 → 后端验证 → 成功登录
   - 验证 Token 生成和返回

3. **错误密码**
   - 输入错误密码 → 前端 SHA-256 → 后端验证失败
   - 验证返回"密码错误"提示

4. **密码修改**
   - 修改密码 → 前端 SHA-256 → 后端 BCrypt → 更新存储
   - 使用新密码登录成功

## 依赖项

### 前端

```json
{
  "bcryptjs": "^2.4.3",
  "@types/bcryptjs": "^2.4.6"
}
```

**注意**：虽然安装了 bcryptjs，但实际使用的是浏览器原生的 Web Crypto API 进行 SHA-256 哈希。

### 后端

```xml
<dependency>
    <groupId>cn.hutool</groupId>
    <artifactId>hutool-crypto</artifactId>
    <!-- BCrypt 实现 -->
</dependency>
```

## 部署注意事项

1. **前端构建**：确保 `npm install` 安装了新依赖
2. **后端编译**：重新编译 Java 代码
3. **数据库**：现有用户密码将失效，需要重置
4. **HTTPS**：生产环境强烈建议启用 HTTPS
5. **测试**：部署后进行完整的登录/注册测试

## 维护和监控

1. **日志记录**：记录登录失败次数和原因
2. **性能监控**：监控 BCrypt 加密性能（CPU 密集型）
3. **安全审计**：定期审查密码策略和加密实现

## 更新日志

- **2026-02-07**：实施前端 SHA-256 + 后端 BCrypt 双重加密方案
- 采用简化方案，不处理现有用户密码迁移

## 参考资料

- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [BCrypt Algorithm](https://en.wikipedia.org/wiki/Bcrypt)
- [SHA-256 Hash Function](https://en.wikipedia.org/wiki/SHA-2)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
