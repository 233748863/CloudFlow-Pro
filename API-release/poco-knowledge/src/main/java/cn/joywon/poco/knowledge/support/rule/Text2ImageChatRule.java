package cn.joywon.poco.knowledge.support.rule;

import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import cn.joywon.poco.knowledge.dto.AiMessageResultDTO;
import cn.joywon.poco.knowledge.dto.ChatMessageDTO;
import cn.joywon.poco.knowledge.dto.SiliconflowImageModelDTO;
import cn.joywon.poco.knowledge.entity.AiModelEntity;
import cn.joywon.poco.knowledge.mapper.AiModelMapper;
import cn.joywon.poco.knowledge.service.AiAssistantService;
import cn.joywon.poco.knowledge.service.AiDashscopeAssistantService;
import cn.joywon.poco.knowledge.service.AiSiliconflowAssistantService;
import cn.joywon.poco.knowledge.support.constant.ModelSupportEnums;
import cn.joywon.poco.knowledge.support.provider.ModelProvider;
import cn.joywon.poco.knowledge.support.util.PromptBuilder;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;

import java.util.Map;

/**
 * 文生图
 *
 * @author poco
 * @date 2024/3/26
 */
@Slf4j
@Component("text2ImageChat")
@RequiredArgsConstructor
public class Text2ImageChatRule implements ChatRule {

	private final AiDashscopeAssistantService aiDashscopeAssistantService;

	private final ModelProvider modelProvider;

	private final AiModelMapper aiModelMapper;

	/**
	 * 1. 调用Chat模型优化用户提交的提示词 2. 调用Image模型生成图片
	 * @param chatMessageDTO 聊天消息 dto
	 * @return {@link Flux }<{@link AiMessageResultDTO }>
	 */
	@SneakyThrows
	public Flux<AiMessageResultDTO> process(ChatMessageDTO chatMessageDTO) {
		// 调用Chat模型优化用户提交的提示词
		AiAssistantService assistantService = modelProvider.getAiAssistant().getValue();
		String content = assistantService.chat(chatMessageDTO.getConversationId(),
				PromptBuilder.render("gen-image.st", Map.of("input", chatMessageDTO.getContent())));

		AiModelEntity aiModelEntity = aiModelMapper
			.selectOne(Wrappers.<AiModelEntity>lambdaQuery().eq(AiModelEntity::getName, chatMessageDTO.getModelName()));

		if (aiModelEntity == null) {
			return Flux.just(new AiMessageResultDTO("图片模型不存在"));
		}

		// 调用硅基流动模型生成图片
		if (aiModelEntity.getProvider().equals(ModelSupportEnums.SILICONFLOW_FLUX_1_SCHNELL.getProvider())) {
			AiSiliconflowAssistantService imageAssistant = modelProvider
				.getFileAssistant(chatMessageDTO.getModelName());
			SiliconflowImageModelDTO.ImageModelRequst requst = new SiliconflowImageModelDTO.ImageModelRequst();
			requst.setModel(aiModelEntity.getModelName());
			requst.setPrompt(content + PromptBuilder.render("gen-image-limit.st", Map.of()));

			SiliconflowImageModelDTO.ImageModelResponse imageResponse = imageAssistant.generateImage(requst);
			String url = imageResponse.getImages().get(0).getUrl();
			// 转成 AiMessageResultDTO
			return Flux.just(new AiMessageResultDTO(PromptBuilder.render("gen-image-result.st", Map.of("url", url))));
		}

		// 调用dashscope模型生成图片
		String url = aiDashscopeAssistantService.generateImage(content, aiModelEntity);
		if (StrUtil.isNotBlank(url)) {
			return Flux.just(new AiMessageResultDTO(PromptBuilder.render("gen-image-result.st", Map.of("url", url))));
		}
		return Flux.just(new AiMessageResultDTO("生成图片失败"));

	}

}
