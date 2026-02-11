package cn.joywon.poco.knowledge.service;

import com.baomidou.mybatisplus.extension.service.IService;
import cn.joywon.poco.knowledge.entity.AiDataEntity;
import cn.joywon.poco.knowledge.entity.AiDataTableEntity;

import java.util.List;

public interface AiDataService extends IService<AiDataEntity> {

    /**
     * 数据集定义
     *
     * @param dataId 数据id
     * @return {@link String }
     */
    String queryDataSchema(Long dataId);


    /**
     * 查询表定义
     *
     * @param tableEntityList 表实体列表
     * @return {@link String }
     */
    String queryTableSchema(List<AiDataTableEntity> tableEntityList);

    /**
     * 保存或更新数据
     *
     * @param aiData AI 数据
     * @return boolean
     */
    boolean saveOrUpdateData(AiDataEntity aiData);
}
