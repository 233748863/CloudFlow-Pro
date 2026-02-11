package cn.joywon.poco.knowledge.support.handler.rag;

import cn.joywon.poco.knowledge.entity.AiDatasetEntity;
import cn.joywon.poco.knowledge.entity.AiEmbedStoreEntity;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.store.embedding.EmbeddingStore;

/**
 * 向量存储抽象工厂
 *
 * @author poco
 * @date 2025/2/11
 */
public interface EmbeddingStoreFactory {

	/**
	 * 支持
	 * @param storeType 嵌入库类型
	 * @return boolean
	 */
	boolean support(String storeType);

	/**
	 * 创建 Embedding Store
	 * @param embedStoreEntity 嵌入库配置店实体
	 * @param aiDatasetEntity AI 数据集实体
	 * @return {@link EmbeddingStore }<{@link TextSegment }>
	 * @throws Exception 例外
	 */
	EmbeddingStore<TextSegment> createEmbeddingStore(AiEmbedStoreEntity embedStoreEntity,
			AiDatasetEntity aiDatasetEntity) throws Exception;

}
