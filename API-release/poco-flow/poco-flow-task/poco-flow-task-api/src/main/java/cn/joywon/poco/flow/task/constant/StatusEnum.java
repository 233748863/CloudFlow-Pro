package cn.joywon.poco.flow.task.constant;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 状态枚举
 *
 * @author haoxr
 * @since 2022/10/14
 */
@Getter
@RequiredArgsConstructor
public enum StatusEnum implements IBaseEnum<Integer> {

	ENABLE(1, "启用"), DISABLE(0, "禁用");

	private final Integer value;
	private final String label;
}
