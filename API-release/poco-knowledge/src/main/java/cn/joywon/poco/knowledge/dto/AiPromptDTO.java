package cn.joywon.poco.knowledge.dto;

import lombok.Data;

/**
 * @author poco
 * @date 2024/10/16
 *
 * PROMPT 优化
 */
@Data
public class AiPromptDTO {

	/**
	 * 型号名称
	 */
	private String modelName;

	/**
	 * 提示
	 */
	private String prompt;

}
