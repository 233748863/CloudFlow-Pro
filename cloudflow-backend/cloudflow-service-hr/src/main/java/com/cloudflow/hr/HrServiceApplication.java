package com.cloudflow.hr;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * HR人力资源管理微服务启动类
 * 
 * @author CloudFlow
 * @since 1.0.0
 */
@SpringBootApplication
@EnableDiscoveryClient
@EnableFeignClients(basePackages = "com.cloudflow.hr.client")
@EnableScheduling
@MapperScan("com.cloudflow.hr.mapper")
public class HrServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(HrServiceApplication.class, args);
        System.out.println("""
            
            ========================================
            CloudFlow HR Service 启动成功！
            ========================================
            """);
    }
}
