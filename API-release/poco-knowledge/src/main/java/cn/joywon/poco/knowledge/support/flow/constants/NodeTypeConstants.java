package cn.joywon.poco.knowledge.support.flow.constants;

/**
 * 节点类型常量定义
 * 用于定义工作流中各种节点的类型标识
 *
 * @author poco
 * @date 2025/03/03
 */
public interface NodeTypeConstants {

    /**
     * 代码节点
     * 用于执行自定义代码逻辑的节点类型
     */
    String CODE = "code";

    /**
     * 数据库节点
     * 用于执行数据库操作的节点类型
     */
    String DB = "db";

    /**
     * 结束节点
     * 工作流的终止节点，表示流程结束
     */
    String END = "end";

    /**
     * HTTP节点
     * 用于发送HTTP请求的节点类型
     */
    String HTTP = "http";

    /**
     * LLM(大语言模型)节点
     * 用于调用AI语言模型的节点类型
     */
    String LLM = "llm";

    /**
     * 通知节点
     * 用于发送通知或消息的节点类型
     */
    String NOTICE = "notice";

    /**
     * 问题节点
     * 用于处理用户交互或决策的节点类型
     */
    String QUESTION = "question";

    /**
     * 开始节点
     * 工作流的起始节点，表示流程开始
     */
    String START = "start";

    /**
     * 切换节点
     * 用于条件分支判断的节点类型
     */
    String SWITCH = "switch";

    /**
     * rag 知识库节点
     */
    String RAG = "rag";

}
