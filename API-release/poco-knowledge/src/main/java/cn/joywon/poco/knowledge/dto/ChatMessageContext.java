package cn.joywon.poco.knowledge.dto;

import cn.joywon.poco.knowledge.entity.AiDatasetEntity;
import lombok.Data;
import org.springframework.ai.chat.model.ChatResponse;

/**
 * @author poco
 * @date 2024/3/26
 */
@Data
public class ChatMessageContext {

	/**
	 * Flag to indicate if Ollama is enabled or not.
	 */
	private boolean ollama;

	/**
	 * The model name used in the chat.
	 */
	private String model;

	/**
	 * List of chat messages in the current context.
	 */
	private ChatMessageDTO chatMessageDTO;

	/**
	 * Error message, if any, during the chat.
	 */
	private String errorMessage;

	/**
	 * The response from the AI chat.
	 */
	private ChatResponse chatResponse;

	/**
	 * The username of the user in the chat.
	 */
	private String username;

	/**
	 * The unique identifier of the user in the chat.
	 */
	private Long userId;

	/**
	 * The IP address of the user in the chat.
	 */
	private String ip;

	/**
	 * The name of the function being used in the chat.
	 */
	private String funcName;

	/**
	 * result message dto
	 */
	private AiMessageResultDTO messageResultDTO;

	/**
	 * 当前知识库的元信息
	 */
	private AiDatasetEntity aiDataset;

}
