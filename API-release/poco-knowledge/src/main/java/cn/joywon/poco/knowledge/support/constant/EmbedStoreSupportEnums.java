package cn.joywon.poco.knowledge.support.constant;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 向量库支持
 *
 * @author poco
 * @date 2025/2/11
 */
@RequiredArgsConstructor
public enum EmbedStoreSupportEnums {

	MEMORY("memory", "Memory"),

	QDRANT("qdrant", "Qdrant"),

	CHROMA("chroma", "Chroma"),

	MILVUS("milvus", "Milvus"),

	REDIS("redis", "Redis");

	@Getter
	private final String type;

	private final String desc;

}
