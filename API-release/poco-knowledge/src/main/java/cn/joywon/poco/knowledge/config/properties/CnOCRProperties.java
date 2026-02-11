package cn.joywon.poco.knowledge.config.properties;

import lombok.Data;

/**
 * cnocr 配置文件
 *
 * @author poco
 * @date 2024/3/20
 */
@Data
public class CnOCRProperties {

	/**
	 * 启用
	 */
	private boolean enabled = false;

	/**
	 * The host address for the cnocr service.
	 */
	private String baseUrl = "http://127.0.0.1:1224";

}
