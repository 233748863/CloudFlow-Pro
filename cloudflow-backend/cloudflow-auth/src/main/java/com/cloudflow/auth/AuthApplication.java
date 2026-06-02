package com.cloudflow.auth;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication(exclude = DataSourceAutoConfiguration.class)
@ComponentScan(basePackages = "com.cloudflow")
@MapperScan("com.cloudflow.auth.mapper")
@EnableFeignClients
@EnableScheduling
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
