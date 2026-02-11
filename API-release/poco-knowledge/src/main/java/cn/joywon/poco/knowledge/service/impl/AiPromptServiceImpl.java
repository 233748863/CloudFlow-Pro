package cn.joywon.poco.knowledge.service.impl;

import cn.hutool.core.lang.Pair;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import cn.joywon.poco.knowledge.dto.AiPromptDTO;
import cn.joywon.poco.knowledge.entity.AiPromptEntity;
import cn.joywon.poco.knowledge.mapper.AiPromptMapper;
import cn.joywon.poco.knowledge.service.AiAssistantService;
import cn.joywon.poco.knowledge.service.AiPromptService;
import cn.joywon.poco.knowledge.support.provider.ModelProvider;
import cn.joywon.poco.knowledge.support.util.PromptBuilder;
import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.data.message.SystemMessage;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.chat.response.ChatResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * 提示词
 *
 * @author pig
 * @date 2024-03-20 16:29:05
 */
@Service
@RequiredArgsConstructor
public class AiPromptServiceImpl extends ServiceImpl<AiPromptMapper, AiPromptEntity> implements AiPromptService {

	private final ModelProvider modelProvider;

	/**
	 * 优化提示
	 * @param promptDTO 提示 DTO
	 * @return {@link String }
	 */
	@Override
	public String optimizePrompt(AiPromptDTO promptDTO) {
		Pair<ChatLanguageModel, AiAssistantService> aiAssistant = modelProvider
			.getAiAssistant(promptDTO.getModelName());

		// 获取系统提示词
		ChatMessage systemMessage = SystemMessage.from(PromptBuilder.render("meta-prompt.st", Map.of()));

		ChatResponse chatResponse = aiAssistant.getKey()
				.chat(systemMessage, UserMessage.from(promptDTO.getPrompt()));
		return chatResponse.aiMessage().text();
	}

}
