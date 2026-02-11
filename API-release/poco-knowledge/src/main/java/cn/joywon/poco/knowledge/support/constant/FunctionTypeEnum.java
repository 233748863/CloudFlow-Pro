package cn.joywon.poco.knowledge.support.constant;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * function 类型对应关系
 *
 * @author poco
 * @date 2024/8/7
 */
@Getter
@RequiredArgsConstructor
@AllArgsConstructor
public enum FunctionTypeEnum {

	/**
	 * 字符串
	 */
	String("string", "string", String.class),

	/**
	 * 数字
	 */
	Number("number", "number", String.class),

	/**
	 * 日期时间
	 */
	DATETIME("date", "string", String.class, "Data Format Requirement [yyyy-MM-dd HH:mm:ss]"),

	/**
	 * 列表
	 */
	List("list", "array", String[].class),

	/**
	 * 布尔值
	 */
	Boolean("boolean", "boolean", String.class);

	/**
	 * 输入类型
	 */
	private final String input;

	/**
	 * 大模型 json schema 类型
	 */
	private final String jsonSchema;

	/**
	 * 低代码数据类型
	 */
	private final Class<?> lowCodeType;

	/**
	 * 扩展信息，方便大模型字段描述准确
	 */
	private String ext = "";

	/**
	 * 获取标准类型
	 * @param input 输入
	 * @return {@link FunctionTypeEnum }
	 */
	public static FunctionTypeEnum fromInput(String input) {
		for (FunctionTypeEnum value : FunctionTypeEnum.values()) {
			if (value.input.equals(input)) {
				return value;
			}
		}
		return String;
	}

}
