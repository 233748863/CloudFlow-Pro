package com.cloudflow.common.encrypt.enums;

/**
 * 加密算法类型枚举
 *
 * @author CloudFlow
 */
public enum AlgorithmType {

    /** AES 对称加密（推荐，性能好） */
    AES,

    /** SM4 国密对称加密 */
    SM4,

    /** Base64 编码（非加密，仅编码，适合低安全场景） */
    BASE64
}
