package cn.joywon.poco.knowledge.support.constant;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 切片状态
 *
 * @author poco
 * @date 2024/5/21
 * <p>
 * 切片状态 0 未切片 1 已切片 9 失败
 */
@Getter
@RequiredArgsConstructor
public enum SliceStatusEnums {

	/**
	 * 未切片
	 */
	UNSLICED("0", "未切片"),
	/**
	 * 已切片
	 */
	SLICED("1", "已切片"),
	/**
	 * 解析中
	 */
	OCR_PARSING("2", "解析中"),

	AI_PARSING("3", "AI解析中"),
	/**
	 * 失败
	 */
	FAILED("9", "失败");

	private final String status;

	private final String desc;

}
