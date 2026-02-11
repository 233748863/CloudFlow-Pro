package cn.joywon.poco.knowledge.support.constant;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 大模型使用状态
 *
 * @author poco
 * @date 2024/5/21
 */
@Getter
@RequiredArgsConstructor
public enum LLMUseStatusEnums {

	/**
	 * 未使用
	 */
	UNUSE("0", "未使用"),
	/**
	 * 已使用
	 */
	USED("1", "已使用"),
	/**
	 * 敏感词
	 */
	SENSITIVE("2", "敏感词"),
	/**
	 * 失败
	 */
	FAILED("9", "失败");

	private final String status;

	private final String desc;

}
