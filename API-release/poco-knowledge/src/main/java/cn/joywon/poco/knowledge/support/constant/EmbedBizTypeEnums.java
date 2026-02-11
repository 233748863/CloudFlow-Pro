package cn.joywon.poco.knowledge.support.constant;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldNameConstants;

/**
 * 向量业务 BIZ 类型枚举
 *
 * @author poco
 * @date 2025/03/21
 */
@Getter
@FieldNameConstants
@RequiredArgsConstructor
public enum EmbedBizTypeEnums {

    /**
     * 文件类型
     */
    CHAT2FILE("chat2file"),
    /**
     * SQL 类型
     */
    CHAT2SQL("chat2sql"),
    /**
     * MCP 类型
     */
    CHAT2MCP("chat2mcp"),
    /**
     * 函数类型
     */
    FUNCTION("function");

    private final String type;

}
