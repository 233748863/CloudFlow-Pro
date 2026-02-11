package cn.joywon.poco.knowledge.support.handler.rag;

import cn.joywon.poco.knowledge.entity.AiDatasetEntity;
import cn.joywon.poco.knowledge.entity.AiEmbedStoreEntity;
import cn.joywon.poco.knowledge.support.constant.EmbedStoreSupportEnums;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.store.embedding.EmbeddingStore;
import dev.langchain4j.store.embedding.chroma.ChromaEmbeddingStore;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * chroma 嵌入库
 *
 * @author poco
 * @date 2025/2/11
 */
@Service
@RequiredArgsConstructor
public class ChromaEmbeddingStoreFactory implements EmbeddingStoreFactory {

	/**
	 * CHROMA
	 * @param storeType 嵌入库类型
	 * @return boolean
	 */
	@Override
	public boolean support(String storeType) {
		return EmbedStoreSupportEnums.CHROMA.getType().equals(storeType);
	}

	/**
	 * 创建 Embedding Store
	 * @param embedStoreEntity 嵌入库配置店实体
	 * @param aiDatasetEntity AI 数据集实体
	 * @return {@link EmbeddingStore }<{@link TextSegment }>
	 * @throws Exception 异常
	 */
	@Override
	public EmbeddingStore<TextSegment> createEmbeddingStore(AiEmbedStoreEntity embedStoreEntity,
			AiDatasetEntity aiDatasetEntity) throws Exception {
		// 会自动创建集合
		return ChromaEmbeddingStore.builder()
			.baseUrl(embedStoreEntity.getUri())
			.collectionName(aiDatasetEntity.getCollectionName())
			.build();
	}

}
