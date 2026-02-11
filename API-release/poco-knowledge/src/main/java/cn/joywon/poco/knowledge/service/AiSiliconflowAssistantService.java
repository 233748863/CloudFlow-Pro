package cn.joywon.poco.knowledge.service;

import cn.joywon.poco.knowledge.dto.RerankerModelDTO;
import cn.joywon.poco.knowledge.dto.SiliconflowAudioModelDTO;
import cn.joywon.poco.knowledge.dto.SiliconflowImageModelDTO;
import org.springframework.core.io.Resource;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.service.annotation.PostExchange;

/**
 * <a href="https://cloud.siliconflow.cn/">AI 特殊模型</a>
 *
 * @author poco
 * @date 2024/09/27
 */
public interface AiSiliconflowAssistantService {

	/**
	 * 生成
	 * @param requst 要求
	 * @return {@link SiliconflowImageModelDTO.ImageModelResponse }
	 */
	@PostExchange("/image/generations")
	SiliconflowImageModelDTO.ImageModelResponse generateImage(
			@RequestBody SiliconflowImageModelDTO.ImageModelRequst requst);

	/**
	 * 声音转文本
	 * @param file 文件数据
	 * @param model 模型
	 * @return {@link String }
	 */
	@PostExchange(value = "/audio/transcriptions")
	String audioToText(@RequestPart MultipartFile file, @RequestParam String model);

	/**
	 * 重排
	 * @param request 请求
	 * @return {@link RerankerModelDTO.RerankerModelResponse }
	 */
	@PostExchange(value = "/rerank")
	RerankerModelDTO.RerankerModelResponse rerank(@RequestBody RerankerModelDTO.RerankerModelRequest request);

	/**
	 * 文本转音频
	 * @param audioModelDTO 音频模型 DTO
	 * @return {@link String }
	 */
	@PostExchange(value = "/audio/speech")
	Resource textToAudio(@RequestBody SiliconflowAudioModelDTO audioModelDTO);

}
