package com.cloudflow.oa;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import org.springframework.cloud.openfeign.EnableFeignClients;

/**
 * OA服务启动类
 * 
 * @author CloudFlow
 */
@SpringBootApplication(scanBasePackages = "com.cloudflow", exclude = DataSourceAutoConfiguration.class)
@EnableDiscoveryClient
@EnableFeignClients
public class OaApplication {
    
    public static void main(String[] args) {
        SpringApplication.run(OaApplication.class, args);
        System.out.println("\n" +
            "  ╔═══════════════════════════════════════════════════════╗\n" +
            "  ║                                                       ║\n" +
            "  ║   (♥◠‿◠)ノ゙  OA 办公服务启动成功!                       ║\n" +
            "  ║                                                       ║\n" +
            "  ║   📋 协同办公已就绪，审批流转畅通无阻 📋                    ║\n" +
            "  ║                                                       ║\n" +
            "  ╚═══════════════════════════════════════════════════════╝\n");
    }
}
