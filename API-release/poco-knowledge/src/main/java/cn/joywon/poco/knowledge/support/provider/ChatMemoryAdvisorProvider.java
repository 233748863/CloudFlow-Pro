package cn.joywon.poco.knowledge.support.provider;

import cn.hutool.cache.Cache;
import cn.hutool.cache.CacheUtil;
import cn.joywon.poco.knowledge.config.properties.AiKnowledgeProperties;
import dev.langchain4j.memory.ChatMemory;
import dev.langchain4j.memory.chat.ChatMemoryProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Objects;

/**
 * Chat Memory Advisor 提供程序
 *
 * @author poco
 * @date 2024/09/26
 */
@Service
@RequiredArgsConstructor
public class ChatMemoryAdvisorProvider implements ChatMemoryProvider {

    /**
     * 聊天记忆 LRU 缓存
     */
    private final static Cache<String, ChatMemory> chatMemoryMap = CacheUtil.newLRUCache(1024 * 1000);

    private final AiKnowledgeProperties aiKnowledgeProperties;

    @Override
    public ChatMemory get(Object memoryId) {
        ChatMemory chatMemory = chatMemoryMap.get(memoryId.toString());

        if (Objects.isNull(chatMemory)) {
            chatMemory = PocoMessageWindowChatMemoryImpl
                    .builder().id(memoryId.toString())
                    .maxMessages(aiKnowledgeProperties.getChatHistoryWindowSize())
                    .build();
            chatMemoryMap.put(memoryId.toString(), chatMemory);
        }

        return chatMemory;
    }

}
