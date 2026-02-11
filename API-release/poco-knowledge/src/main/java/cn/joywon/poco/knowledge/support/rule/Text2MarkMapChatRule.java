package cn.joywon.poco.knowledge.support.rule;

import cn.joywon.poco.knowledge.dto.AiMessageResultDTO;
import cn.joywon.poco.knowledge.dto.ChatMessageDTO;
import cn.joywon.poco.knowledge.service.AiStreamAssistantService;
import cn.joywon.poco.knowledge.support.provider.ModelProvider;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.prompt.PromptTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;

/**
 * Text 转脑图
 *
 * @author poco
 * @date 2024/08/05
 */
@Slf4j
@Component("text2MarkMapChat")
@RequiredArgsConstructor
public class Text2MarkMapChatRule implements ChatRule {

	private final ModelProvider modelProvider;

	@Value("classpath:/prompts/gen-markmap.st")
	private Resource imageResource;

	/**
	 * 交互过程
	 * @param chatMessageDTO 聊天消息 DTO
	 * @return {@link Flux }<{@link AiMessageResultDTO }>
	 */
	public Flux<AiMessageResultDTO> process(ChatMessageDTO chatMessageDTO) {
		PromptTemplate promptTemplate = new PromptTemplate(imageResource);
		promptTemplate.add("input", chatMessageDTO.getContent());

		AiStreamAssistantService streamAssistantService = modelProvider
			.getAiStreamAssistant(chatMessageDTO.getModelName())
			.getValue();
		Flux<String> streamChat = streamAssistantService.chat(chatMessageDTO.getConversationId(),
				promptTemplate.render());
		// 转成 AiMessageResultDTO
		return streamChat.map(AiMessageResultDTO::new);
	}

}
