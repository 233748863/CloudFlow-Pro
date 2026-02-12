package com.cloudflow.common.core.utils;

import cn.hutool.core.util.IdUtil;

/**
 * ID 生成工具类
 */
public class IdUtils {

    /**
     * 生成简化的 UUID（去掉横线）
     *
     * @return 32位UUID字符串
     */
    public static String simpleUUID() {
        return IdUtil.simpleUUID();
    }

    /**
     * 生成标准 UUID
     *
     * @return 带横线的36位UUID字符串
     */
    public static String randomUUID() {
        return IdUtil.randomUUID();
    }

    /**
     * 生成雪花算法ID
     *
     * @return 雪花ID
     */
    public static long snowflakeId() {
        return IdUtil.getSnowflakeNextId();
    }

    /**
     * 生成雪花算法ID（字符串）
     *
     * @return 雪花ID字符串
     */
    public static String snowflakeIdStr() {
        return IdUtil.getSnowflakeNextIdStr();
    }
}
