package com.cloudflow.auth.enums;

import cn.hutool.core.util.StrUtil;

/**
 * 文件存储类型。
 * <p>
 * 说明：
 * 1. LOCAL 表示文件存储在应用本地磁盘目录。
 * 2. OSS 通过 common-oss 统一接入 S3 兼容对象存储。
 * 3. 未配置或无法识别时默认回退到 LOCAL。
 */
public enum FileStorageType {

    LOCAL,

    OSS;

    /**
     * 根据配置值解析存储类型。
     * 支持 null / '' / 'local' 回退为 LOCAL。
     */
    public static FileStorageType fromValue(String value) {
        if (StrUtil.isBlank(value)) {
            return LOCAL;
        }
        for (FileStorageType item : values()) {
            if (item.name().equalsIgnoreCase(value.trim())) {
                return item;
            }
        }
        return LOCAL;
    }
}
