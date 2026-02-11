package cn.joywon.poco.knowledge.config.properties;

import cn.joywon.poco.knowledge.support.constant.ModelSupportEnums;
import lombok.Data;

/**
 * 默认模型属性
 *
 * @author poco
 * @date 2024/12/11
 */
@Data
public class DefaultModelProperties {

	/**
	 * 模型
	 */
	private ModelSupportEnums model = ModelSupportEnums.GLM_4V_FLASH;

	/**
	 * 基本 URL
	 */
	private String baseUrl = "https://open.bigmodel.cn/api/paas/v4";

	/**
	 * API 密钥 (免费密钥)
	 */
	private String apiKey = "9dfee4d072cf964f117403933da51242.1s1Tvn56OIGQkvmT";

}
