package cn.joywon.poco.knowledge.service;

import com.baomidou.mybatisplus.extension.service.IService;
import cn.joywon.poco.knowledge.entity.AiMcpConfigEntity;

public interface AiMcpConfigService extends IService<AiMcpConfigEntity> {

    /**
     * 保存 MCP
     *
     * @param aiMcpConfig AI MCP 配置
     * @return boolean
     */
    boolean saveOrUpdateMcp(AiMcpConfigEntity aiMcpConfig);
}
