package cn.joywon.poco.report;

import cn.joywon.poco.common.feign.annotation.EnablePocoFeignClients;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * 业务模板
 *
 * @author lr
 * @since 2023-04-05
 */
@EnablePocoFeignClients
@SpringBootApplication
public class PocoReportPlatformApplication {

	public static void main(String[] args) {
		SpringApplication.run(PocoReportPlatformApplication.class);
	}

}
