package cn.joywon.poco.knowledge.support.provider;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import dev.langchain4j.data.message.*;
import dev.langchain4j.memory.ChatMemory;
import dev.langchain4j.store.memory.chat.ChatMemoryStore;
import dev.langchain4j.store.memory.chat.InMemoryChatMemoryStore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Optional;

import static dev.langchain4j.internal.ValidationUtils.ensureGreaterThanZero;
import static dev.langchain4j.internal.ValidationUtils.ensureNotNull;

/**
 * @author poco
 * @date 2024/12/17
 * <p>
 * PIGX 消息的存储具体实现
 */
public class PocoMessageWindowChatMemoryImpl implements ChatMemory {

    private static final Logger log = LoggerFactory.getLogger(PocoMessageWindowChatMemoryImpl.class);

    private final Object id;

    private final Integer maxMessages;

    private final ChatMemoryStore store;

    private PocoMessageWindowChatMemoryImpl(PocoMessageWindowChatMemoryImpl.Builder builder) {
        this.id = ensureNotNull(builder.id, "id");
        this.maxMessages = ensureGreaterThanZero(builder.maxMessages, "maxMessages");
        this.store = ensureNotNull(builder.store, "store");
    }

    private static Optional<SystemMessage> findSystemMessage(List<ChatMessage> messages) {
        return messages.stream()
                .filter(message -> message instanceof SystemMessage)
                .map(message -> (SystemMessage) message)
                .findAny();
    }

    private static void ensureCapacity(List<ChatMessage> messages, int maxMessages) {
        while (messages.size() > maxMessages) {

            int messageToEvictIndex = 0;
            if (messages.get(0) instanceof SystemMessage) {
                messageToEvictIndex = 1;
            }

            ChatMessage evictedMessage = messages.remove(messageToEvictIndex);
            log.trace("Evicting the following message to comply with the capacity requirement: {}", evictedMessage);

            if (evictedMessage instanceof AiMessage && ((AiMessage) evictedMessage).hasToolExecutionRequests()) {
                while (messages.size() > messageToEvictIndex
                        && messages.get(messageToEvictIndex) instanceof ToolExecutionResultMessage) {
                    // Some LLMs (e.g. OpenAI) prohibit ToolExecutionResultMessage(s)
                    // without corresponding AiMessage,
                    // so we have to automatically evict orphan
                    // ToolExecutionResultMessage(s) if AiMessage was evicted
                    ChatMessage orphanToolExecutionResultMessage = messages.remove(messageToEvictIndex);
                    log.trace("Evicting orphan {}", orphanToolExecutionResultMessage);
                }
            }
        }
    }

    public static PocoMessageWindowChatMemoryImpl.Builder builder() {
        return new PocoMessageWindowChatMemoryImpl.Builder();
    }

    public static PocoMessageWindowChatMemoryImpl withMaxMessages(int maxMessages) {
        return builder().maxMessages(maxMessages).build();
    }

    @Override
    public Object id() {
        return id;
    }

    @Override
    public void add(ChatMessage message) {
        List<ChatMessage> messages = messages();
        if (message instanceof SystemMessage) {
            Optional<SystemMessage> systemMessage = findSystemMessage(messages);
            if (systemMessage.isPresent()) {
                if (systemMessage.get().equals(message)) {
                    return; // do not add the same system message
                } else {
                    messages.remove(systemMessage.get()); // need to replace existing
                    // system message
                }
            }
        }

        // 如果是 default ，则跳过
        if (id.toString().equals("default")) {
            store.deleteMessages(id);
            messages.add(message);
            store.updateMessages(id, messages);
            return;
        }

        messages.add(message);
        ensureCapacity(messages, maxMessages);
        store.updateMessages(id, messages);
    }

    @Override
    public List<ChatMessage> messages() {
        List<ChatMessage> messages = new ArrayList<>(store.getMessages(id));
        ensureCapacity(messages, maxMessages);
        // 如果多条消息中包含 ToolExecutionResultMessage ，并且最后一条消息不是 UserMessage ，则添加一条 UserMessage
        if (CollUtil.isNotEmpty(messages) && !(CollUtil.getFirst(messages) instanceof UserMessage)) {
            messages.add(0, UserMessage.from(StrUtil.NULL));
        }

        // 使用 Iterator 遍历并安全删除
        Iterator<ChatMessage> iterator = messages.iterator();
        while (iterator.hasNext()) {
            ChatMessage message = iterator.next();
            if (StrUtil.isBlank(message.text()) || StrUtil.isNullOrUndefined(message.text())) {
                iterator.remove(); // 使用 iterator.remove() 而不是 messages.remove()
            }
        }

        return messages;
    }

    @Override
    public void clear() {
        store.deleteMessages(id);
    }

    public static class Builder {

        private Object id = "default";

        private Integer maxMessages;

        private ChatMemoryStore store = new InMemoryChatMemoryStore();

        /**
         * @param id The ID of the {@link ChatMemory}. If not provided, a "default" will
         *           be used.
         * @return builder
         */
        public PocoMessageWindowChatMemoryImpl.Builder id(Object id) {
            this.id = id;
            return this;
        }

        /**
         * @param maxMessages The maximum number of messages to retain. If there isn't
         *                    enough space for a new message, the oldest one is evicted.
         * @return builder
         */
        public PocoMessageWindowChatMemoryImpl.Builder maxMessages(Integer maxMessages) {
            this.maxMessages = maxMessages;
            return this;
        }

        /**
         * @param store The chat memory store responsible for storing the chat memory
         *              state. If not provided, an {@link InMemoryChatMemoryStore} will be used.
         * @return builder
         */
        public PocoMessageWindowChatMemoryImpl.Builder chatMemoryStore(ChatMemoryStore store) {
            this.store = store;
            return this;
        }

        public PocoMessageWindowChatMemoryImpl build() {
            return new PocoMessageWindowChatMemoryImpl(this);
        }

    }

}
