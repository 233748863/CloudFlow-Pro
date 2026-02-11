package cn.joywon.poco.knowledge.dto;

import lombok.Data;
import lombok.experimental.FieldNameConstants;

/**
 * 函数字段 dto
 *
 * @author poco
 * @date 2024/08/07
 */
@Data
@FieldNameConstants
public class FunctionFieldDTO {

	/**
	 * 属性名称
	 */
	private String attrName;

	/**
	 * 字段注释
	 */
	private String fieldComment;

	/**
	 * 字段类型
	 */
	private String formType;

	/**
	 * 表格必填
	 */
	private boolean formRequired;

}
