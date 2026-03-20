package com.cloudflow.hr.config;

import com.baomidou.mybatisplus.annotation.DbType;
import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.handler.TenantLineHandler;
import com.baomidou.mybatisplus.extension.plugins.inner.BlockAttackInnerInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.OptimisticLockerInnerInterceptor;
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
 * MyBatis-Plus 配置类
 * 配置多租户拦截器、数据权限拦截器、分页插件、乐观锁插件、防止全表更新删除插件
 * 
 * 拦截器执行顺序（重要）：
 * 1. 多租户拦截器 - 自动在SQL中添加 tenant_id 过滤条件
 * 2. 数据权限拦截器 - 根据用户权限范围过滤数据
 * 3. 分页插件 - 处理分页查询
 * 4. 乐观锁插件 - 处理乐观锁更新
 * 5. 防止全表更新删除插件 - 防止误操作
 * 
 * @author CloudFlow
 * @since 1.0.0
 */
@Slf4j
@Configuration
@RequiredArgsConstructor
public class MyBatisPlusConfig {

    private final TenantConfigProperties tenantProperties;

    @Autowired(required = false)
    private DataScopeHandle dataScopeHandle;

    /**
     * MyBatis-Plus 拦截器配置
     * 注意：拦截器的执行顺序与添加顺序相关，多租户 > 数据权限 > 分页 > 乐观锁 > 防全表操作
     */
    @Bean
    public MybatisPlusInterceptor mybatisPlusInterceptor() {
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
        
        // 1. 多租户拦截器（最先执行，仅在 enabled=true 时注册）
        if (tenantProperties.isEnabled()) {
            log.info("多租户功能已启用，注册 TenantLineInnerInterceptor");
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
        } else {
            log.info("多租户功能已禁用（cloudflow.tenant.enabled=false），不注册 TenantLineInnerInterceptor");
        }
        
        // 2. 数据权限拦截器（如果存在 DataScopeHandle 实现）
        if (dataScopeHandle != null) {
            log.info("检测到 DataScopeHandle 实现，注册 DataScopeInnerInterceptor");
            interceptor.addInnerInterceptor(new DataScopeInnerInterceptor(dataScopeHandle));
        } else {
            log.info("未检测到 DataScopeHandle 实现，不注册 DataScopeInnerInterceptor");
        }
        
        // 3. 分页插件
        PaginationInnerInterceptor paginationInnerInterceptor = new PaginationInnerInterceptor(DbType.MYSQL);
        paginationInnerInterceptor.setMaxLimit(1000L); // 单页最大数量限制
        paginationInnerInterceptor.setOverflow(false); // 溢出总页数后是否进行处理
        interceptor.addInnerInterceptor(paginationInnerInterceptor);
        
        // 4. 乐观锁插件
        interceptor.addInnerInterceptor(new OptimisticLockerInnerInterceptor());
        
        // 5. 防止全表更新删除插件
        interceptor.addInnerInterceptor(new BlockAttackInnerInterceptor());
        
        return interceptor;
    }
}
