package cn.joywon.poco.knowledge.support.constant;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldNameConstants;

/**
 * Chat类型
 *
 * @author poco
 * @date 2024/4/19 if (lastUserMessage.getDatasetId() == -1L) { return "functionChat"; }
 * <p>
 * if (lastUserMessage.getDatasetId() == 0L) { return "simpleChat"; }
 * <p>
 * if (lastUserMessage.getDatasetId() == -2L) { return "databaseChat"; } return
 * "vectorChat";
 */
@Getter
@RequiredArgsConstructor
@FieldNameConstants
public enum ChatTypeEnums {

	/**
	 * 功能聊天
	 */
	FUNCTION_CHAT(-1L, "functionChat"),
	/**
	 * 简单聊天
	 */
	SIMPLE_CHAT(0L, "simpleChat"),
	/**
	 * 数据库聊天
	 */
	DATABASE_CHAT(-2L, "databaseChat"),
	/**
	 * 生成图片
	 */
	IMAGE_CHAT(-3L, "text2ImageChat"),

	/**
	 * 生成脑图
	 */
	MARKMAP_CHAT(-4L, "text2MarkMapChat"),

	/**
	 * 编排
	 */
	FLOW_CHAT(-5L, "functionChat"),
	/**
	 * JSON 聊天
	 */
	JSON_CHAT(-6L, "jsonChat"),

	/**
	 * 推理聊天
	 */
	REASON_CHAT(-7L, "reasonChat"),

	/**
	 * MCP 聊天
	 */
	MCP_CHAT(-8L, "mcpChat"),
	/**
	 * 知识库聊天
	 */
	VECTOR_CHAT(1L, "vectorChat");

	private final Long code;

	private final String type;

	public static ChatTypeEnums fromCode(Long code) {
		for (ChatTypeEnums value : ChatTypeEnums.values()) {
			if (value.code.equals(code)) {
				return value;
			}
		}
		return VECTOR_CHAT;
	}

}
