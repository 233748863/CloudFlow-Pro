package com.cloudflow.common.log.enums;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 日志类型枚举
 *
 * @author CloudFlow
 */
@Getter
@RequiredArgsConstructor
public enum LogTypeEnum {

    /** 正常日志 */
    NORMAL("0"),

    /** 错误日志 */
    ERROR("9");

    /** 类型值 */
    private final String type;
}
