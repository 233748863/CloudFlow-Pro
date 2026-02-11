package cn.joywon.poco.knowledge.service;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.knowledge.dto.AiMessageResultDTO;
import cn.joywon.poco.knowledge.dto.ChatMessageDTO;
import reactor.core.publisher.Flux;

/**
 * 交互service
 *
 * @author poco
 * @date 2024/3/20
 */
public interface ChatService {

	/**
	 * Sends a list of chat messages.
	 */
	Flux<AiMessageResultDTO> chatList(Long key);

	/**
	 * 保持链接信息
	 * @param inner 是否内部调用
	 * @param chatMessageDTO 消息内容体
	 * @return uuid
	 */
	R<String> saveConnectionParams(ChatMessageDTO chatMessageDTO);

	/**
	 * 清除记忆内存
	 * @param id 身份证
	 * @return boolean
	 */
	boolean clearMemory(String id);

}
