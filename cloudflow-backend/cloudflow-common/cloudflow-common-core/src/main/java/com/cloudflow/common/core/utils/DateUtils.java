package com.cloudflow.common.core.utils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * 日期工具类
 */
public class DateUtils {
    
    /**
     * 日期路径格式化器 yyyy/MM/dd
     */
    private static final DateTimeFormatter DATE_PATH_FORMATTER = DateTimeFormatter.ofPattern("yyyy/MM/dd");
    
    /**
     * 获取当前日期路径
     * 格式: yyyy/MM/dd
     * 
     * @return 日期路径字符串，例如: 2026/02/09
     */
    public static String datePath() {
        return LocalDateTime.now().format(DATE_PATH_FORMATTER);
    }
}
