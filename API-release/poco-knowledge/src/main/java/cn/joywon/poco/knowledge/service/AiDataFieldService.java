package cn.joywon.poco.knowledge.service;

import com.baomidou.mybatisplus.extension.service.IService;
import cn.joywon.poco.knowledge.entity.AiDataFieldEntity;

import java.util.List;

public interface AiDataFieldService extends IService<AiDataFieldEntity> {

    /**
     * 获取或同步
     *
     * @param dsName    DS 名称
     * @param tableName 表名字
     * @return {@link List }<{@link AiDataFieldEntity }>
     */
    List<AiDataFieldEntity> getOrSync(String dsName, String tableName);

    /**
     * 同步表田
     *
     * @param dsName    DS 名称
     * @param tableName 表名字
     * @return boolean
     */
    boolean syncTableField(String dsName, String tableName);

    /**
     * 评估表字段
     *
     * @param dsName    DS 名称
     * @param tableName 表名字
     */
    void assessTableField(String dsName, String tableName);
}
