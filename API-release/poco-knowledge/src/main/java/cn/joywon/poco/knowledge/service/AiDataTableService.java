package cn.joywon.poco.knowledge.service;

import com.baomidou.mybatisplus.extension.service.IService;
import cn.joywon.poco.knowledge.entity.AiDataTableEntity;

public interface AiDataTableService extends IService<AiDataTableEntity> {

    /**
     * 同步
     *
     * @return boolean
     */
    boolean sync();
}
