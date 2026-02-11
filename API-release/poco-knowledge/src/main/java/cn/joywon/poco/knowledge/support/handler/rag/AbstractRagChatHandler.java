package cn.joywon.poco.knowledge.support.handler.rag;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.date.DateUtil;
import cn.hutool.core.util.StrUtil;
import cn.joywon.poco.knowledge.dto.AiMessageResultDTO;
import cn.joywon.poco.knowledge.dto.ChatMessageDTO;
import cn.joywon.poco.knowledge.entity.AiDatasetEntity;
import cn.joywon.poco.knowledge.service.AiStreamAssistantService;
import cn.joywon.poco.knowledge.support.provider.ModelProvider;
import cn.joywon.poco.knowledge.support.rule.ChatRule;
import cn.joywon.poco.knowledge.support.util.PromptBuilder;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Flux;

import java.util.List;
import java.util.Map;

import static cn.joywon.poco.knowledge.support.constant.AiPromptField.systemTime;

/**
 * @author poco
 * @date 2024/7/4
 */
@Slf4j
@RequiredArgsConstructor
public abstract class AbstractRagChatHandler implements RagChatHandler, ChatRule {

    private final ModelProvider modelProvider;


    /**
     * 结果总结输出
     *
     * @param dataset        数据
     * @param chatMessageDTO 聊天消息 DTO
     * @param resultList     结果列表
     * @return {@link Flux }<{@link AiMessageResultDTO }>
     */
    public Flux<AiMessageResultDTO> summaryResult(AiDatasetEntity dataset, ChatMessageDTO chatMessageDTO,
                                                  List<String> resultList) {
        // 对结果进行总结
        AiStreamAssistantService streamAssistantService = modelProvider
                .getAiStreamAssistant(chatMessageDTO.getModelName())
                .getValue();
        Flux<String> summaryResult = streamAssistantService.chat(chatMessageDTO.getConversationId(),
                PromptBuilder.render("knowledge-system.st"),
                PromptBuilder.render("knowledge-user.st",
                        Map.of("contents", CollUtil.join(resultList, StrUtil.CRLF),
                                "userMessage", chatMessageDTO.getContent(),
                                "emptyDesc", dataset.getEmptyDesc(),
                                systemTime, DateUtil.now())));
        return summaryResult.map(AiMessageResultDTO::new);
    }

}
