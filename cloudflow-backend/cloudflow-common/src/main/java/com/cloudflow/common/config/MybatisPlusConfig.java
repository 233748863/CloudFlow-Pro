package com.cloudflow.common.config;

import com.baomidou.mybatisplus.annotation.DbType;
import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.handler.TenantLineHandler;
import com.baomidou.mybatisplus.extension.plugins.inner.PaginationInnerInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.TenantLineInnerInterceptor;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.datascope.DataScopeHandle;
import com.cloudflow.common.datascope.DataScopeInnerInterceptor;
import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.expression.LongValue;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.Arrays;
import java.util.List;

@Configuration
public class MybatisPlusConfig {
    
    @Autowired(required = false)
    private DataScopeHandle dataScopeHandle;
    
    // 真正跨租户共享的表（不需要租户隔离）
    private static final List<String> IGNORE_TENANT_TABLES = Arrays.asList(
            "sys_tenant",       // 租户表本身
            "sys_menu",         // 菜单权限（全局共享）
            "sys_dict_type",    // 字典类型（全局共享）
            "sys_dict_data",    // 字典数据（全局共享）
            "sys_config"        // 系统配置（全局共享）
    );

    /**
     * 分页插件 + 多租户插件 + 数据权限插件
     */
    @Bean
    public MybatisPlusInterceptor mybatisPlusInterceptor() {
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
        
        // 多租户插件
        interceptor.addInnerInterceptor(new TenantLineInnerInterceptor(new TenantLineHandler() {
            @Override
            public Expression getTenantId() {
                // 从 TenantContext 获取租户ID，默认 100000
                Long tenantId = TenantContext.getTenantId();
                if (tenantId == null) {
                    tenantId = 100000L;
                }
                return new LongValue(tenantId);
            }

            @Override
            public String getTenantIdColumn() {
                return "tenant_id";
            }

            @Override
            public boolean ignoreTable(String tableName) {
                return IGNORE_TENANT_TABLES.contains(tableName);
            }
        }));
        
        // 数据权限插件 (如果存在DataScopeHandle实现)
        if (dataScopeHandle != null) {
            interceptor.addInnerInterceptor(new DataScopeInnerInterceptor(dataScopeHandle));
        }
        
        // 分页插件
        interceptor.addInnerInterceptor(new PaginationInnerInterceptor(DbType.MYSQL));
        return interceptor;
    }
}
