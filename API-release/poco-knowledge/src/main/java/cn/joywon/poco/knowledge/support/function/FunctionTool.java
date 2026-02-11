package cn.joywon.poco.knowledge.support.function;

import cn.joywon.poco.knowledge.dto.BaseAiRequest;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.service.tool.ToolExecutor;

/**
 * @author poco
 * @date 2024/9/27
 */
public interface FunctionTool<T extends BaseAiRequest> extends ToolExecutor {

	/**
	 * 前端是否展示此函数
	 * @return boolean
	 */
	default boolean showFunction() {
		return true;
	}

	/**
	 * 函数名称
	 * @return String
	 */
	String name();

	/**
	 * 执行
	 * @param toolExecutionRequest 工具执行请求
	 * @param memoryId 内存 ID
	 * @return {@link String }
	 */
	@Override
	default String execute(ToolExecutionRequest toolExecutionRequest, Object memoryId) {
		return "";
	}

}
