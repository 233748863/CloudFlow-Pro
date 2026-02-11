package cn.joywon.poco.knowledge.service;

import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.store.embedding.EmbeddingStore;

import java.util.List;

/**
 * 向量存储服务
 *
 * @author poco
 * @date 2024/9/26
 */
public interface EmbeddingStoreService {

	/**
	 * 获取嵌入存储
	 * @param collectionName 集合名称
	 * @return {@link EmbeddingStore }<{@link TextSegment }>
	 */
	EmbeddingStore<TextSegment> embeddingStore(String collectionName);

	/**
	 * 删除
	 * @param collectionName 集合名称
	 * @param idList ID 列表
	 */
	void delete(String collectionName, List<String> idList);


	/**
	 * 删除嵌入存储
	 *
	 * @param name 名字
	 */
	void deleteEmbeddingStore(String name);

}
