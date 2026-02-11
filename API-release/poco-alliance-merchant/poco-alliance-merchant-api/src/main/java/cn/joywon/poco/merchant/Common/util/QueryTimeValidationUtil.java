package cn.joywon.poco.merchant.Common.util;

import cn.joywon.poco.common.core.exception.CheckedException;
import lombok.Getter;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;

public class QueryTimeValidationUtil {

    @Getter
    public enum DaySpanEnum {
        WEEK(7L, "一周"),
        MONTH(30L, "一个月"),
        THREE_MONTH(90L, "三个月"),
        HALF_YEAR(180L, "半年"),
        YEAR(365L, "一年"),
        THREE_YEAR(3L * 365, "三年");

        private final Long day;
        private final String desc;

        DaySpanEnum(Long day, String desc) {
            this.day = day;
            this.desc = desc;
        }
    }

    public record QueryTime(LocalDateTime startTime, LocalDateTime endTime) {
    }

    /**
     * 校验查询日期参数
     *
     * @param beginDate   开始日期
     * @param endDate     结束日期
     * @param daySpan     最大查询日期跨度
     * @param nearYear    允许查询的最近年数
     * @param defaultSpan 开始日期为null时的默认查询天数
     * @return 日期参数为null时赋默认值
     */
    public static QueryTime datesValidation(LocalDate beginDate, LocalDate endDate,
                                            DaySpanEnum daySpan, Integer nearYear, Long defaultSpan) {

        defaultSpan = defaultSpan != null ? defaultSpan : DaySpanEnum.WEEK.getDay();
        LocalDate today = LocalDate.now();
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime beginTime = beginDate != null ? beginDate.atStartOfDay() : today.minusDays(defaultSpan).atStartOfDay();
        LocalDateTime endTime = endDate != null ? endDate.atTime(LocalTime.MAX) : today.atTime(LocalTime.MAX);

        // 校验开始时间不能晚于现在, 也不能晚于结束时间
        if (beginTime.isAfter(now) || beginTime.isAfter(endTime)) {
            throw new CheckedException("查询的开始时间不能晚于结束时间");
        }

        // 校验时间跨度不能超过允许的最大天数
        if (daySpan != null) {
            if (ChronoUnit.DAYS.between(beginTime, endTime) > daySpan.getDay()) {
                throw new CheckedException("查询时间跨度不能超过 " + daySpan.getDesc());
            }
        }

        // 校验开始时间是否在最近 yearSpan 年内
        if (nearYear != null) {
            LocalDateTime minAllowedTime = now.minusYears(nearYear);
            if (beginTime.isBefore(minAllowedTime)) {
                throw new CheckedException("只提供查询最近" + nearYear + "年的记录");
            }
        }

        return new QueryTime(beginTime, endTime);
    }

}