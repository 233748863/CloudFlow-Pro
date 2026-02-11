package cn.joywon.poco.knowledge.service;

import cn.joywon.poco.knowledge.dto.MiIotServiceDTO;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.service.annotation.PostExchange;

/**
 * 小米 IoT 家庭助理服务
 *
 * @author poco
 * @date 2024/12/22
 */
public interface MiIotHomeAssistantService {

	/**
	 * 服务类
	 * @param domain 域
	 * @param service 服务
	 * @param request 请求
	 * @return {@link MiIotServiceDTO.IotResponse }
	 */
	@PostExchange("/api/services/{domain}/{service}")
	String services(@PathVariable String domain, @PathVariable String service,
			@RequestBody MiIotServiceDTO.IotRequest request);

}
