package cn.joywon.poco.knowledge.support.handler.rag;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.NumberUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.extra.spring.SpringUtil;
import cn.joywon.poco.knowledge.config.properties.AiKnowledgeProperties;
import cn.joywon.poco.knowledge.config.properties.FullTextSearchProperties;
import cn.joywon.poco.knowledge.dto.AiMessageResultDTO;
import cn.joywon.poco.knowledge.dto.ChatMessageDTO;
import cn.joywon.poco.knowledge.entity.AiDatasetEntity;
import cn.joywon.poco.knowledge.entity.AiDocumentEntity;
import cn.joywon.poco.knowledge.entity.AiSliceEntity;
import cn.joywon.poco.knowledge.service.AiDocumentService;
import cn.joywon.poco.knowledge.service.AiSliceService;
import cn.joywon.poco.knowledge.service.EmbeddingStoreService;
import cn.joywon.poco.knowledge.support.constant.DocumentTypeEnums;
import cn.joywon.poco.knowledge.support.provider.ModelProvider;
import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.rag.content.Content;
import dev.langchain4j.rag.content.aggregator.ContentAggregator;
import dev.langchain4j.rag.content.aggregator.DefaultContentAggregator;
import dev.langchain4j.rag.query.Query;
import dev.langchain4j.store.embedding.EmbeddingMatch;
import dev.langchain4j.store.embedding.EmbeddingSearchRequest;
import dev.langchain4j.store.embedding.EmbeddingSearchResult;
import dev.langchain4j.store.embedding.EmbeddingStore;
import cn.joywon.poco.common.milvus.MilvusEmbeddingStore;
import lombok.SneakyThrows;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;

import java.util.*;

import static dev.langchain4j.store.embedding.filter.MetadataFilterBuilder.metadataKey;
import static java.util.Collections.singletonList;
import static java.util.Collections.singletonMap;

/**
 * 问题 搜索向量处理器
 *
 * @author poco
 * @date 2024/7/4
 */
@Service
public class Q2AVectorRagChatHandler extends AbstractRagChatHandler {

    private final static ContentAggregator RERANKING_AGGREGATOR = new DefaultContentAggregator();

    private final EmbeddingStoreService embeddingStoreService;

    private final AiDocumentService aiDocumentService;

    private final AiSliceService aiSliceService;


    public Q2AVectorRagChatHandler(ModelProvider modelProvider, AiDocumentService aiDocumentService,
                                   AiSliceService aiSliceService, EmbeddingStoreService embeddingStoreService) {
        super(modelProvider);
        this.aiDocumentService = aiDocumentService;
        this.aiSliceService = aiSliceService;
        this.embeddingStoreService = embeddingStoreService;
    }

    public Flux<AiMessageResultDTO> process(Embedding embeddedList, AiDatasetEntity dataset,
                                            ChatMessageDTO chatMessageDTO) {
        double minScore = NumberUtil.div(Double.parseDouble(dataset.getScore().toString()), Double.parseDouble("100"),
                2);

        EmbeddingSearchRequest embeddingSearchRequest = EmbeddingSearchRequest.builder()
                .queryEmbedding(embeddedList)
                .maxResults(dataset.getTopK())
                .filter(metadataKey(AiDocumentEntity.Fields.datasetId).isEqualTo(dataset.getId().toString())
                        .and(metadataKey(DocumentTypeEnums.Fields.type).isEqualTo(DocumentTypeEnums.ANSWER.getType())))
                .minScore(minScore)
                .build();

        // 向量查询
        EmbeddingStore<TextSegment> embeddingStore = embeddingStoreService.embeddingStore(dataset.getCollectionName());
        EmbeddingSearchResult<TextSegment> searchResult = embeddingStore.search(embeddingSearchRequest);
        List<EmbeddingMatch<TextSegment>> embeddingMatchList = searchResult.matches();

        // 全文检索 （当前仅支持 milvus）
        AiKnowledgeProperties knowledgeProperties = SpringUtil.getBean(AiKnowledgeProperties.class);
        FullTextSearchProperties fullTextSearch = knowledgeProperties.getFullTextSearch();
        if (embeddingStore instanceof MilvusEmbeddingStore milvusEmbeddingStore && fullTextSearch.isEnabled()) {
            Map<String, Object> searchParams = Map.of(fullTextSearch.getAlgorithm(), fullTextSearch.getDropRatio());
            EmbeddingSearchResult<TextSegment> embeddingSearchResult = milvusEmbeddingStore
                    .searchByBm25(chatMessageDTO.getContent(), searchParams, fullTextSearch.getTopK());
            if (Objects.nonNull(embeddingSearchResult) && !embeddingSearchResult.matches().isEmpty()) {
                embeddingMatchList.add(embeddingSearchResult.matches().get(0));
            }
        }

        // 未匹配
        if (CollUtil.isEmpty(embeddingMatchList)) {
            return Flux.just(new AiMessageResultDTO(dataset.getEmptyDesc()));
        }

        // 用户输入的问题 进行结果重排 (相同的结果会去掉)
        Query query = Query.from(chatMessageDTO.getContent());
        Map<Query, Collection<List<Content>>> queryToContents = singletonMap(
                query,
                singletonList(embeddingMatchList.stream().map(segmentEmbeddingMatch
                        -> Content.from(segmentEmbeddingMatch.embedded().text())).toList())
        );
        List<Content> rerankedContentList = RERANKING_AGGREGATOR.aggregate(queryToContents);

        // 更新命中次数
        List<String> embeddingIdList = embeddingMatchList.stream().map(EmbeddingMatch::embeddingId).toList();
        aiSliceService.updateHitCount(embeddingIdList);

        // 对向量结果进行总结
        Flux<AiMessageResultDTO> aiMessageResultDTOFlux = summaryResult(dataset, chatMessageDTO, rerankedContentList.stream()
                .map(Content::textSegment).map(TextSegment::text).toList())
                .cache();

        // 修改 map 逻辑在最后拼接一下参考资料
        AiMessageResultDTO aiMessageResultDTO = new AiMessageResultDTO();
        aiMessageResultDTO.setMessage(StrUtil.EMPTY);
        List<AiMessageResultDTO.ExtLink> extLinks = buildExtMessage(embeddingMatchList);
        aiMessageResultDTO.setExtLinks(extLinks);
        return aiMessageResultDTOFlux.concatWithValues(aiMessageResultDTO);
    }

    /**
     * 构建扩展信息 （参考资料 tag）
     *
     * @return String
     */
    @SneakyThrows
    private List<AiMessageResultDTO.ExtLink> buildExtMessage(List<EmbeddingMatch<TextSegment>> embeddingMatchList) {
        List<AiMessageResultDTO.ExtLink> extLinks = new ArrayList<>();
        for (EmbeddingMatch<TextSegment> textSegmentEmbeddingMatch : embeddingMatchList) {

            String documentId = textSegmentEmbeddingMatch.embedded()
                    .metadata()
                    .getString(AiSliceEntity.Fields.documentId);
            if (Objects.isNull(documentId)) {
                continue;
            }

            Float distance = textSegmentEmbeddingMatch.score().floatValue();
            AiDocumentEntity aiDocumentEntity = aiDocumentService.getById(Long.parseLong(documentId));
            if (Objects.nonNull(aiDocumentEntity)) {
                extLinks.add(new AiMessageResultDTO.ExtLink(aiDocumentEntity.getName(),
                        String.format("/admin/sys-file/oss/file?fileName=%s", aiDocumentEntity.getFileUrl()),
                        distance));
            }
        }

        return extLinks.stream().distinct().toList();
    }

}
