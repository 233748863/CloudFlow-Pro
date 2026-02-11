package cn.joywon.poco.knowledge.service.impl;

import cn.hutool.core.codec.Base64;
import cn.hutool.json.JSONUtil;
import com.alibaba.dashscope.aigc.imagesynthesis.ImageSynthesis;
import com.alibaba.dashscope.aigc.imagesynthesis.ImageSynthesisParam;
import com.alibaba.dashscope.aigc.imagesynthesis.ImageSynthesisResult;
import com.alibaba.dashscope.audio.ttsv2.SpeechSynthesisParam;
import com.alibaba.dashscope.audio.ttsv2.SpeechSynthesizer;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import cn.joywon.poco.common.core.exception.CheckedException;
import cn.joywon.poco.knowledge.entity.AiModelEntity;
import cn.joywon.poco.knowledge.mapper.AiModelMapper;
import cn.joywon.poco.knowledge.service.AiDashscopeAssistantService;
import cn.joywon.poco.knowledge.support.constant.ImageTaskStatusEnums;
import cn.joywon.poco.knowledge.support.constant.ModelSupportEnums;
import cn.joywon.poco.knowledge.support.util.PromptBuilder;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.nio.ByteBuffer;
import java.util.Map;
import java.util.Objects;

/**
 * @author poco
 * @date 2024/10/12
 * <p>
 * 阿里云百炼接口实现
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiDashscopeAssistantServiceImpl implements AiDashscopeAssistantService {

	private final AiModelMapper aiModelMapper;

	/**
	 * 生成
	 * @param prompt 提示
	 * @return {@link String }
	 */
	@Override
	@SneakyThrows
	public String generateImage(String prompt, AiModelEntity aiModelEntity) {
		ImageSynthesis is = new ImageSynthesis();
		ImageSynthesisParam param = ImageSynthesisParam.builder()
			.apiKey(aiModelEntity.getApiKey())
			.model(aiModelEntity.getModelName())
			.prompt(prompt + PromptBuilder.render("gen-image-limit.st", Map.of()))
			.build();

		ImageSynthesisResult result = is.call(param);
		if (ImageTaskStatusEnums.SUCCESSED.getCode().equals(result.getOutput().getTaskStatus())) {
			return result.getOutput().getResults().get(0).get("url");
		}

		log.error("阿里云大模型 {} 生成图片失败:{}", aiModelEntity.getModelName(), result.getOutput().getMessage());
		return null;
	}

	/**
	 * 音频转文本
	 * @param fileData 文件数据
	 * @param aiModelEntity
	 * @return {@link String }
	 */
	@Override
	public String audioToText(byte[] fileData, AiModelEntity aiModelEntity) {
		throw new UnsupportedOperationException("暂不支持");
	}

	/**
	 * 文本转语音
	 * @param text 文本
	 * @return {@link String }
	 */
	@Override
	public String textToAudio(String text) {
		AiModelEntity aiModelEntity = aiModelMapper.selectOne(Wrappers.<AiModelEntity>lambdaQuery()
			.eq(AiModelEntity::getModelName, ModelSupportEnums.ALIYUN_COSYVOICE_V1.getCode()), false);

		if (Objects.isNull(aiModelEntity)) {
			throw new CheckedException("未找到对应的音频模型:" + ModelSupportEnums.ALIYUN_COSYVOICE_V1.getCode());
		}

		String voice = JSONUtil.parseObj(aiModelEntity.getExtData()).getStr("voice", "longcheng");
		SpeechSynthesisParam param = SpeechSynthesisParam.builder()
			.apiKey(aiModelEntity.getApiKey())
			.model(aiModelEntity.getModelName())
			.voice(voice)
			.build();
		SpeechSynthesizer synthesizer = new SpeechSynthesizer(param, null);
		ByteBuffer audio = synthesizer.call(text);
		return Base64.encode(audio.array());
	}

}
