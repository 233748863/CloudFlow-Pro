package cn.joywon.poco.knowledge.service;

import com.baomidou.mybatisplus.extension.service.IService;
import cn.joywon.poco.knowledge.entity.AiEmbedStoreEntity;

public interface AiEmbedStoreService extends IService<AiEmbedStoreEntity> {

    /**
     * 更新 Embed Store
     *
     * @param aiEmbedStore AI 嵌入商店
     * @return {@link Boolean }
     */
    Boolean updateEmbedStore(AiEmbedStoreEntity aiEmbedStore);
}
