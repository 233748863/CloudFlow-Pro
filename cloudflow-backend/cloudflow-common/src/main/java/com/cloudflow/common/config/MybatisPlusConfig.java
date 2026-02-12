package com.cloudflow.common.config;

import com.baomidou.mybatisplus.annotation.DbType;
import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.handler.TenantLineHandler;
import com.baomidou.mybatisplus.extension.plugins.inner.PaginationInnerInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.TenantLineInnerInterceptor;
import com.cloudflow.common.datascope.DataScopeHandle;
import com.cloudflow.common.datascope.DataScopeInnerInterceptor;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.expression.LongValue;
import net.sf.jsqlparser.expression.NullValue;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * MyBatis-Plus 配置
 * 集成：多租户自动 SQL 拼接 + 数据权限拦截 + 分页
 * 
 * 多租户行为：
 * - 自动在 SQL 中追加 WHERE tenant_id = ? 条件
 * - 通过 TenantConfigProperties 配置忽略表和租户字段名
 * - 通过 TenantContext.setTenantSkip() 可临时跳过租户过滤
 * - 租户ID 为 null 时不追加条件（兼容未登录场景）
 * 
 * @author CloudFlow
 */
@Slf4j
@Configuration
@RequiredArgsConstructor
public class MybatisPlusConfig {

    private final TenantConfigProperties tenantProperties;

    @Autowired(required = false)
    private DataScopeHandle dataScopeHandle;

    /**
     * 多租户插件 + 数据权限插件 + 分页插件
     * 注意：插件顺序很重要，多租户 > 数据权限 > 分页
     */
    @Bean
    public MybatisPlusInterceptor mybatisPlusInterceptor() {
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();

        // 1. 多租户插件（最先执行）
        interceptor.addInnerInterceptor(new TenantLineInnerInterceptor(new TenantLineHandler() {
            @Override
            public Expression getTenantId() {
                Long tenantId = TenantContext.getTenantId();
                log.debug("当前租户ID >> {}", tenantId);
                // 租户ID 为 null 时返回 NullValue，配合 ignoreTable 跳过
                if (tenantId == null) {
                    return new NullValue();
                }
                return new LongValue(tenantId);
            }

            @Override
            public String getTenantIdColumn() {
                return tenantProperties.getColumn();
            }

            @Override
            public boolean ignoreTable(String tableName) {
                // 如果设置了跳过标识，忽略所有表的租户过滤
                if (TenantContext.getTenantSkip()) {
                    return true;
                }
                // 租户ID 为 null 时，不进行过滤（兼容未登录/系统内部调用）
                if (TenantContext.getTenantId() == null) {
                    return true;
                }
                // 检查是否在忽略表列表中
                return tenantProperties.getIgnoreTables().contains(tableName);
            }
        }));

        // 2. 数据权限插件（如果存在 DataScopeHandle 实现）
        if (dataScopeHandle != null) {
            interceptor.addInnerInterceptor(new DataScopeInnerInterceptor(dataScopeHandle));
        }

        // 3. 分页插件（最后执行）
        interceptor.addInnerInterceptor(new PaginationInnerInterceptor(DbType.MYSQL));
        return interceptor;
    }
}
