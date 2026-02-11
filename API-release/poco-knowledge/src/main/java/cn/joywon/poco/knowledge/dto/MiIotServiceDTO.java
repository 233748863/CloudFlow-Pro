package cn.joywon.poco.knowledge.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

/**
 * 小米 IoT 服务 DTO
 *
 * @author poco
 * @date 2024/12/22
 */
@Data
public class MiIotServiceDTO {

	/**
	 * IoT 请求
	 *
	 * @author poco
	 * @date 2024/12/22
	 */
	@Data
	@Builder
	public static class IotRequest {

		/**
		 * 实体 ID
		 */
		@JsonProperty("entity_id")
		private String entityId;

	}

	/**
	 * IoT 响应
	 *
	 * @author poco
	 * @date 2024/12/22
	 */
	@Data
	public static class IotResponse {

	}

}
