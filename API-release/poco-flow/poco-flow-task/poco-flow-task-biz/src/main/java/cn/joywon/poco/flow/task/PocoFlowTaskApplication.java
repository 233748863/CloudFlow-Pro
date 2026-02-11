package cn.joywon.poco.flow.task;

import cn.joywon.poco.common.feign.annotation.EnablePocoFeignClients;
import cn.joywon.poco.common.security.annotation.EnablePocoResourceServer;
import cn.joywon.poco.common.swagger.annotation.EnableOpenApi;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

/**
 * @author poco archetype
 * <p>
 * 项目启动类
 */
@EnableOpenApi("task")
@EnablePocoFeignClients
@EnableDiscoveryClient
@EnablePocoResourceServer
@SpringBootApplication
public class PocoFlowTaskApplication {

	public static void main(String[] args) {
		SpringApplication.run(PocoFlowTaskApplication.class, args);
	}

}
