package cn.joywon.poco.knowledge.support.constant;

import dev.langchain4j.model.chat.request.ResponseFormatType;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 模型JSON格式枚举
 *
 * @author poco
 * @date 2025/02/13
 */
@RequiredArgsConstructor
public enum ModelProviderFormatEnums {

	/**
	 * Ollama
	 */
	OLLAMA("Ollama", "json_schema"),

	/**
	 * OpenAI 公司
	 */
	OPENAI("OpenAI", "json_schema"),


	/**
	 * OpenRouter
	 */
	OPEN_ROUTER("OpenRouter", "json_schema"),

	/**
	 * 其他
	 */
	OTHER("Other", "json_object");

	/**
	 * 供应商
	 */
	private final String provider;

	/**
	 * 格式
	 */
	@Getter
	private final String format;

	/**
	 * 获取JSON格式
	 * @param provider 供应商
	 * @return {@link ResponseFormatType }
	 */
	public static String getFormat(String provider) {
		for (ModelProviderFormatEnums providerFormat : ModelProviderFormatEnums.values()) {
			if (providerFormat.provider.equals(provider)) {
				return providerFormat.format;
			}
		}
		return OTHER.format;
	}

}
