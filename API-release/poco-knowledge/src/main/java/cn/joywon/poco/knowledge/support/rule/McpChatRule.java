package cn.joywon.poco.knowledge.support.rule;

import cn.hutool.core.lang.Pair;
import cn.hutool.core.util.EnumUtil;
import cn.hutool.core.util.StrUtil;
import cn.joywon.poco.knowledge.config.properties.AiKnowledgeProperties;
import cn.joywon.poco.knowledge.dto.AiMessageResultDTO;
import cn.joywon.poco.knowledge.dto.ChatMessageDTO;
import cn.joywon.poco.knowledge.entity.AiMcpConfigEntity;
import cn.joywon.poco.knowledge.mapper.AiMcpConfigMapper;
import cn.joywon.poco.knowledge.service.AiNoMemoryStreamAssistantService;
import cn.joywon.poco.knowledge.service.AiStreamAssistantService;
import cn.joywon.poco.knowledge.support.constant.EmbedBizTypeEnums;
import cn.joywon.poco.knowledge.support.constant.McpDefaultCommandEnums;
import cn.joywon.poco.knowledge.support.provider.MemoryEmbeddingProvider;
import cn.joywon.poco.knowledge.support.provider.ModelProvider;
import cn.joywon.poco.knowledge.support.util.ChatMessageContextHolder;
import cn.joywon.poco.knowledge.support.util.PromptBuilder;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.mcp.McpToolProvider;
import dev.langchain4j.mcp.client.DefaultMcpClient;
import dev.langchain4j.mcp.client.McpClient;
import dev.langchain4j.mcp.client.logging.DefaultMcpLogMessageHandler;
import dev.langchain4j.mcp.client.transport.McpTransport;
import dev.langchain4j.mcp.client.transport.stdio.StdioMcpTransport;
import dev.langchain4j.model.chat.StreamingChatLanguageModel;
import dev.langchain4j.service.AiServices;
import dev.langchain4j.service.tool.ToolProvider;
import dev.langchain4j.store.embedding.EmbeddingSearchResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.jetbrains.annotations.Nullable;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;

import java.util.*;

import static cn.joywon.poco.knowledge.support.provider.MemoryEmbeddingProvider.TEMP_ID;
import static dev.langchain4j.store.embedding.filter.MetadataFilterBuilder.metadataKey;

/**
 * MCP 聊天规则
 *
 * @author poco
 * @date 2025/03/22
 */
@Slf4j
@Component("mcpChat")
@RequiredArgsConstructor
public class McpChatRule implements ChatRule {

    private final AiKnowledgeProperties knowledgeProperties;

    private final ModelProvider modelProvider;

    private final AiMcpConfigMapper mcpConfigMapper;

    /**
     * 基于向量自动匹配满足语义的， 智能选择
     *
     * @param chatMessageDTO 聊天消息 dto
     * @return {@link Flux }<{@link AiMessageResultDTO }>
     */
    @Nullable
    private static Flux<AiMessageResultDTO> autoChoice(ChatMessageDTO chatMessageDTO) {
        EmbeddingSearchResult<TextSegment> searchResult = MemoryEmbeddingProvider.search(chatMessageDTO.getContent()
                , metadataKey(EmbedBizTypeEnums.Fields.type).isEqualTo(EmbedBizTypeEnums.CHAT2MCP.getType()));

        if (searchResult.matches().isEmpty()) {
            return Flux.just(new AiMessageResultDTO("未找到相关 MCP 功能，请点击下方+按钮选择目标功能"));
        }

        Long mcpId = searchResult.matches().get(0).embedded().metadata().getLong(TEMP_ID);
        // 修改上下文中目标功能名称
        chatMessageDTO.getExtDetails().setMcpId(mcpId.toString());
        ChatMessageContextHolder.set(chatMessageDTO);
        return null;
    }

    /**
     * 处理聊天信息
     *
     * @param chatMessageDTO 聊天上文
     * @return flux stream
     */
    @Override
    public Flux<AiMessageResultDTO> process(ChatMessageDTO chatMessageDTO) {

        // 处理mcp，如果用户没有传递，则根据用户语义查询一个 mcp
        if (Objects.isNull(chatMessageDTO.getExtDetails()) || StrUtil.isBlank(chatMessageDTO.getExtDetails().getMcpId())) {
            Flux<AiMessageResultDTO> just = autoChoice(chatMessageDTO);
            if (just != null) return just;
        }

        AiMcpConfigEntity mcpConfigEntity = mcpConfigMapper.selectById(chatMessageDTO.getExtDetails().getMcpId());
        List<String> command = new ArrayList<>();
        command.add(mcpConfigEntity.getCommand());
        McpDefaultCommandEnums enums = EnumUtil.fromStringQuietly(McpDefaultCommandEnums.class, mcpConfigEntity.getCommand());
        if (Objects.nonNull(enums)) {
            command.add(enums.command);
        }

        if (StrUtil.isNotBlank(mcpConfigEntity.getParameters())) {
            List<String> paramsList = StrUtil.split(mcpConfigEntity.getParameters(), StrUtil.LF);
            command.addAll(paramsList);
        }


        Map<String, String> envMap = new HashMap<>();
        if (StrUtil.isNotBlank(mcpConfigEntity.getEnvironmentVariables())) {
            List<String> envList = StrUtil.split(mcpConfigEntity.getEnvironmentVariables(), StrUtil.LF);
            for (String env : envList) {
                List<String> envPair = StrUtil.split(env, "=");
                envMap.put(envPair.get(0), envPair.get(1));
            }
        }


        McpTransport transport = new StdioMcpTransport.Builder()
                .command(command)
                .environment(envMap)
                .logEvents(knowledgeProperties.isShowLog())
                .build();

        McpClient mcpClient = new DefaultMcpClient.Builder()
                .transport(transport)
                .logHandler(new DefaultMcpLogMessageHandler())
                .build();

        ToolProvider toolProvider = McpToolProvider.builder()
                .mcpClients(List.of(mcpClient))
                .build();

        Pair<StreamingChatLanguageModel, AiStreamAssistantService> servicePair = modelProvider.getAiStreamAssistant(chatMessageDTO.getModelName());
        AiNoMemoryStreamAssistantService assistant = AiServices.builder(AiNoMemoryStreamAssistantService.class)
                .streamingChatLanguageModel(servicePair.getKey())
                .toolProvider(toolProvider)
                .build();

        return assistant.chat(PromptBuilder.render("mcp.st", Map.of(
                "mcpName", mcpConfigEntity.getName(),
                "inputMessage", chatMessageDTO.getContent()
        ))).map(AiMessageResultDTO::new);
    }
}
