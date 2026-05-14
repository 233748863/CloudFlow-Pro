package com.cloudflow.hr;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import org.springframework.cloud.openfeign.EnableFeignClients;

/**
 * HR 人力资源微服务启动类。
 *
 * @author CloudFlow
 * @since 1.0.0
 */
@SpringBootApplication(scanBasePackages = "com.cloudflow", exclude = DataSourceAutoConfiguration.class)
@EnableDiscoveryClient
@EnableFeignClients(basePackages = "com.cloudflow.hr.client")
@MapperScan("com.cloudflow.hr.mapper")
public class HrServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(HrServiceApplication.class, args);
        System.out.println("""

            ========================================
            CloudFlow HR Service 启动成功
            ========================================
            """);
    }
}
