package cn.joywon.poco.knowledge.service.impl;

import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import cn.joywon.poco.common.core.constant.enums.YesNoEnum;
import cn.joywon.poco.knowledge.entity.AiDatasetEntity;
import cn.joywon.poco.knowledge.entity.AiDocumentEntity;
import cn.joywon.poco.knowledge.entity.AiSliceEntity;
import cn.joywon.poco.knowledge.mapper.AiDatasetMapper;
import cn.joywon.poco.knowledge.mapper.AiDocumentMapper;
import cn.joywon.poco.knowledge.mapper.AiSliceMapper;
import cn.joywon.poco.knowledge.service.AiSliceService;
import cn.joywon.poco.knowledge.service.EmbeddingStoreService;
import cn.joywon.poco.knowledge.support.constant.DocumentTypeEnums;
import cn.joywon.poco.knowledge.support.constant.SliceStatusEnums;
import cn.joywon.poco.knowledge.support.constant.SourceTypeEnums;
import cn.joywon.poco.knowledge.support.constant.SummaryStatusEnums;
import cn.joywon.poco.knowledge.support.provider.ModelProvider;
import dev.langchain4j.data.document.Metadata;
import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.model.embedding.DimensionAwareEmbeddingModel;
import dev.langchain4j.model.output.Response;
import dev.langchain4j.store.embedding.EmbeddingStore;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.jetbrains.annotations.NotNull;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * 知识切片
 *
 * @author pig
 * @date 2024-03-14 13:39:40
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiSliceServiceImpl extends ServiceImpl<AiSliceMapper, AiSliceEntity> implements AiSliceService {

    private final EmbeddingStoreService embeddingStoreService;

    private final AiDocumentMapper documentMapper;

    private final AiDatasetMapper aiDatasetMapper;

    private final ModelProvider modelProvider;

    /**
     * 异步通过id删除切片和嵌入向量
     *
     * @param sliceIdList id 列表
     */
    @Override
    public Boolean removeSliceAndEbeddingById(List<Long> sliceIdList) {
        List<AiSliceEntity> aiSliceEntityList = baseMapper.selectBatchIds(sliceIdList);

        baseMapper.deleteBatchIds(sliceIdList);

        // 分组 List<documentId,List<id>>
        Map<Long, List<AiSliceEntity>> listMap = aiSliceEntityList.stream()
                .collect(Collectors.groupingBy(AiSliceEntity::getDocumentId));

        listMap.forEach((documentId, sliceList) -> {
            AiDocumentEntity documentEntity = documentMapper.selectById(documentId);
            List<String> qdrantIdList = sliceList.stream()
                    .map(AiSliceEntity::getQdrantId)
                    .filter(Objects::nonNull)
                    .toList();

            try {
                AiDatasetEntity aiDatasetEntity = aiDatasetMapper.selectById(documentEntity.getDatasetId());
                embeddingStoreService.delete(aiDatasetEntity.getCollectionName(), qdrantIdList);
            } catch (Exception e) {
                log.error("删除向量失败", e);
            }
        });

        return Boolean.TRUE;
    }

    /**
     * 更新切片
     *
     * @param aiSlice AI 切片
     * @return {@link Boolean }
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Boolean updateSlice(AiSliceEntity aiSlice) {
        // 更新数据的数据 (状态设置为未向量化)
        aiSlice.setSliceStatus(SliceStatusEnums.UNSLICED.getStatus());
        this.updateById(aiSlice);
        // 更新向量 (状态为未向量化)
        AiDocumentEntity aiDocumentEntity = documentMapper.selectById(aiSlice.getDocumentId());
        this.embedSlice(aiDocumentEntity, SliceStatusEnums.UNSLICED);
        return Boolean.TRUE;
    }

    /**
     * 异步更新切片的命中次数 & 文档的命中次数
     *
     * @param qdrantIdList idlist
     */
    @Override
    @Async
    public void updateHitCount(List<String> qdrantIdList) {
        baseMapper.selectList(Wrappers.<AiSliceEntity>lambdaQuery().in(AiSliceEntity::getQdrantId, qdrantIdList))
                .forEach(slice -> {
                    baseMapper.update(Wrappers.<AiSliceEntity>lambdaUpdate()
                            .setSql("hit_count = hit_count + 1")
                            .eq(AiSliceEntity::getId, slice.getId()));

                    documentMapper.update(Wrappers.<AiDocumentEntity>lambdaUpdate()
                            .setSql("hit_count = hit_count + 1")
                            .eq(AiDocumentEntity::getId, slice.getDocumentId()));
                });
    }

    /**
     * 嵌入切片
     *
     * @param documentEntity   Document 实体
     * @param sliceStatusEnums 切片状态枚举
     */
    @Override
    public void embedSlice(AiDocumentEntity documentEntity, SliceStatusEnums sliceStatusEnums) {
        List<AiSliceEntity> aiSliceEntityList = this.list(Wrappers.<AiSliceEntity>lambdaQuery()
                .eq(AiSliceEntity::getDocumentId, documentEntity.getId())
                .eq(AiSliceEntity::getSliceStatus, sliceStatusEnums.getStatus()));

        for (AiSliceEntity slice : aiSliceEntityList) {
            if (StrUtil.isBlank(slice.getContent())) {
                handleEmptyContent(slice);
                continue;
            }

            // 删除脏数据
            AiDatasetEntity aiDataset = aiDatasetMapper.selectById(documentEntity.getDatasetId());
            if (Objects.isNull(aiDataset)) {
                documentMapper.deleteById(documentEntity.getId());
                continue;
            }

            if (shouldSkipSummary(aiDataset, documentEntity)) {
                continue;
            }

            if (StrUtil.isNotBlank(slice.getQdrantId())) {
                removeExistingEmbedding(aiDataset, slice);
            }

            try {
                String qdrantId = buildSlice(aiDataset, slice, documentEntity);
                slice.setSliceStatus(SliceStatusEnums.SLICED.getStatus());
                slice.setQdrantId(qdrantId);
            } catch (Exception e) {
                log.warn("切片 {} 训练失败，等待定时任务处理", slice.getName(), e);
                slice.setSliceStatus(SliceStatusEnums.FAILED.getStatus());
            }
            this.updateById(slice);
        }
    }

    /**
     * 处理空内容
     *
     * @param slice 片
     */
    private void handleEmptyContent(AiSliceEntity slice) {
        log.warn("切片内容为空，跳过向量化:{}", slice.getId());
        slice.setSliceStatus(SliceStatusEnums.FAILED.getStatus());
        this.updateById(slice);
    }

    /**
     * 应跳过摘要
     *
     * @param aiDataset      AI 数据集
     * @param documentEntity Document 实体
     * @return boolean
     */
    private boolean shouldSkipSummary(AiDatasetEntity aiDataset, AiDocumentEntity documentEntity) {
        return YesNoEnum.YES.getCode().equals(aiDataset.getPreSummary())
                && !SourceTypeEnums.QA.getType().equals(documentEntity.getSourceType())
                && !documentEntity.getSummaryStatus().equals(SummaryStatusEnums.SUMMARYED.getStatus());
    }

    /**
     * 删除现有嵌入
     *
     * @param aiDataset AI 数据集
     * @param slice     片
     */
    private void removeExistingEmbedding(AiDatasetEntity aiDataset, AiSliceEntity slice) {
        log.debug("切片已经向量化，跳过向量化:{}", slice.getId());
        embeddingStoreService.delete(aiDataset.getCollectionName(), List.of(slice.getQdrantId()));
    }

    /**
     * 构建切片
     *
     * @param aiDataset      AI 数据集
     * @param slice          片
     * @param documentEntity Document 实体
     * @return {@link String }
     */
    private @NotNull String buildSlice(AiDatasetEntity aiDataset, AiSliceEntity slice,
                                       AiDocumentEntity documentEntity) {
        String qdrantContent = StrUtil.format("{}\n{}", documentEntity.getName(), slice.getContent());

        if (YesNoEnum.YES.getCode().equals(aiDataset.getPreSummary())
                && !SourceTypeEnums.QA.getType().equals(documentEntity.getSourceType())
                && StrUtil.isNotBlank(documentEntity.getSummary())) {
            qdrantContent = qdrantContent + StrUtil.subSufByLength(documentEntity.getSummary(), 200);
        }

        DimensionAwareEmbeddingModel embeddingModel = modelProvider.getEmbeddingModel(aiDataset.getEmbeddingModel());
        EmbeddingStore<TextSegment> textSegmentEmbeddingStore = embeddingStoreService
                .embeddingStore(aiDataset.getCollectionName());
        Response<Embedding> embeddingResponse = embeddingModel.embed(qdrantContent);
        return textSegmentEmbeddingStore.add(embeddingResponse.content(),
                TextSegment.textSegment(qdrantContent,
                        new Metadata(Map.of(DocumentTypeEnums.Fields.type, DocumentTypeEnums.ANSWER.getType(),
                                AiSliceEntity.Fields.id, slice.getId().toString(), AiDocumentEntity.Fields.datasetId,
                                documentEntity.getDatasetId().toString(), AiSliceEntity.Fields.documentId,
                                slice.getDocumentId().toString(), AiDocumentEntity.Fields.sourceType,
                                documentEntity.getSourceType()))));
    }

}
