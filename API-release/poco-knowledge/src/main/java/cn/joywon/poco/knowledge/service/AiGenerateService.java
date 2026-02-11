package cn.joywon.poco.knowledge.service;

import com.alibaba.dashscope.exception.NoApiKeyException;
import cn.joywon.poco.knowledge.dto.AiGenerateDTO;

import java.io.IOException;

/**
 * AI 生成式服务
 *
 * @author poco
 * @date 2024/6/17
 */
public interface AiGenerateService {

	/**
	 * 生成文本
	 * @param generateDTO 输入文本
	 * @return string
	 */
	String generateText(AiGenerateDTO generateDTO);

	/**
	 * 选择功能
	 * @param conversationId 会话ID
	 * @param description 描述
	 * @return string
	 */
	String selectFunction(String conversationId, String description);

	/**
	 * 通过音频生成文本
	 * @param fileData 文件数据
	 * @return {@link String }
	 */
	String generateTextByAudio(byte[] fileData) throws NoApiKeyException;

	/**
	 * 通过文本生成音频
	 * @param text 发短信
	 * @return {@link String }
	 * @throws IOException io异常
	 */
	String generateAudioByText(String text) throws IOException;

}
