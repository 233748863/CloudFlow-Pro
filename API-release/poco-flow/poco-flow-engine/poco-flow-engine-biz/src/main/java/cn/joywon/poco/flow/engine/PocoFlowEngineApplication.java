package cn.joywon.poco.flow.engine;

import cn.joywon.poco.common.feign.annotation.EnablePocoFeignClients;
import cn.joywon.poco.common.security.annotation.EnablePocoResourceServer;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

/**
 * @author poco archetype
 * <p>
 * 项目启动类
 */
@EnablePocoFeignClients
@EnableDiscoveryClient
@EnablePocoResourceServer
@SpringBootApplication
public class PocoFlowEngineApplication {

	public static void main(String[] args) {
		SpringApplication.run(PocoFlowEngineApplication.class, args);
	}

}
