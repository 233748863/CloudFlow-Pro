package cn.joywon.poco.knowledge.support.constant;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

import java.util.Objects;

/**
 * 图表枚举
 *
 * @author poco
 * @date 2025/3/25
 */
@RequiredArgsConstructor
public enum AiChartTypeEnums {

    /**
     * 折线图
     */
    LINE("1", "line"),

    /**
     * 饼图
     */
    PIE("2", "pie"),

    /**
     * 柱状图
     */
    BAR("3", "bar");

    @Getter
    private final String code;

    @Getter
    private final String desc;


    public static AiChartTypeEnums getEnumByCode(String code) {
        for (AiChartTypeEnums value : AiChartTypeEnums.values()) {
            if (Objects.equals(value.code, code)) {
                return value;
            }
        }
        return null;
    }
}
