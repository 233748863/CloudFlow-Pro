package cn.joywon.poco.merchant;

import cn.joywon.poco.common.feign.annotation.EnablePocoFeignClients;
import cn.joywon.poco.common.security.annotation.EnablePocoResourceServer;
import cn.joywon.poco.common.swagger.annotation.EnableOpenApi;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

@EnableOpenApi("merchant")
@EnablePocoResourceServer
// 明确指定 Feign 客户端扫描包路径，确保能扫描到 RemoteAreaService
@EnablePocoFeignClients(basePackages = {"cn.joywon.poco"})
@EnableDiscoveryClient
@SpringBootApplication
public class PocoMerchantApplication {

    public static void main(String[] args) {
        SpringApplication.run(PocoMerchantApplication.class, args);
    }

}