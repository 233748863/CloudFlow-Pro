package cn.joywon.poco.knowledge.support.rule;

import cn.hutool.core.date.DateUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import cn.joywon.poco.knowledge.dto.AiMessageResultDTO;
import cn.joywon.poco.knowledge.dto.ChatMessageDTO;
import cn.joywon.poco.knowledge.entity.AiModelEntity;
import cn.joywon.poco.knowledge.mapper.AiModelMapper;
import cn.joywon.poco.knowledge.support.handler.websearch.WebSearchProvider;
import cn.joywon.poco.knowledge.support.util.PromptBuilder;
import io.github.pigmesh.ai.deepseek.core.DeepSeekClient;
import io.github.pigmesh.ai.deepseek.core.SyncOrAsyncOrStreaming;
import io.github.pigmesh.ai.deepseek.core.chat.ChatCompletionRequest;
import io.github.pigmesh.ai.deepseek.core.chat.ChatCompletionResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;

import java.util.Map;
import java.util.Objects;

/**
 * 深度推理聊天
 *
 * @author poco
 * @date 2025/02/03
 */
@Slf4j
@Component("reasonChat")
@RequiredArgsConstructor
public class ReasonChatRule implements ChatRule {

	private final AiModelMapper aiModelMapper;

	private final WebSearchProvider webSearchProvider;

	public Flux<AiMessageResultDTO> process(ChatMessageDTO chatMessageDTO) {
		// 查询 AI 模型信息
		AiModelEntity aiModelEntity = aiModelMapper.selectOne(
				Wrappers.<AiModelEntity>lambdaQuery().eq(AiModelEntity::getName, chatMessageDTO.getModelName()), false);

		// 如果模型未找到，返回提示信息
		if (Objects.isNull(aiModelEntity)) {
			return Flux.just(new AiMessageResultDTO("未找到模型" + chatMessageDTO.getModelName()));
		}

		// 构建 DeepSeekClient 的 Builder，并设置基础配置信息
		DeepSeekClient.Builder builder = DeepSeekClient.builder()
			.baseUrl(aiModelEntity.getBaseUrl()) // 设置模型的 API 地址
			.model(aiModelEntity.getModelName()) // 设置模型名称
			.logRequests(true) // 开启请求日志
			.logResponses(true) // 开启响应日志
			.openAiApiKey(aiModelEntity.getApiKey()); // 设置 API Key

		// 如果启用了 Web 搜索功能，则查找搜索引擎模型的 API Key
		if (chatMessageDTO.isWebsearch()) {
			String searchResult = webSearchProvider.search(chatMessageDTO.getContent());
			chatMessageDTO.setContent(PromptBuilder.render("web-search.st", Map.of("input", chatMessageDTO.getContent(),
					"currentDate", DateUtil.now(), "searchResult", searchResult)));
		}

		// 构建 DeepSeekClient 实例
		DeepSeekClient deepSeekClient = builder.build();

		return Flux.create(emitter -> {
			SyncOrAsyncOrStreaming<ChatCompletionResponse> chattedCompletion = deepSeekClient
				.chatCompletion(ChatCompletionRequest.builder()
					.model(aiModelEntity.getModelName()) // 指定模型
						.addSystemMessage(PromptBuilder.render("reason-system.st")) // 添加系统消息，包含当前日期
					.addUserMessage(chatMessageDTO.getContent()) // 添加用户输入内容
					.build());

			// 处理流式响应
			chattedCompletion.onPartialResponse(partialResponse -> {
				AiMessageResultDTO aiMessageResultDTO = new AiMessageResultDTO();
				String content = partialResponse.choices().get(0).delta().content(); // 获取回复内容
				String reasoningContent = partialResponse.choices().get(0).delta().reasoningContent(); // 获取推理内容
				aiMessageResultDTO.setMessage(content);
				aiMessageResultDTO.setReasoningContent(reasoningContent);
				emitter.next(aiMessageResultDTO); // 发送消息到 Flux 流中
			}).onComplete(() -> {
				// 发送对话完成的标志
				AiMessageResultDTO finalMessage = new AiMessageResultDTO();
				finalMessage.setFinish(true);
				emitter.next(finalMessage);
				emitter.complete();
			})
				.onError(emitter::error) // 处理错误
				.execute(); // 执行请求
		});
	}

}
