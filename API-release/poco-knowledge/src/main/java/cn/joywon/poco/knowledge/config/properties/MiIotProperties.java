package cn.joywon.poco.knowledge.config.properties;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * 小米物联网属性
 *
 * @author poco
 * @date 2024/12/22
 */
@Data
public class MiIotProperties {

	/**
	 * 启用
	 */
	private boolean enabled;

	/**
	 * 基本 URL
	 */
	private String baseUrl = "http://127.0.0.1:8123";

	/**
	 * API 密钥
	 */
	private String apiKey;

	/**
	 * 目标控制的实体列表
	 */
	private List<String> entityIdList = new ArrayList<>();

}
