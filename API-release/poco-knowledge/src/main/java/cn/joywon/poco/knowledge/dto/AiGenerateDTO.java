package cn.joywon.poco.knowledge.dto;

import lombok.Data;

/**
 * 生成式文本模板
 *
 * @author poco
 * @date 2024/6/17
 */
@Data
public class AiGenerateDTO {

	/**
	 * 型号名称
	 */
	private String modelName;

	/**
	 * 提示词
	 */
	private String prompt;

	/**
	 * 限制条件
	 */
	private String conditions;

}
