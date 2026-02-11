package cn.joywon.poco.knowledge.config;

import cn.hutool.crypto.SecureUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import cn.joywon.poco.common.core.constant.enums.YesNoEnum;
import cn.joywon.poco.knowledge.entity.AiDataEntity;
import cn.joywon.poco.knowledge.entity.AiMcpConfigEntity;
import cn.joywon.poco.knowledge.mapper.AiDataMapper;
import cn.joywon.poco.knowledge.mapper.AiMcpConfigMapper;
import cn.joywon.poco.knowledge.support.constant.EmbedBizTypeEnums;
import cn.joywon.poco.knowledge.support.function.FunctionCalling;
import cn.joywon.poco.knowledge.support.provider.MemoryEmbeddingProvider;
import dev.langchain4j.data.document.Metadata;
import dev.langchain4j.data.segment.TextSegment;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.web.context.WebServerInitializedEvent;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.scheduling.annotation.Async;

import java.util.List;
import java.util.Map;

import static cn.joywon.poco.knowledge.support.provider.MemoryEmbeddingProvider.TEMP_ID;

/**
 * AI 向量初始化
 *
 * @author poco
 * @date 2025/03/21
 */
@Slf4j
@Configuration
@RequiredArgsConstructor
public class AiEmbedInitRunner {

    /**
     * 函数功能列表
     */
    private final List<FunctionCalling> functionCallingList;

    /**
     * AI MCP 配置集合
     */
    private final AiMcpConfigMapper aiMcpConfigMapper;

    /**
     * AI 数据集合
     */
    private final AiDataMapper aiDataMapper;

    @Async
    @Order
    @EventListener({WebServerInitializedEvent.class})
    public void WebServerInit() {
        // 初始化函数调用列表
        for (FunctionCalling functionCalling : functionCallingList) {
            TextSegment textSegment = TextSegment.textSegment(functionCalling.functionName() + functionCalling.functionDesc(),
                    Metadata.from(Map.of(EmbedBizTypeEnums.Fields.type, EmbedBizTypeEnums.FUNCTION.getType()
                            , TEMP_ID, functionCalling.functionName()))
            );
            MemoryEmbeddingProvider.add(SecureUtil.md5(functionCalling.functionName()), textSegment);
        }

        log.info("AI 函数调用的向量初始化完毕");

        // 初始化MCP 调用列表
        List<AiMcpConfigEntity> mcpConfigEntityList = aiMcpConfigMapper.selectList(Wrappers.<AiMcpConfigEntity>lambdaQuery()
                .eq(AiMcpConfigEntity::getMcpEnabled, YesNoEnum.YES.getCode()));

        for (AiMcpConfigEntity mcpConfigEntity : mcpConfigEntityList) {
            TextSegment textSegment = TextSegment.textSegment(mcpConfigEntity.getName() + mcpConfigEntity.getDescription(),
                    Metadata.from(Map.of(EmbedBizTypeEnums.Fields.type, EmbedBizTypeEnums.CHAT2MCP.getType()
                            , TEMP_ID, mcpConfigEntity.getMcpId()))
            );
            MemoryEmbeddingProvider.add(SecureUtil.md5(mcpConfigEntity.getName()), textSegment);
        }

        log.info("AI MCP 调用的向量初始化完毕");

        List<AiDataEntity> aiDataEntityList = aiDataMapper.selectList(Wrappers.lambdaQuery());

        for (AiDataEntity aiDataEntity : aiDataEntityList) {
            TextSegment textSegment = TextSegment.textSegment(aiDataEntity.getDsName() + aiDataEntity.getDescription(),
                    Metadata.from(Map.of(EmbedBizTypeEnums.Fields.type, EmbedBizTypeEnums.CHAT2SQL.getType()
                            , TEMP_ID, aiDataEntity.getDataId()))
            );
            MemoryEmbeddingProvider.add(SecureUtil.md5(aiDataEntity.getDsName()), textSegment);
        }

        log.info("AI 数据调用的向量初始化完毕");


    }
}
