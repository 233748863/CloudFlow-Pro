package cn.joywon.poco.knowledge.support.constant;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 工单类型
 *
 * @author poco
 * @date 2024/9/22
 * <p>
 * Gitee gitee GitHub github
 */
@Getter
@RequiredArgsConstructor
public enum IssueTypeEnums {

	GITEE("gitee", "gitee"),

	GITHUB("github", "GitHub");

	/**
	 * 问题类型
	 */
	private final String type;

	/**
	 * 问题描述
	 */
	private final String desc;

}
