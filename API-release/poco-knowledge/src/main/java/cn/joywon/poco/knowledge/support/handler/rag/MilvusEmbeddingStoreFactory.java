package cn.joywon.poco.knowledge.support.handler.rag;

import cn.joywon.poco.knowledge.entity.AiDatasetEntity;
import cn.joywon.poco.knowledge.entity.AiEmbedStoreEntity;
import cn.joywon.poco.knowledge.entity.AiSliceEntity;
import cn.joywon.poco.knowledge.support.constant.EmbedStoreSupportEnums;
import cn.joywon.poco.knowledge.support.provider.ModelProvider;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.model.embedding.DimensionAwareEmbeddingModel;
import dev.langchain4j.store.embedding.EmbeddingStore;
import cn.joywon.poco.common.milvus.MilvusEmbeddingStore;
import io.milvus.param.IndexType;
import io.milvus.v2.common.ConsistencyLevel;
import io.milvus.v2.common.IndexParam;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * Milvus
 *
 * @author poco
 * @date 2025/2/11
 */
@Service
@RequiredArgsConstructor
public class MilvusEmbeddingStoreFactory implements EmbeddingStoreFactory {

    private final ModelProvider modelProvider;

    /**
     * 支持
     *
     * @param storeType 嵌入库类型
     * @return boolean
     */
    @Override
    public boolean support(String storeType) {
        return EmbedStoreSupportEnums.MILVUS.getType().equals(storeType);
    }

    /**
     * 创建 Embedding Store
     *
     * @param embedStoreEntity 嵌入库配置店实体
     * @param aiDatasetEntity  AI 数据集实体
     * @return {@link EmbeddingStore }<{@link TextSegment }>
     * @throws Exception 异常
     */
    @Override
    public EmbeddingStore<TextSegment> createEmbeddingStore(AiEmbedStoreEntity embedStoreEntity,
                                                            AiDatasetEntity aiDatasetEntity) throws Exception {

        DimensionAwareEmbeddingModel embeddingModel = modelProvider
                .getEmbeddingModel(aiDatasetEntity.getEmbeddingModel());
        return new MilvusEmbeddingStore(
                aiDatasetEntity.getCollectionName(), // 集合名称
                embeddingModel.dimension(), // 维度
                IndexType.FLAT, // 索引类型
                IndexParam.MetricType.COSINE, // 距离计算方式
                embedStoreEntity.getUri(), // URI
                embedStoreEntity.getApiKey(), // token
                ConsistencyLevel.EVENTUALLY, // 一致性级别
                false, // retrieveEmbeddingsOnSearch
                false, // 是否autoFlushOnInsert
                embedStoreEntity.getExtData(), // database
                AiSliceEntity.Fields.id, // id 字段
                "doc_content", // 文本字段
                "metadata", // 文本字段
                "vector");// 文本字段
    }

}
