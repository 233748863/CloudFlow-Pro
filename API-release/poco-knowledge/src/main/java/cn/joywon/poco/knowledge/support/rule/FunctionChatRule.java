package cn.joywon.poco.knowledge.support.rule;

import cn.hutool.core.util.StrUtil;
import cn.joywon.poco.knowledge.dto.AiMessageResultDTO;
import cn.joywon.poco.knowledge.dto.ChatMessageDTO;
import cn.joywon.poco.knowledge.service.AiFunctionAssistantService;
import cn.joywon.poco.knowledge.support.constant.EmbedBizTypeEnums;
import cn.joywon.poco.knowledge.support.provider.MemoryEmbeddingProvider;
import cn.joywon.poco.knowledge.support.provider.ModelProvider;
import cn.joywon.poco.knowledge.support.util.ChatMessageContextHolder;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.store.embedding.EmbeddingSearchResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.jetbrains.annotations.Nullable;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;

import java.util.Objects;

import static cn.joywon.poco.knowledge.support.provider.MemoryEmbeddingProvider.TEMP_ID;
import static dev.langchain4j.store.embedding.filter.MetadataFilterBuilder.metadataKey;

/**
 * 基于函数数据的聊天
 *
 * @author poco
 * @date 2024/3/26
 */
@Slf4j
@Component("functionChat")
@RequiredArgsConstructor
public class FunctionChatRule implements ChatRule {

    private final ModelProvider modelProvider;


    /**
     * 处理聊天信息
     *
     * @param chatMessageDTO 聊天上文
     * @return flux stream
     */
    @Override
    public Flux<AiMessageResultDTO> process(ChatMessageDTO chatMessageDTO) {
        AiFunctionAssistantService aiFunctionAssistant = modelProvider
                .getAiFunctionAssistant(chatMessageDTO.getModelName())
                .getValue();

        // 处理function，如果用户没有传递，则根据用户语义查询一个 function
        if (Objects.isNull(chatMessageDTO.getExtDetails())
                || StrUtil.isBlank(chatMessageDTO.getExtDetails().getFuncName())) {
            Flux<AiMessageResultDTO> just = autoChoice(chatMessageDTO);
            if (just != null) return just;
        }

        return aiFunctionAssistant.chatFlux(chatMessageDTO.getConversationId(), chatMessageDTO.getContent()).map(AiMessageResultDTO::new);
    }

    /**
     * 基于向量自动匹配满足语义的， 智能选择
     *
     * @param chatMessageDTO 聊天消息 dto
     * @return {@link Flux }<{@link AiMessageResultDTO }>
     */
    @Nullable
    private static Flux<AiMessageResultDTO> autoChoice(ChatMessageDTO chatMessageDTO) {
        EmbeddingSearchResult<TextSegment> searchResult = MemoryEmbeddingProvider.search(chatMessageDTO.getContent()
                , metadataKey(EmbedBizTypeEnums.Fields.type).isEqualTo(EmbedBizTypeEnums.FUNCTION.getType()));

        if (searchResult.matches().isEmpty()) {
            return Flux.just(new AiMessageResultDTO("未找到相关功能，请点击下方+按钮选择目标功能"));
        }

        String functionName = searchResult.matches().get(0).embedded().metadata().getString(TEMP_ID);
        // 修改上下文中目标功能名称
        chatMessageDTO.getExtDetails().setFuncName(functionName);
        ChatMessageContextHolder.set(chatMessageDTO);
        return null;
    }
}
