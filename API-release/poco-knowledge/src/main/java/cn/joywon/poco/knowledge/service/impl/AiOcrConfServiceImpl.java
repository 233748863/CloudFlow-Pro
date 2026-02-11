package cn.joywon.poco.knowledge.service.impl;

import cn.hutool.core.lang.Pair;
import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import cn.joywon.poco.admin.api.feign.RemoteFileService;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.knowledge.dto.LlmOCRFieldDTO;
import cn.joywon.poco.knowledge.entity.AiOcrConfEntity;
import cn.joywon.poco.knowledge.mapper.AiOcrConfMapper;
import cn.joywon.poco.knowledge.service.AiAssistantService;
import cn.joywon.poco.knowledge.service.AiOcrConfService;
import cn.joywon.poco.knowledge.support.constant.ModelProviderFormatEnums;
import cn.joywon.poco.knowledge.support.provider.ModelProvider;
import cn.joywon.poco.knowledge.support.util.PromptBuilder;
import dev.langchain4j.data.message.ImageContent;
import dev.langchain4j.data.message.SystemMessage;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.request.ResponseFormat;
import dev.langchain4j.model.chat.request.json.JsonBooleanSchema;
import dev.langchain4j.model.chat.request.json.JsonObjectSchema;
import dev.langchain4j.model.chat.request.json.JsonSchema;
import dev.langchain4j.model.chat.request.json.JsonStringSchema;
import dev.langchain4j.model.chat.response.ChatResponse;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.tuple.Triple;
import org.springframework.stereotype.Service;
import org.springframework.util.MimeTypeUtils;

import java.util.*;

import static dev.langchain4j.data.message.SystemMessage.systemMessage;
import static dev.langchain4j.data.message.UserMessage.userMessage;
import static dev.langchain4j.model.chat.request.ResponseFormatType.JSON;

/**
 * AI OCR conf Service impl
 *
 * @author poco
 * @date 2024/09/10
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiOcrConfServiceImpl extends ServiceImpl<AiOcrConfMapper, AiOcrConfEntity> implements AiOcrConfService {

	private final RemoteFileService remoteFileService;

	private final ModelProvider modelProvider;

	/**
	 * 解析图像
	 * @param aiOcrConf AI OCR 会议
	 * @return {@link R }
	 */
	@SneakyThrows
	@Override
	public R parseImage(AiOcrConfEntity aiOcrConf) {
		// 查询底图设置和标记字段
		AiOcrConfEntity confEntity = baseMapper.selectById(aiOcrConf.getId());
		// 需要OCR 的字段列表
		List<LlmOCRFieldDTO> fieldDTOList = JSONUtil.parseObj(confEntity.getOcrMarked())
			.getBeanList("markerList", LlmOCRFieldDTO.class);

		// 用户输入提示词增加限制
		SystemMessage systemMessage = SystemMessage.from(PromptBuilder.render("ocr-image.st"));

		// 组装文件
		feign.Response response = remoteFileService.getFile(aiOcrConf.getImageResource());
		String encodeToString = Base64.getEncoder().encodeToString(response.body().asInputStream().readAllBytes());
		UserMessage userMessage = UserMessage.from(ImageContent.from(encodeToString, MimeTypeUtils.IMAGE_PNG_VALUE));

		// 这里只能使用图形的模型助手
		Pair<ChatLanguageModel, AiAssistantService> aiAssistantServicePair = modelProvider.getAiVisionAssistant();
		ChatResponse chatResponse = aiAssistantServicePair.getKey().chat(systemMessage, userMessage);
		log.info("OCR 结果: {}", chatResponse.aiMessage().text());
		// 调用Chat 模型总结结果
		Triple<ChatLanguageModel, AiAssistantService, String> aiJSONAssistant = modelProvider
			.getAiJSONAssistant(aiOcrConf.getChatModelName());

		ChatResponse chatted = aiJSONAssistant.getLeft()
				.chat(buildChatRequest(confEntity, chatResponse.aiMessage().text(), fieldDTOList, aiJSONAssistant.getRight()));
		log.info("OCR JSON: {}", chatted.aiMessage().text());

		return R.ok(chatted.aiMessage().text());
	}

	/**
	 * 构建聊天请求
	 * @param confEntity conf 实体
	 * @param lllAiOcrResult lll AI OCR 结果
	 * @param fieldDTOList 字段 dtolist
	 * @param jsonModel JSON 模型
	 * @return {@link ChatRequest }
	 */
	private ChatRequest buildChatRequest(AiOcrConfEntity confEntity, String lllAiOcrResult,
	                                     List<LlmOCRFieldDTO> fieldDTOList, String jsonModel) {
		ChatRequest.Builder builder = ChatRequest.builder();
		List<String> fieldNames = new ArrayList<>();
		fieldNames.add("isContain");
		fieldNames.addAll(fieldDTOList.stream().map(LlmOCRFieldDTO::getName).toList());
		JsonSchema jsonSchema = JsonSchema.builder()
			.name("OCResult")
				.rootElement(JsonObjectSchema.builder().addProperties(new LinkedHashMap<>() {
				{
					// 是否包含
					put("isContain", JsonBooleanSchema.builder().description(confEntity.getOcrPrompt()).build());
					// 目标OCR 的字段列表
					for (LlmOCRFieldDTO llmOCRFieldDTO : fieldDTOList) {
						put(llmOCRFieldDTO.getName(),
								JsonStringSchema.builder().description(llmOCRFieldDTO.getDescription()).build());
					}
				}
			}).required(fieldNames).additionalProperties(false).build())
			.build();

		// JSON Schema
		if (Objects.equals(jsonModel, ModelProviderFormatEnums.OPENAI.getFormat())) {
			builder
				.messages(systemMessage(PromptBuilder.render("ocr-system-json.st")),
						userMessage(lllAiOcrResult))
				.responseFormat(ResponseFormat.builder().type(JSON).jsonSchema(jsonSchema).build());
		}
		else {
			builder.messages(systemMessage(PromptBuilder.render("ocr-system-json.st")), userMessage(PromptBuilder
				.render("ocr-user-json.st",
						Map.of("userInput", lllAiOcrResult, "jsonSchema", jsonSchema))));
		}

		return builder.build();
	}

}
