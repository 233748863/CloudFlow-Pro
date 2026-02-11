package cn.joywon.poco.flow.task.constant;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 用户节点类型枚举
 */
@Getter
@RequiredArgsConstructor
public enum NodeUserTypeEnum {

	USER("user", "用户"), DEPT("dept", "部门"), ROLE("role", "角色"),;

	private final String key;

	private final String name;

}
