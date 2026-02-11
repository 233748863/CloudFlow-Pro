package cn.joywon.poco.daemon.quartz;

import cn.joywon.poco.common.feign.annotation.EnablePocoFeignClients;
import cn.joywon.poco.common.security.annotation.EnablePocoResourceServer;
import cn.joywon.poco.common.swagger.annotation.EnableOpenApi;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

/**
 * @author frwcloud
 * @date 2019/01/23 定时任务模块
 */
@EnableOpenApi("job")
@EnablePocoFeignClients
@EnablePocoResourceServer
@EnableDiscoveryClient
@SpringBootApplication
public class PocoDaemonQuartzApplication {

	public static void main(String[] args) {
		SpringApplication.run(PocoDaemonQuartzApplication.class, args);
	}

}
