package cn.joywon.poco.knowledge.support.flow.core;

import cn.joywon.poco.common.core.exception.CheckedException;
import lombok.Getter;

/**
 * 工作流异常类
 */
@Getter
public class FlowException extends CheckedException {

    private final String code;
    private final String message;
    private final Object data;

    public FlowException(String message) {
        this("FLOW_ERROR", message, null);
    }

    public FlowException(String code, String message) {
        this(code, message, null);
    }

    public FlowException(String code, String message, Object data) {
        super(message);
        this.code = code;
        this.message = message;
        this.data = data;
    }

    /**
     * 节点执行异常
     */
    public static FlowException executeError(String message) {
        return new FlowException(
                "EXECUTE_ERROR",
                message
        );
    }

    /**
     * 创建节点执行异常
     */
    public static FlowException nodeError(String nodeId, String message) {
        return new FlowException(
                "NODE_ERROR",
                String.format("节点[%s]执行失败 -> %s", nodeId, message)
        );
    }

    /**
     * 创建参数验证异常
     */
    public static FlowException invalidParam(String message) {
        return new FlowException("INVALID_PARAM", message);
    }

    /**
     * 创建工作流验证异常
     */
    public static FlowException invalidFlow(String message) {
        return new FlowException("INVALID_FLOW", message);
    }

    /**
     * 创建工作流API异常
     */
    public static FlowException invalidApiKey(String message) {
        return new FlowException("INVALID_API_KEY", message);
    }

    /**
     * 创建工作流DSL异常
     */
    public static FlowException invalidDSL(String message) {
        return new FlowException("INVALID_DSL", message);
    }
}
