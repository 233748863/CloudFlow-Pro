package cn.joywon.poco.knowledge.service;

import cn.joywon.poco.knowledge.dto.AiSuggestionFieldResultDTO;
import dev.langchain4j.service.MemoryId;
import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import dev.langchain4j.service.V;

/**
 * AI Assistant 服务
 *
 * @author poco
 * @date 2024/09/27
 */
public interface AiAssistantService {

    /**
     * 聊天
     *
     * @param memoryId    内存 ID
     * @param userMessage 用户留言
     * @return {@link String }
     */
    String chat(@MemoryId String memoryId, @UserMessage String userMessage);

    /**
     * 聊天
     *
     * @param userMessage 用户消息
     * @return {@link String }
     */
    String chat(@UserMessage String userMessage);


    /**
     * 评估表字段
     *
     * @param text 发短信
     * @return {@link AiSuggestionFieldResultDTO }
     */
    @SystemMessage("""
            你是一位MySQL字段注释生成专家，能够根据数据库的字段名称、数据类型和已有注释，生成简洁明了且具有描述性的字段注释
            """)
    @UserMessage("提取关于数据库字段的信息 {{text}}")
    AiSuggestionFieldResultDTO assessTableField(@V("text") String text);

}
