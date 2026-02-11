package cn.joywon.poco.knowledge.support.constant;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * Mi IoT 服务枚举
 *
 * @author poco
 * @date 2024/12/22
 * <p>
 * 0 switch turn_off 1 switch turn_on
 */
@RequiredArgsConstructor
public enum MiIotServiceEnums {

	SWITCH_TURN_OFF(0, "switch", "turn_off"),

	SWITCH_TURN_ON(1, "switch", "turn_on");

	private final int code;

	@Getter
	private final String domain;

	@Getter
	private final String service;

	/**
	 * 按代码获取枚举
	 * @param code 法典
	 * @return {@link MiIotServiceEnums }
	 */
	public static MiIotServiceEnums getEnumByCode(int code) {
		for (MiIotServiceEnums value : MiIotServiceEnums.values()) {
			if (value.code == code) {
				return value;
			}
		}
		return null;
	}

}
