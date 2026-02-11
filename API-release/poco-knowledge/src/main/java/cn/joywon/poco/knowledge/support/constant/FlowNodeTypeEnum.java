package cn.joywon.poco.knowledge.support.constant;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 流节点类型枚举
 *
 * @author poco
 * @date 2024/08/06
 */
@Getter
@RequiredArgsConstructor
public enum FlowNodeTypeEnum {

	/**
	 * 开始
	 */
	START("start", "开始"),

	/**
	 * 函数
	 */
	FUNC_DESC("funcDesc", "函数描述"),

	/**
	 * 执行
	 */
	EXEC("exec", "执行"),

	/**
	 * 并行
	 */
	RESULT("result", "调用结果"),

	/**
	 * 结束
	 */
	END_PARALLEL("endParallel", "结束");

	/**
	 * 类型
	 */
	private final String type;

	/**
	 * 描述
	 */
	private final String description;

}
