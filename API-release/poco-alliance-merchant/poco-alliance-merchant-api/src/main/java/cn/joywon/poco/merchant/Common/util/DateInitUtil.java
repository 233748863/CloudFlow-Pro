package cn.joywon.poco.merchant.Common.util;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.temporal.WeekFields;
import java.util.Locale;

public class DateInitUtil {

    private static final ZoneId DEFAULT_ZONE = ZoneId.of("Asia/Shanghai");
    private static final WeekFields ISO_WEEK_FIELDS = WeekFields.of(Locale.getDefault());

    /**
     * 获取本月第一天(LocalDate)
     */
    public static LocalDate getFirstDayOfMonthDate() {
        return LocalDate.now(DEFAULT_ZONE)
                .withDayOfMonth(1);
    }

    /**
     * 获取本周第一天(LocalDate, ISO 标准: 周一)
     */
    public static LocalDate getFirstDayOfWeekDate() {
        return LocalDate.now(DEFAULT_ZONE)
                .with(ISO_WEEK_FIELDS.dayOfWeek(), 1);
    }

    /**
     * 获取本月第一天(LocalDateTime, 时间部分: 00:00:00.000)
     */
    public static LocalDateTime getFirstDayOfMonthDateTime() {
        return getFirstDayOfMonthDate().atStartOfDay();
    }

    /**
     * 获取本周第一天(LocalDateTime, ISO 标准: 周一, 时间部分: 00:00:00.000)
     */
    public static LocalDateTime getFirstDayOfWeekDateTime() {
        return getFirstDayOfWeekDate().atStartOfDay();
    }

}