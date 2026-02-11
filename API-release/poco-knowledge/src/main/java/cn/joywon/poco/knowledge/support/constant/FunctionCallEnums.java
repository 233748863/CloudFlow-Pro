package cn.joywon.poco.knowledge.support.constant;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * @author poco
 * @date 2024/3/29
 * <p>
 * mockMathScoreService ，获取成绩情况 mockWeatherScoreService ，获取天气情况
 */
@Getter
@RequiredArgsConstructor
public enum FunctionCallEnums {

	MOCK_MATH_SCORE_SERVICE("mockMathScoreService", "获取成绩情况");

	private final String code;

	private final String desc;

}
