package cn.joywon.poco.knowledge.support.provider;

import cn.hutool.extra.spring.SpringUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import cn.joywon.poco.common.core.constant.enums.YesNoEnum;
import cn.joywon.poco.knowledge.config.properties.AiKnowledgeProperties;
import cn.joywon.poco.knowledge.entity.AiModelEntity;
import cn.joywon.poco.knowledge.mapper.AiModelMapper;
import cn.joywon.poco.knowledge.support.constant.ModelTypeEnums;
import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.internal.Utils;
import dev.langchain4j.model.embedding.DimensionAwareEmbeddingModel;
import dev.langchain4j.store.embedding.EmbeddingSearchRequest;
import dev.langchain4j.store.embedding.EmbeddingSearchResult;
import dev.langchain4j.store.embedding.filter.Filter;
import dev.langchain4j.store.embedding.inmemory.InMemoryEmbeddingStore;
import lombok.experimental.UtilityClass;
import lombok.extern.slf4j.Slf4j;
import org.jetbrains.annotations.Nullable;

import java.util.Objects;

/**
 * 内存向量提供程序
 *
 * @author poco
 * @date 2025/03/21
 */
@Slf4j
@UtilityClass
public class MemoryEmbeddingProvider {

    /**
     * 内存存储: TODO 写入到文件中，以便重启后恢复
     */
    public static final InMemoryEmbeddingStore<TextSegment> EMBEDDING_STORE = new InMemoryEmbeddingStore<>();


    public static final String TEMP_ID = "temp_id";

    /**
     * 添加向量
     *
     * @param textSegment 文本
     */
    public void add(TextSegment textSegment) {
        add(Utils.randomUUID(), textSegment);
    }

    /**
     * 添加向量
     *
     * @param id          id
     * @param textSegment 文本段
     */
    public void add(String id, TextSegment textSegment) {
        DimensionAwareEmbeddingModel embeddingModel = getEmbeddingModel();
        if (embeddingModel == null) return;

        // 文件向量
        dev.langchain4j.model.output.Response<Embedding> embeddingResponse = embeddingModel.embed(textSegment.text());
        Embedding embedding = embeddingResponse.content();
        // 向量存储
        EMBEDDING_STORE.add(id, embedding, textSegment);
    }

    /**
     * 获取嵌入模型
     *
     * @return {@link DimensionAwareEmbeddingModel }
     */
    @Nullable
    private static DimensionAwareEmbeddingModel getEmbeddingModel() {
        AiModelMapper modelMapper = SpringUtil.getBean(AiModelMapper.class);

        AiModelEntity aiModelEntity = modelMapper.selectOne(Wrappers.<AiModelEntity>lambdaQuery()
                .eq(AiModelEntity::getDefaultModel, YesNoEnum.YES.getCode())
                .eq(AiModelEntity::getModelType, ModelTypeEnums.EMBEDDING.getType()), false);

        if (Objects.isNull(aiModelEntity)) {
            log.warn("没有默认的向量模型，请检查模型配置，AI 随航无法使用");
            return null;
        }

        ModelProvider modelProvider = SpringUtil.getBean(ModelProvider.class);
        return modelProvider.getEmbeddingModel(aiModelEntity.getName());
    }


    /**
     * 搜索
     *
     * @param text    文本
     * @param filters 过滤 器
     * @return {@link EmbeddingSearchResult }<{@link TextSegment }>
     */
    public EmbeddingSearchResult<TextSegment> search(String text, Filter... filters) {
        AiKnowledgeProperties properties = SpringUtil.getBean(AiKnowledgeProperties.class);
        return search(text, properties.getInMemorySearch().getTopK(), properties.getInMemorySearch().getMinScore(), filters);
    }

    /**
     * 搜索
     *
     * @param text     文本
     * @param topK     结果数量
     * @param minScore 最低分数
     * @param filters  过滤 器
     * @return {@link EmbeddingSearchResult }<{@link TextSegment }>
     */
    public EmbeddingSearchResult<TextSegment> search(String text, int topK, double minScore, Filter... filters) {
        // 文本向量化
        DimensionAwareEmbeddingModel embeddingModel = getEmbeddingModel();
        if (embeddingModel == null) return null;

        Embedding embedding = getEmbeddingModel().embed(text).content();

        EmbeddingSearchRequest.EmbeddingSearchRequestBuilder builder = EmbeddingSearchRequest.builder()
                .queryEmbedding(embedding)
                .minScore(minScore)
                .maxResults(topK);

        for (Filter filter : filters) {
            builder.filter(filter);
        }

        // 查询向量库
        return EMBEDDING_STORE.search(builder.build());
    }


}
