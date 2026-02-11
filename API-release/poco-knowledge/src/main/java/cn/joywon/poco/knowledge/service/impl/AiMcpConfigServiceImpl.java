package cn.joywon.poco.knowledge.service.impl;

import cn.hutool.crypto.SecureUtil;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import cn.joywon.poco.knowledge.entity.AiMcpConfigEntity;
import cn.joywon.poco.knowledge.mapper.AiMcpConfigMapper;
import cn.joywon.poco.knowledge.service.AiMcpConfigService;
import cn.joywon.poco.knowledge.support.constant.EmbedBizTypeEnums;
import cn.joywon.poco.knowledge.support.provider.MemoryEmbeddingProvider;
import dev.langchain4j.data.document.Metadata;
import dev.langchain4j.data.segment.TextSegment;
import org.springframework.stereotype.Service;

import java.util.Map;

import static cn.joywon.poco.knowledge.support.provider.MemoryEmbeddingProvider.TEMP_ID;

/**
 * MCP配置表
 *
 * @author poco
 * @date 2025-03-22 13:36:32
 */
@Service
public class AiMcpConfigServiceImpl extends ServiceImpl<AiMcpConfigMapper, AiMcpConfigEntity> implements AiMcpConfigService {
    /**
     * 保存 MCP
     *
     * @param mcpConfigEntity AI MCP 配置
     * @return boolean
     */
    @Override
    public boolean saveOrUpdateMcp(AiMcpConfigEntity mcpConfigEntity) {
        baseMapper.insertOrUpdate(mcpConfigEntity);
        TextSegment textSegment = TextSegment.textSegment(mcpConfigEntity.getName() + mcpConfigEntity.getDescription(),
                Metadata.from(Map.of(EmbedBizTypeEnums.Fields.type, EmbedBizTypeEnums.CHAT2MCP.getType()
                        , TEMP_ID, mcpConfigEntity.getMcpId()))
        );
        MemoryEmbeddingProvider.add(SecureUtil.md5(mcpConfigEntity.getName()), textSegment);
        return true;
    }
}
