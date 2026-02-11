package cn.joywon.poco.knowledge.support.handler.rag;

import cn.hutool.core.util.BooleanUtil;
import cn.hutool.core.util.StrUtil;
import cn.joywon.poco.knowledge.entity.AiDatasetEntity;
import cn.joywon.poco.knowledge.entity.AiEmbedStoreEntity;
import cn.joywon.poco.knowledge.support.constant.EmbedStoreSupportEnums;
import cn.joywon.poco.knowledge.support.provider.ModelProvider;
import cn.joywon.poco.knowledge.support.provider.QdrantEmbeddingStoreProvider;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.model.embedding.DimensionAwareEmbeddingModel;
import dev.langchain4j.store.embedding.EmbeddingStore;
import io.qdrant.client.QdrantClient;
import io.qdrant.client.QdrantGrpcClient;
import io.qdrant.client.grpc.Collections;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * @author poco
 * @date 2025/2/11
 */
@Service
@RequiredArgsConstructor
public class QdrantEmbeddingStoreFactory implements EmbeddingStoreFactory {

	private final ModelProvider modelProvider;

	/**
	 * 支持
	 * @param storeType 嵌入库类型
	 * @return boolean
	 */
	@Override
	public boolean support(String storeType) {
		return EmbedStoreSupportEnums.QDRANT.getType().equals(storeType);
	}

	/**
	 * 创建 Embedding Store
	 * @param embedStoreEntity 嵌入库配置店实体
	 * @param aiDatasetEntity AI 数据集实体
	 * @return {@link EmbeddingStore }<{@link TextSegment }>
	 * @throws Exception 例外
	 */
	@Override
	public EmbeddingStore<TextSegment> createEmbeddingStore(AiEmbedStoreEntity embedStoreEntity,
			AiDatasetEntity aiDatasetEntity) throws Exception {
		QdrantGrpcClient.Builder grpcClientBuilder = QdrantGrpcClient.newBuilder(embedStoreEntity.getHost(),
				embedStoreEntity.getPort(), BooleanUtil.toBoolean(embedStoreEntity.getUseTls()));
		if (StrUtil.isNotBlank(embedStoreEntity.getApiKey())) {
			grpcClientBuilder.withApiKey(embedStoreEntity.getApiKey());
		}
		QdrantClient qdrantClient = new QdrantClient(grpcClientBuilder.build());

		// 创建集合,使用知识库的ID作为名称
		DimensionAwareEmbeddingModel embeddingModel = modelProvider
			.getEmbeddingModel(aiDatasetEntity.getEmbeddingModel());
		var vectorParams = Collections.VectorParams.newBuilder()
			.setDistance(Collections.Distance.Cosine)
			.setSize(embeddingModel.dimension())
			.build();

		// 创建集合
		if (!qdrantClient.collectionExistsAsync(aiDatasetEntity.getCollectionName()).get()) {
			qdrantClient.createCollectionAsync(aiDatasetEntity.getCollectionName(), vectorParams).get();
		}

		return new QdrantEmbeddingStoreProvider(qdrantClient, aiDatasetEntity.getCollectionName(), "doc_content");
	}

}
