package com.cloudflow.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceTransactionManagerAutoConfiguration;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;

@SpringBootApplication(exclude = {
    // Gateway 不需要数据库
    DataSourceAutoConfiguration.class,
    DataSourceTransactionManagerAutoConfiguration.class
}, excludeName = {
    // MyBatis Plus 自动配置（通过 cloudflow-common 传递依赖引入）
    "com.baomidou.mybatisplus.autoconfigure.MybatisPlusAutoConfiguration",
    "com.baomidou.mybatisplus.spring.boot.starter.MybatisPlusAutoConfiguration",
    "org.mybatis.spring.boot.autoconfigure.MybatisAutoConfiguration"
})
@ComponentScan(
    basePackages = "com.cloudflow",
    excludeFilters = {
        @ComponentScan.Filter(type = FilterType.REGEX, pattern = {
            // Servlet 依赖类（Gateway 是 WebFlux 环境，不支持 Servlet API）
            "com\\.cloudflow\\.common\\.core\\.exception\\.GlobalExceptionHandler",
            "com\\.cloudflow\\.common\\.core\\.aspect\\.RequestLogAspect",
            "com\\.cloudflow\\.common\\.core\\.interceptor\\.UserContextInterceptor",
            "com\\.cloudflow\\.common\\.config\\.WebMvcConfig",
            "com\\.cloudflow\\.common\\.tenant\\.TenantInterceptor",
            // MyBatis 相关（Gateway 不需要数据库）
            "com\\.cloudflow\\.common\\.config\\.MybatisPlusConfig",
            // Redis Stream（Gateway 不需要 Stream 功能）
            "com\\.cloudflow\\.common\\.core\\.utils\\.RedisStreamUtil",
            // Swagger（Gateway 不需要 API 文档）
            "com\\.cloudflow\\.common\\.config\\.SwaggerConfig",
            // CloudFlowConfig（Gateway 不需要文件上传路径配置）
            "com\\.cloudflow\\.common\\.config\\.CloudFlowConfig"
        })
    }
)
public class GatewayApplication {
    public static void main(String[] args) {
        SpringApplication.run(GatewayApplication.class, args);
    }
}
