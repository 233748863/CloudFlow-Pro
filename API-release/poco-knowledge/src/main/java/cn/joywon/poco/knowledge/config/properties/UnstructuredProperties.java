package cn.joywon.poco.knowledge.config.properties;

import lombok.Data;

/**
 * cnocr 配置文件
 *
 * @author poco
 * @date 2024/3/20
 */
@Data
public class UnstructuredProperties {

	/**
	 * 是否启用
	 */
	private boolean enabled;

	/**
	 * The host address for the cnocr service.
	 */
	private String host;

	/**
	 * The port number for the cnocr service.
	 */
	private String port;

}
