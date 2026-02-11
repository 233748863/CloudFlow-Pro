package cn.joywon.poco.knowledge.support.constant;

import lombok.RequiredArgsConstructor;

/**
 * mcp 默认命令枚举
 *
 * @author poco
 * @date 2025/03/24
 */
@RequiredArgsConstructor
public enum McpDefaultCommandEnums {

    NPX("npx", "-y");

    public final String name;

    public final String command;
}
