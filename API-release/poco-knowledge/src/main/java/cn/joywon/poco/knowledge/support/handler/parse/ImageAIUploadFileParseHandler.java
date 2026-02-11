package cn.joywon.poco.knowledge.support.handler.parse;

import cn.hutool.core.io.FileUtil;
import cn.hutool.core.lang.Pair;
import cn.joywon.poco.common.core.constant.enums.YesNoEnum;
import cn.joywon.poco.knowledge.entity.AiDatasetEntity;
import cn.joywon.poco.knowledge.entity.AiDocumentEntity;
import cn.joywon.poco.knowledge.service.AiAssistantService;
import cn.joywon.poco.knowledge.support.constant.FileParserStatusEnums;
import cn.joywon.poco.knowledge.support.constant.FileTypeEnums;
import cn.joywon.poco.knowledge.support.provider.ModelProvider;
import cn.joywon.poco.knowledge.support.util.PromptBuilder;
import dev.langchain4j.data.message.ImageContent;
import dev.langchain4j.data.message.TextContent;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.chat.response.ChatResponse;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.util.Base64;
import java.util.Map;

/**
 * @author poco
 * @date 2024/3/15
 * <p>
 * 图片 AI 处理
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ImageAIUploadFileParseHandler implements UploadFileParseHandler {

	private final ModelProvider modelProvider;

	/**
	 * 支持
	 * @param aiDataset
	 * @param documentEntity Document 实体
	 * @return boolean
	 */
	@Override
	public boolean supports(AiDatasetEntity aiDataset, AiDocumentEntity documentEntity) {
		String contentType = FileUtil.extName(documentEntity.getFileUrl());

		if (YesNoEnum.NO.getCode().equals(aiDataset.getAiOcrFlag())) {
			return false;
		}

		return FileTypeEnums.PNG.getType().equals(contentType) || FileTypeEnums.JPG.getType().equals(contentType)
				|| FileTypeEnums.JPEG.getType().equals(contentType);
	}

	/**
	 * 解析文件
	 * @param documentEntity
	 * @param inputStream 文件字节数组
	 * @param extName
	 * @return String
	 */
	@SneakyThrows
	@Override
	public Pair<FileParserStatusEnums, String> file2String(AiDocumentEntity documentEntity, InputStream inputStream,
			String extName) {
		String encodeToString = Base64.getEncoder().encodeToString(inputStream.readAllBytes());
		Pair<ChatLanguageModel, AiAssistantService> aiVisionAssistant = modelProvider.getAiVisionAssistant();

		UserMessage userMessage = UserMessage.from(TextContent.from(PromptBuilder.render("ocr-common.st", Map.of())),
				ImageContent.from(encodeToString, MediaType.IMAGE_PNG_VALUE));

		try {

			ChatResponse chatResponse = aiVisionAssistant.getKey().chat(userMessage);
			return Pair.of(FileParserStatusEnums.PARSE_SUCCESS, chatResponse.aiMessage().text());
		}
		catch (Exception e) {
			log.error("ImageAIUploadFileParseHandler error", e);
			return Pair.of(FileParserStatusEnums.PARSE_FAIL, e.getMessage());
		}
	}

	/**
	 * 排序； 数值越大，优先加载
	 * @return int
	 */
	@Override
	public int getOrder() {
		return 100;
	}

}
