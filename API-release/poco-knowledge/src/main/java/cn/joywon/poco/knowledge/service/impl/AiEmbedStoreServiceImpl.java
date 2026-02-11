package cn.joywon.poco.knowledge.service.impl;

import cn.hutool.core.collection.CollUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import cn.joywon.poco.knowledge.entity.AiDatasetEntity;
import cn.joywon.poco.knowledge.entity.AiEmbedStoreEntity;
import cn.joywon.poco.knowledge.mapper.AiDatasetMapper;
import cn.joywon.poco.knowledge.mapper.AiEmbedStoreMapper;
import cn.joywon.poco.knowledge.service.AiEmbedStoreService;
import cn.joywon.poco.knowledge.service.EmbeddingStoreService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 向量库配置
 *
 * @author poco
 * @date 2025-02-11 15:07:46
 */
@Service
@RequiredArgsConstructor
public class AiEmbedStoreServiceImpl extends ServiceImpl<AiEmbedStoreMapper, AiEmbedStoreEntity>
        implements AiEmbedStoreService {

    private final EmbeddingStoreService embeddingStoreService;

    private final AiDatasetMapper aiDatasetMapper;


    /**
     * 更新 Embed Store
     *
     * @param aiEmbedStore AI 嵌入商店
     * @return {@link Boolean }
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Boolean updateEmbedStore(AiEmbedStoreEntity aiEmbedStore) {
        this.updateById(aiEmbedStore);
        List<AiDatasetEntity> datasetEntityList = aiDatasetMapper
                .selectList(Wrappers.<AiDatasetEntity>lambdaQuery()
                        .eq(AiDatasetEntity::getStoreId, aiEmbedStore.getStoreId()));
        if (CollUtil.isNotEmpty(datasetEntityList)) {
            datasetEntityList.forEach(datasetEntity -> {
                embeddingStoreService.deleteEmbeddingStore(datasetEntity.getCollectionName());
            });
        }
        return true;
    }
}
