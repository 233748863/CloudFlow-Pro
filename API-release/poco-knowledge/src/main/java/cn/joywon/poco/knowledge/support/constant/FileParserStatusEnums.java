package cn.joywon.poco.knowledge.support.constant;

/**
 * 文件状态枚举
 *
 * @author poco
 * @date 2024/10/2
 */
public enum FileParserStatusEnums {

	// 未解析
	UNPARSE,
	// 解析中
	AI_PARSING,
	// OCR 解析中
	OCR_PARSING,
	// 解析成功
	PARSE_SUCCESS,
	// 解析失败
	PARSE_FAIL

}
