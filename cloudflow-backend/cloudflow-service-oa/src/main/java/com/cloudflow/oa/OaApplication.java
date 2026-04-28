package com.cloudflow.oa;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

@SpringBootApplication(scanBasePackages = "com.cloudflow", exclude = DataSourceAutoConfiguration.class)
@EnableDiscoveryClient
public class OaApplication {

    public static void main(String[] args) {
        SpringApplication.run(OaApplication.class, args);
        System.out.println("CloudFlow OA light service started.");
    }
}
