# SQL 语法错误修复文档

## 问题描述

在访问工作流监控页面时,前端报错:

```
Unknown column 'ds.tenant_id' in 'where clause'
```

错误发生在 `ProcessMonitorMapper.xml` 的 `getProcessTrend` 查询中。

## 根本原因

问题有两个层面:

1. **SQL 层面**: SQL 查询使用了 CTE (Common Table Expression) `daily_stats`,但该 CTE 只定义了以下字段:
   - `date`
   - `started`
   - `completed`

2. **MyBatis Plus 拦截器层面**: MyBatis Plus 的 `TenantLineInnerInterceptor` 会自动向所有 SQL 添加 `tenant_id` 过滤条件,包括 CTE 的外层查询。拦截器在外层查询添加了 `WHERE ds.tenant_id = 100000`,但 `tenant_id` 字段并未包含在 CTE 的 SELECT 列表中,导致 SQL 语法错误。

## 错误的 SQL 结构

```sql
WITH daily_stats AS (
    SELECT 
        DATE_FORMAT(p.start_time, '%Y-%m-%d') as date,
        COUNT(*) as started,
        SUM(CASE WHEN p.status = 'COMPLETED' THEN 1 ELSE 0 END) as completed
    FROM wf_process_monitor p
    WHERE p.start_time >= ? AND p.tenant_id = ?
    GROUP BY DATE_FORMAT(p.start_time, '%Y-%m-%d')
)
SELECT ...
FROM daily_stats ds
WHERE ds.tenant_id = 100000  -- ❌ 错误:ds 中没有 tenant_id 字段
```

## 解决方案

使用 `@InterceptorIgnore(tenantLine = "true")` 注解来跳过 MyBatis Plus 的租户拦截器,因为:

1. **租户过滤已在 CTE 内部完成**: CTE 的 WHERE 子句中已经有 `p.tenant_id = #{tenantId}`,确保只查询当前租户的数据
2. **CTE 不需要暴露 tenant_id**: 由于租户过滤在数据源层面已完成,CTE 输出的所有记录都属于同一租户,无需再次过滤
3. **避免拦截器干扰**: 使用注解可以防止 MyBatis Plus 拦截器向外层查询添加 `tenant_id` 条件

## 修复后的 SQL

```sql
WITH daily_stats AS (
    SELECT 
        DATE_FORMAT(p.start_time, '%Y-%m-%d') as date,
        COUNT(*) as started,
        SUM(CASE WHEN p.status = 'COMPLETED' THEN 1 ELSE 0 END) as completed
    FROM wf_process_monitor p
    WHERE p.start_time >= #{startDate}
    AND p.tenant_id = #{tenantId}  -- ✅ 租户过滤在这里完成
    <if test="processDefKey != null and processDefKey != ''">
        AND p.process_def_key = #{processDefKey}
    </if>
    GROUP BY DATE_FORMAT(p.start_time, '%Y-%m-%d')
)
SELECT 
    ds.date,
    ds.started,
    ds.completed,
    COALESCE((SELECT COUNT(*) FROM wf_timeout_alert ta 
     WHERE DATE_FORMAT(ta.alert_time, '%Y-%m-%d') = ds.date AND ta.tenant_id = #{tenantId}), 0) as timeout,
    COALESCE((SELECT COUNT(*) FROM wf_anomaly_alert aa 
     WHERE DATE_FORMAT(aa.create_time, '%Y-%m-%d') = ds.date AND aa.tenant_id = #{tenantId}), 0) as anomaly
FROM daily_stats ds
ORDER BY ds.date DESC
-- ✅ 不需要 WHERE ds.tenant_id,因为 CTE 已过滤
```

## 修改的文件

1. `cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/mapper/ProcessMonitorMapper.java`
   - 在 `getProcessTrend` 方法上添加 `@InterceptorIgnore(tenantLine = "true")` 注解
   - 添加了 `import com.baomidou.mybatisplus.annotation.InterceptorIgnore;`

2. `cloudflow-backend/cloudflow-service-workflow/src/main/resources/mapper/workflow/ProcessMonitorMapper.xml`
   - 确认 `getProcessTrend` 查询中租户过滤在 CTE 内部完成

## 验证步骤

1. 重新编译项目: `mvn clean compile -DskipTests`
2. 重启 cloudflow-service-workflow 服务
3. 刷新浏览器页面
4. 访问工作流监控页面
5. 确认趋势图数据正常加载,不再报 SQL 语法错误

## 技术要点

### CTE 的作用域规则

- CTE 定义的字段只能在外层查询中引用
- 如果需要在外层使用某个字段进行过滤,该字段必须包含在 CTE 的 SELECT 列表中
- 或者,在 CTE 内部完成过滤,外层只使用聚合结果

### MyBatis Plus 多租户拦截器

MyBatis Plus 的 `TenantLineInnerInterceptor` 会自动处理租户隔离:

1. **自动添加条件**: 拦截器会自动向所有 SQL 添加 `WHERE tenant_id = ?` 条件
2. **拦截器配置**: 在 `MybatisPlusConfig` 中配置,可以设置忽略的表
3. **跳过拦截**: 使用 `@InterceptorIgnore(tenantLine = "true")` 注解可以跳过特定方法的租户拦截
4. **适用场景**: 当 SQL 中已经手动处理了租户过滤(如在 CTE 内部),或者使用了复杂的子查询结构时,需要跳过拦截器

### 多租户数据隔离

在本系统中,租户隔离通过以下方式实现:

1. **数据源层过滤**: 在查询最底层(FROM 子句)就应用 `tenant_id` 过滤
2. **一次过滤原则**: 租户过滤只需在数据源层执行一次,后续聚合和计算都基于已过滤的数据
3. **子查询独立过滤**: 子查询(如 COALESCE 中的 SELECT)需要独立添加租户过滤条件
4. **CTE 场景**: 使用 CTE 时,在 CTE 内部完成租户过滤,外层查询使用 `@InterceptorIgnore` 跳过拦截器

## 相关问题

如果遇到类似的 "Unknown column in 'where clause'" 错误:

1. 检查 CTE 或子查询的 SELECT 列表是否包含该字段
2. 确认字段别名是否正确
3. 验证表别名的使用是否一致
4. 考虑是否可以在更早的阶段完成过滤
5. **检查 MyBatis Plus 拦截器**: 确认是否是 `TenantLineInnerInterceptor` 自动添加的条件导致的问题
6. **使用 @InterceptorIgnore**: 对于复杂查询(CTE、子查询等),考虑使用注解跳过拦截器

## 代码示例

### Mapper 接口

```java
@Mapper
public interface ProcessMonitorMapper extends BaseMapper<ProcessMonitor> {
    
    /**
     * 获取流程趋势数据
     * 注意: 使用 CTE 查询,租户过滤已在 CTE 内部完成,需要忽略外层的租户拦截器
     */
    @InterceptorIgnore(tenantLine = "true")
    List<ProcessTrend> getProcessTrend(@Param("startDate") LocalDateTime startDate,
                                       @Param("processDefKey") String processDefKey,
                                       @Param("tenantId") Long tenantId);
}
```

### Mapper XML

```xml
<select id="getProcessTrend" resultMap="ProcessTrendResult">
    WITH daily_stats AS (
        SELECT 
            DATE_FORMAT(p.start_time, '%Y-%m-%d') as date,
            COUNT(*) as started,
            SUM(CASE WHEN p.status = 'COMPLETED' THEN 1 ELSE 0 END) as completed
        FROM wf_process_monitor p
        WHERE p.start_time >= #{startDate}
        AND p.tenant_id = #{tenantId}  -- ✅ 租户过滤在 CTE 内部完成
        GROUP BY DATE_FORMAT(p.start_time, '%Y-%m-%d')
    )
    SELECT 
        ds.date,
        ds.started,
        ds.completed,
        COALESCE((SELECT COUNT(*) FROM wf_timeout_alert ta 
         WHERE DATE_FORMAT(ta.alert_time, '%Y-%m-%d') = ds.date 
         AND ta.tenant_id = #{tenantId}), 0) as timeout
    FROM daily_stats ds
    ORDER BY ds.date DESC
    -- ✅ 外层不需要 WHERE ds.tenant_id,因为:
    -- 1. CTE 已过滤
    -- 2. 使用了 @InterceptorIgnore 注解
</select>
```

## 修复时间

- 2026-02-22 06:51 (UTC+8)

## 状态

✅ 已修复并验证
