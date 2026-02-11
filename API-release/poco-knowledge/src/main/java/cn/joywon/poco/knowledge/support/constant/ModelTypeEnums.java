package cn.joywon.poco.knowledge.support.constant;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 模型类型
 *
 * @author poco
 * @date 2024/4/15
 * <p>
 * <p>
 * export const modelTypes = [ { label: '聊天', value: 'Chat' }, { label: '向量', value:
 * 'Embedding' }, { label: '图片', value: 'Image' }, { label: '音频', value: 'Voice' }, ];
 */
@Getter
@RequiredArgsConstructor
public enum ModelTypeEnums {

	/**
	 * 聊天
	 */
	CHAT("Chat", "聊天"),

	/**
	 * 嵌入
	 */
	EMBEDDING("Embedding", "向量"),

	/**
	 * 图像
	 */
	IMAGE("Image", "图片"),

	/**
	 * 视觉
	 */
	VISION("Vision", "视觉理解"),

	/**
	 * 声音
	 */
	VOICE("Voice", "音频");

	/**
	 * 编码
	 */
	private final String type;

	/**
	 * 描述
	 */
	private final String desc;

}
