package cn.joywon.poco.knowledge.support.constant;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 网络搜索
 *
 * @author poco
 * @date 2025/2/9
 */
@Getter
@RequiredArgsConstructor
public enum WebSearchEnums {

	/**
	 * bocha搜索
	 */
	BOCHA("bocha-web-search", "Search"), SEARXNG("sear-xng", "Search");

	private final String name;

	private final String type;

}
