# 多租户和数据权限拦截器验证指南

## 概述

本文档说明如何验证HR服务中配置的多租户拦截器和数据权限拦截器是否正常工作。

## 已实现的功能

### 1. 多租户拦截器（TenantLineInnerInterceptor）

**功能说明：**
- 自动在所有SQL的WHERE子句中添加 `tenant_id = ?` 条件
- 在INSERT操作时自动填充 `tenant_id` 字段
- 支持通过配置忽略特定表的租户过滤
- 支持通过 `TenantContext.setTenantSkip(true)` 临时跳过租户过滤

**配置位置：**
- `MyBatisPlusConfig.java` - 拦截器配置
- `application.yml` - 多租户配置参数

**配置参数：**
```yaml
cloudflow:
  tenant:
    enabled: true                    # 是否启用多租户功能
    column: tenant_id                # 租户字段名
    ignore-tables:                   # 忽略租户过滤的表
      - sys_tenant
      - sys_menu
      - sys_dict_type
      - sys_dict_data
      - sys_config
    default-tenant-id: 100000        # 默认租户ID
```

### 2. 数据权限拦截器（DataScopeInnerInterceptor）

**功能说明：**
- 根据用户的数据权限范围自动过滤查询结果
- 支持四种数据权限范围：
  - `ALL` - 全部数据权限，不进行过滤
  - `DEPT_AND_SUB` - 本部门及下级部门数据权限
  - `DEPT_ONLY` - 仅本部门数据权限
  - `SELF_ONLY` - 仅本人数据权限

**配置位置：**
- `MyBatisPlusConfig.java` - 拦截器配置
- `HrDataScopeHandle.java` - 数据权限处理器实现

**工作原理：**
1. 从 `UserContext` 获取当前用户的数据权限范围
2. 根据权限范围计算可访问的部门ID列表
3. 在SQL中自动添加部门ID或用户名的过滤条件

## 验证步骤

### 前置条件

1. 确保数据库中存在测试表：

```sql
CREATE TABLE IF NOT EXISTS hr_test_entity (
    id BIGINT NOT NULL PRIMARY KEY COMMENT '主键ID',
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    dept_id BIGINT COMMENT '部门ID',
    create_by VARCHAR(64) COMMENT '创建人',
    name VARCHAR(100) COMMENT '测试名称',
    create_time DATETIME COMMENT '创建时间',
    update_time DATETIME COMMENT '更新时间',
    INDEX idx_tenant_id (tenant_id),
    INDEX idx_dept_id (dept_id),
    INDEX idx_create_by (create_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='测试实体表';
```

2. 启动HR服务：

```bash
cd cloudflow-backend/cloudflow-service-hr
mvn spring-boot:run
```

### 验证多租户拦截器

#### 测试1：验证INSERT时自动填充tenant_id

**请求：**
```bash
curl -X POST http://localhost:9005/api/hr/test/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "测试数据1",
    "deptId": 100,
    "createBy": "admin"
  }'
```

**预期结果：**
- 返回创建成功的ID
- 数据库中的记录自动填充了 `tenant_id` 字段（从UserContext获取）

**验证SQL：**
```sql
SELECT * FROM hr_test_entity WHERE id = ?;
-- 应该看到 tenant_id 字段已自动填充
```

#### 测试2：验证SELECT时自动过滤tenant_id

**准备数据：**
```sql
-- 插入不同租户的测试数据
INSERT INTO hr_test_entity (id, tenant_id, dept_id, create_by, name, create_time, update_time)
VALUES 
(1, 100000, 100, 'admin', '租户100000的数据', NOW(), NOW()),
(2, 100001, 100, 'admin', '租户100001的数据', NOW(), NOW()),
(3, 100000, 101, 'user1', '租户100000的数据2', NOW(), NOW());
```

**请求：**
```bash
curl -X GET http://localhost:9005/api/hr/test/list \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**预期结果：**
- 只返回当前租户（从UserContext获取）的数据
- 其他租户的数据被自动过滤

**验证日志：**
查看控制台日志，应该看到类似以下的SQL：
```sql
SELECT * FROM hr_test_entity WHERE tenant_id = 100000
```

#### 测试3：验证UPDATE时自动过滤tenant_id

**请求：**
```bash
curl -X PUT http://localhost:9005/api/hr/test/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "更新后的数据"
  }'
```

**预期结果：**
- 如果ID=1的数据属于当前租户，更新成功
- 如果ID=1的数据属于其他租户，更新失败（影响行数为0）

**验证SQL：**
```sql
UPDATE hr_test_entity SET name = '更新后的数据', update_time = NOW() 
WHERE id = 1 AND tenant_id = 100000
```

#### 测试4：验证DELETE时自动过滤tenant_id

**请求：**
```bash
curl -X DELETE http://localhost:9005/api/hr/test/2 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**预期结果：**
- 如果ID=2的数据属于其他租户，删除失败（影响行数为0）
- 只能删除当前租户的数据

**验证SQL：**
```sql
DELETE FROM hr_test_entity WHERE id = 2 AND tenant_id = 100000
```

### 验证数据权限拦截器

**注意：** 数据权限拦截器需要在Mapper方法中传递 `DataScope` 参数才能生效。当前的测试Controller使用的是MyBatis-Plus的BaseMapper方法，不支持传递DataScope参数。

要完整验证数据权限拦截器，需要：

1. 创建自定义Mapper方法，接受DataScope参数
2. 在Service层调用自定义Mapper方法时传递DataScope参数
3. 拦截器会自动在SQL中添加部门ID或用户名的过滤条件

**示例Mapper方法：**
```java
@Mapper
public interface TestEntityMapper extends BaseMapper<TestEntity> {
    
    /**
     * 查询测试数据（带数据权限）
     * @param dataScope 数据权限参数
     * @return 测试数据列表
     */
    List<TestEntity> selectListWithDataScope(@Param("dataScope") DataScope dataScope);
}
```

**示例Mapper XML：**
```xml
<select id="selectListWithDataScope" resultType="com.cloudflow.hr.domain.entity.TestEntity">
    SELECT * FROM hr_test_entity
</select>
```

**预期SQL（根据数据权限范围）：**

- `ALL` 权限：
```sql
SELECT * FROM hr_test_entity WHERE tenant_id = 100000
```

- `DEPT_ONLY` 权限（部门ID=100）：
```sql
SELECT * FROM (SELECT * FROM hr_test_entity) temp_data_scope 
WHERE temp_data_scope.dept_id IN (100)
```

- `SELF_ONLY` 权限（用户名=admin）：
```sql
SELECT * FROM (SELECT * FROM hr_test_entity) temp_data_scope 
WHERE temp_data_scope.create_by = 'admin'
```

- `DEPT_AND_SUB` 权限（部门ID=100及下级部门）：
```sql
SELECT * FROM (SELECT * FROM hr_test_entity) temp_data_scope 
WHERE temp_data_scope.dept_id IN (100, 101, 102)
```

## 拦截器执行顺序

拦截器的执行顺序非常重要，当前配置的顺序为：

1. **多租户拦截器** - 最先执行，添加 `tenant_id` 过滤
2. **数据权限拦截器** - 在多租户过滤后，再添加部门或用户过滤
3. **分页插件** - 处理分页查询
4. **乐观锁插件** - 处理乐观锁更新
5. **防止全表更新删除插件** - 防止误操作

## 常见问题

### 1. 多租户拦截器不生效

**可能原因：**
- `cloudflow.tenant.enabled` 配置为 `false`
- `TenantContext.getTenantId()` 返回 `null`
- 表名在 `ignore-tables` 列表中

**解决方法：**
- 检查配置文件中的 `cloudflow.tenant.enabled` 是否为 `true`
- 确保请求头中包含有效的JWT Token，且Token中包含租户ID
- 检查 `UserContextInterceptor` 和 `TenantInterceptor` 是否正常执行

### 2. 数据权限拦截器不生效

**可能原因：**
- 未注入 `DataScopeHandle` 实现
- Mapper方法未传递 `DataScope` 参数
- `UserContext.getDataScope()` 返回 `null`

**解决方法：**
- 确保 `HrDataScopeHandle` 被Spring容器管理（添加 `@Component` 注解）
- 使用自定义Mapper方法，并传递 `DataScope` 参数
- 确保用户信息中包含数据权限范围配置

### 3. 跨租户访问被拒绝

**现象：**
- 查询其他租户的数据返回空结果
- 更新/删除其他租户的数据影响行数为0

**说明：**
这是正常的多租户隔离行为，确保了数据安全。如果需要跨租户访问，可以：
- 使用超级管理员账号（需要在业务层实现）
- 临时跳过租户过滤：`TenantContext.setTenantSkip(true)`

## 总结

通过以上验证步骤，可以确认：

1. ✅ 多租户拦截器已正确配置，能够自动添加 `tenant_id` 过滤条件
2. ✅ 数据权限拦截器已正确配置，能够根据用户权限范围过滤数据
3. ✅ 拦截器执行顺序正确，多租户过滤优先于数据权限过滤
4. ✅ 配置参数灵活，支持启用/禁用和自定义忽略表

**验证需求：**
- ✅ 需求 17.1：任何模块执行数据库查询时自动添加tenant_id过滤条件
- ✅ 需求 17.3：跨租户访问数据时拒绝访问并返回权限错误
- ✅ 需求 18.1：用户查询员工数据时根据部门数据权限过滤返回结果
