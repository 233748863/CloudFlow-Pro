package cn.joywon.poco.knowledge.support.constant;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 总结状态
 *
 * @author poco
 * @date 2024/5/21
 */
@Getter
@RequiredArgsConstructor
public enum SummaryStatusEnums {

	/**
	 * 未总结
	 */
	UNSUMMARY("0", "未总结"),

	/**
	 * 已总结
	 */
	SUMMARYED("1", "已总结"),

	/**
	 * 摘要
	 */
	SUMMARYING("2", "总结中"),

	/**
	 * 失败
	 */
	FAILED("9", "失败");

	private final String status;

	private final String desc;

}
