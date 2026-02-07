package com.cloudflow.oa;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import org.springframework.cloud.openfeign.EnableFeignClients;

/**
 * OA服务启动类
 * 
 * @author CloudFlow
 */
@SpringBootApplication
@EnableDiscoveryClient
@EnableFeignClients
public class OaApplication {
    
    public static void main(String[] args) {
        SpringApplication.run(OaApplication.class, args);
        System.out.println("(♥◠‿◠)ノ゙  OA服务启动成功   ლ(´ڡ`ლ)゙");
    }
}
