package cn.joywon.poco.knowledge.service;

import dev.langchain4j.service.MemoryId;
import dev.langchain4j.service.UserMessage;
import reactor.core.publisher.Flux;

/**
 * AI 函数助手服务
 *
 * @author poco
 * @date 2024/09/27
 */
public interface AiFunctionAssistantService {

	/**
	 * 聊天
	 * @param memoryId 内存 ID
	 * @param userMessage 用户留言
	 * @return {@link String }
	 */
	String chat(@MemoryId String memoryId, @UserMessage String userMessage);

	/**
	 * 聊天
	 * @param userMessage 用户消息
	 * @return {@link String }
	 */
	String chat(@UserMessage String userMessage);


	/**
	 * 聊天通量
	 *
	 * @param memoryId    记忆id
	 * @param userMessage 用户消息
	 * @return {@link Flux }<{@link String }>
	 */
	Flux<String> chatFlux(@MemoryId String memoryId, @UserMessage String userMessage);

}
