package cn.joywon.poco.knowledge.dto;

import lombok.Data;

/**
 * 大模型需要OCR 的字段信息
 *
 * @author poco
 * @date 2024/10/23
 */

@Data
public class LlmOCRFieldDTO {

	private String label;

	private String name;

	private String description;

}
