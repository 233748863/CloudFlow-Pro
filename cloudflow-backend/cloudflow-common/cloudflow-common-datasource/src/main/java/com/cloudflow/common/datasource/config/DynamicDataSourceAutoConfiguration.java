package com.cloudflow.common.datasource.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigureBefore;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;

/**
 * CloudFlow 多数据源自动配置
 * <p>
 * 核心原理：
 * 1. 排除 Spring Boot 默认的 DataSourceAutoConfiguration（单数据源）
 * 2. 由 dynamic-datasource-spring-boot3-starter 接管数据源创建
 * 3. 在 Nacos 配置中心配置多个数据源，通过 spring.datasource.dynamic 前缀
 * 4. 在 Mapper 接口上使用 @DS("数据源名") 注解切换数据源
 * </p>
 *
 * <p>使用示例：</p>
 * <pre>
 * // 在 Mapper 上加 @DS 注解指定数据源，不加则使用默认的 primary 数据源
 * {@literal @}DS("master")
 * {@literal @}Mapper
 * public interface UserMapper extends BaseMapper&lt;User&gt; {}
 *
 * {@literal @}DS("report")
 * {@literal @}Mapper
 * public interface ReportMapper extends BaseMapper&lt;Report&gt; {}
 *
 * // 也可以在 Service 类或方法上使用，方法级别优先于类级别
 * {@literal @}DS("report")
 * public List&lt;Report&gt; queryReport() { ... }
 * </pre>
 */
@Slf4j
@AutoConfiguration
@AutoConfigureBefore(DataSourceAutoConfiguration.class)
public class DynamicDataSourceAutoConfiguration {

    /**
     * 构造函数，打印多数据源启用日志
     */
    public DynamicDataSourceAutoConfiguration() {
        log.info("[CloudFlow] 多数据源模块已启用，支持 @DS 注解切换数据源");
    }
}
