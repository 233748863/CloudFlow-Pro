package cn.joywon.poco.knowledge.config.properties;

import lombok.Data;

/**
 * Office2 MD 属性
 *
 * @author poco
 * @date 2024/12/22
 */
@Data
public class Office2MdProperties {

	/**
	 * 启用
	 */
	private boolean enabled = false;

	/**
	 * 基本 URL
	 */
	private String baseUrl = "http://127.0.0.1:8000";

}
