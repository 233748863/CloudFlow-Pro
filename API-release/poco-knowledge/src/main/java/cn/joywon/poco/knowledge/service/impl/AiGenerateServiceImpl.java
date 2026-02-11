package cn.joywon.poco.knowledge.service.impl;

import cn.hutool.core.codec.Base64;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import cn.joywon.poco.knowledge.dto.AiGenerateDTO;
import cn.joywon.poco.knowledge.dto.SiliconflowAudioModelDTO;
import cn.joywon.poco.knowledge.entity.AiModelEntity;
import cn.joywon.poco.knowledge.mapper.AiModelMapper;
import cn.joywon.poco.knowledge.service.AiDashscopeAssistantService;
import cn.joywon.poco.knowledge.service.AiGenerateService;
import cn.joywon.poco.knowledge.service.AiSiliconflowAssistantService;
import cn.joywon.poco.knowledge.support.constant.ModelSupportEnums;
import cn.joywon.poco.knowledge.support.provider.ModelProvider;
import cn.joywon.poco.knowledge.support.util.ByteArrayMultipartFile;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.prompt.PromptTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import java.util.Objects;

/**
 * 生成服务
 *
 * @author poco
 * @date 2024/6/17
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiGenerateServiceImpl implements AiGenerateService {

	private final AiDashscopeAssistantService aiDashscopeAssistantService;

	private final AiModelMapper aiModelMapper;

	private final ModelProvider modelProvider;

	/**
	 * 生成文本模板
	 */
	@Value("classpath:/prompts/gen-text.st")
	private Resource generateTextResource;

	/**
	 * 生成文本
	 * @param generateDTO 输入文本
	 * @return string
	 */
	@Override
	public String generateText(AiGenerateDTO generateDTO) {
		PromptTemplate promptTemplat = new PromptTemplate(generateTextResource);
		promptTemplat.add("prompt", generateDTO.getPrompt());
		promptTemplat.add("conditions", generateDTO.getConditions());

		return modelProvider.getAiAssistant(generateDTO.getModelName()).getValue().chat(promptTemplat.render());
	}

	/**
	 * 选择功能
	 * @param conversationId 会话ID
	 * @param description 描述
	 * @return string
	 */
	@Override
	public String selectFunction(String conversationId, String description) {
		return null;
	}

	/**
	 * 通过音频生成文本
	 * @param fileData 文件数据
	 * @return {@link String }
	 */
	@Override
	public String generateTextByAudio(byte[] fileData) {
		AiModelEntity aiModelEntity = aiModelMapper.selectOne(Wrappers.<AiModelEntity>lambdaQuery()
			.eq(AiModelEntity::getProvider, ModelSupportEnums.SILICONFLOW_SENSE_VOICE_SMALL.getProvider())
			.eq(AiModelEntity::getModelName, ModelSupportEnums.SILICONFLOW_SENSE_VOICE_SMALL.getCode()), false);

		if (Objects.isNull(aiModelEntity)) {
			return "未找到对应的音频模型: " + ModelSupportEnums.SILICONFLOW_SENSE_VOICE_SMALL.getCode();
		}

		if (ModelSupportEnums.SILICONFLOW_SENSE_VOICE_SMALL.getCode().equals(aiModelEntity.getModelName())) {
			AiSiliconflowAssistantService fileAssistant = modelProvider.getFileAssistant(aiModelEntity.getName());
			ByteArrayMultipartFile byteArrayMultipartFile = new ByteArrayMultipartFile("upload.wav", "upload.wav", null,
					fileData);
			return fileAssistant.audioToText(byteArrayMultipartFile, aiModelEntity.getModelName());
		}

		return aiDashscopeAssistantService.audioToText(fileData, aiModelEntity);
	}

	/**
	 * 通过文本生成音频
	 * @param text 发短信
	 * @return {@link String }
	 */
	@Override
	@SneakyThrows
	public String generateAudioByText(String text) {
		AiModelEntity aiModelEntity = aiModelMapper.selectOne(Wrappers.<AiModelEntity>lambdaQuery()
			.eq(AiModelEntity::getProvider, ModelSupportEnums.SILICONFLOW_SENSE_VOICE_SMALL.getProvider())
			.eq(AiModelEntity::getModelName, ModelSupportEnums.SILICONFLOW_SENSE_VOICE_SMALL.getCode()), false);

		if (Objects.isNull(aiModelEntity)) {
			return "未找到对应的音频模型: " + ModelSupportEnums.SILICONFLOW_SENSE_VOICE_SMALL.getCode();
		}

		AiSiliconflowAssistantService fileAssistant = modelProvider.getFileAssistant(aiModelEntity.getName());

		SiliconflowAudioModelDTO audioModelDTO = new SiliconflowAudioModelDTO();
		audioModelDTO.setInput(text);
		audioModelDTO.setModel(ModelSupportEnums.SILICONFLOW_GPT_SOVITS.getCode());
		audioModelDTO.setVoice(ModelSupportEnums.SILICONFLOW_GPT_SOVITS.getDesc());
		Resource resource = fileAssistant.textToAudio(audioModelDTO);
		return Base64.encode(resource.getContentAsByteArray());
	}

}
