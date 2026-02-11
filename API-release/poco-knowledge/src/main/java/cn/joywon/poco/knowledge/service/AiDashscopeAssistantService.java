package cn.joywon.poco.knowledge.service;

import cn.joywon.poco.knowledge.entity.AiModelEntity;

/**
 * <a href="https://bailian.console.aliyun.com/">AI 特殊模型</a>
 *
 * @author poco
 * @date 2024/09/27
 */
public interface AiDashscopeAssistantService {

	/**
	 * 生成图像
	 * @param prompt 提示
	 * @param aiModelEntity AI 模型实体
	 * @return {@link String }
	 */
	String generateImage(String prompt, AiModelEntity aiModelEntity);

	/**
	 * 音频转文本
	 * @param fileData 文件数据
	 * @param aiModelEntity AI 模型实体
	 * @return {@link String }
	 */
	String audioToText(byte[] fileData, AiModelEntity aiModelEntity);

	/**
	 * 文本转音频
	 * @param text 发短信
	 * @return {@link String }
	 */
	String textToAudio(String text);

}
