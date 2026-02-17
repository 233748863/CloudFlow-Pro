package com.cloudflow.auth;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;

@SpringBootApplication(exclude = DataSourceAutoConfiguration.class)
@ComponentScan(
    basePackages = "com.cloudflow",
    excludeFilters = {
        @ComponentScan.Filter(type = FilterType.REGEX, pattern = {
            // Auth 服务没有 spring-security 依赖，排除依赖 Spring Security 的类
            "com\\.cloudflow\\.common\\.security\\.filter\\.SecurityContextFilter",
            "com\\.cloudflow\\.common\\.security\\.config\\.SecurityFilterAutoConfig"
        })
    }
)
@MapperScan("com.cloudflow.auth.mapper")
public class AuthApplication {
    public static void main(String[] args) {
        SpringApplication.run(AuthApplication.class, args);
        System.out.println("\n" +
            "  ╔═══════════════════════════════════════════════════════╗\n" +
            "  ║                                                       ║\n" +
            "  ║   ᕦ(ò_óˇ)ᕤ  Auth 认证服务启动成功!                       ║\n" +
            "  ║                                                       ║\n" +
            "  ║   🔐 安全认证已上线，令牌签发就绪 🔐                       ║\n" +
            "  ║                                                       ║\n" +
            "  ╚═══════════════════════════════════════════════════════╝\n");
    }
}
