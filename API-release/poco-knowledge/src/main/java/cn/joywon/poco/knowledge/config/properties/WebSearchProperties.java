package cn.joywon.poco.knowledge.config.properties;

import lombok.Data;

/**
 * Web 搜索属性
 *
 * @author poco
 * @date 2025/02/24
 */
@Data
public class WebSearchProperties {

	/**
	 * 超时时间
	 */
	private int duration = 10;

	/**
	 * 最大数量
	 */
	private int maxResults = 5;

}
