package cn.joywon.poco.knowledge.support.rule;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.date.DateUtil;
import cn.hutool.core.io.IoUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.crypto.SecureUtil;
import cn.joywon.poco.admin.api.feign.RemoteFileService;
import cn.joywon.poco.knowledge.dto.AiMessageResultDTO;
import cn.joywon.poco.knowledge.dto.ChatMessageDTO;
import cn.joywon.poco.knowledge.service.AiStreamAssistantService;
import cn.joywon.poco.knowledge.support.constant.EmbedBizTypeEnums;
import cn.joywon.poco.knowledge.support.provider.MemoryEmbeddingProvider;
import cn.joywon.poco.knowledge.support.provider.ModelProvider;
import cn.joywon.poco.knowledge.support.util.PromptBuilder;
import dev.langchain4j.data.message.Content;
import dev.langchain4j.data.message.ImageContent;
import dev.langchain4j.data.message.TextContent;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.model.chat.StreamingChatLanguageModel;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.chat.response.StreamingChatResponseHandler;
import dev.langchain4j.store.embedding.EmbeddingSearchResult;
import feign.Response;
import lombok.Cleanup;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import org.jetbrains.annotations.NotNull;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;

import java.io.IOException;
import java.io.InputStream;
import java.util.*;

import static cn.joywon.poco.knowledge.support.constant.AiPromptField.systemTime;
import static cn.joywon.poco.knowledge.support.provider.MemoryEmbeddingProvider.TEMP_ID;
import static dev.langchain4j.store.embedding.filter.MetadataFilterBuilder.metadataKey;

/**
 * 简单上下文聊天
 *
 * @author poco
 * @date 2024/3/26
 */
@Slf4j
@Component("simpleChat")
@RequiredArgsConstructor
public class SimpleChatRule implements ChatRule {

    private final RemoteFileService remoteFileService;

    private final ModelProvider modelProvider;

    @SneakyThrows
    public Flux<AiMessageResultDTO> process(ChatMessageDTO chatMessageDTO) {
        // 如果图片不为空
        if (Objects.nonNull(chatMessageDTO.getExtDetails()) && CollUtil.isNotEmpty(chatMessageDTO.getExtDetails().getImages())) {
            return chat2Image(chatMessageDTO);
        }

        // 如果office不为空
        if (Objects.nonNull(chatMessageDTO.getExtDetails()) && CollUtil.isNotEmpty(chatMessageDTO.getExtDetails().getFiles())) {
            return chat2File(chatMessageDTO);
        }

        AiStreamAssistantService streamAssistantService = modelProvider
                .getAiStreamAssistant(chatMessageDTO.getModelName())
                .getValue();

        Flux<String> chatResponseFlux = streamAssistantService.chat(chatMessageDTO.getConversationId(),
                PromptBuilder.render("base-simple-system.st"),
                chatMessageDTO.getContent());

        // 转成 AiMessageResultDTO
        return chatResponseFlux.map(AiMessageResultDTO::new);

    }

    /**
     * 文件聊天
     *
     * @param chatMessageDTO 聊天消息 dto
     * @return {@link Flux }<{@link AiMessageResultDTO }>
     */
    private Flux<AiMessageResultDTO> chat2File(ChatMessageDTO chatMessageDTO) {
        List<ChatMessageDTO.FileDTO> files = chatMessageDTO.getExtDetails().getFiles();

        EmbeddingSearchResult<TextSegment> searchResult = MemoryEmbeddingProvider
                .search(chatMessageDTO.getContent()
                        , metadataKey(TEMP_ID).isEqualTo(SecureUtil.md5(files.get(0).getName()))
                        , metadataKey(EmbedBizTypeEnums.Fields.type).isEqualTo(EmbedBizTypeEnums.CHAT2FILE.getType())
                );

        if (searchResult.matches().isEmpty()) {
            return Flux.just(new AiMessageResultDTO("未找到相关的答案"));
        }

        // 对结果进行总结
        AiStreamAssistantService streamAssistantService = modelProvider
                .getAiStreamAssistant(chatMessageDTO.getModelName())
                .getValue();


        List<String> stringList = searchResult.matches().stream().map(segmentEmbeddingMatch -> segmentEmbeddingMatch.embedded().text()).toList();
        return streamAssistantService.chat(chatMessageDTO.getConversationId(),
                PromptBuilder.render("knowledge-system.st"),
                PromptBuilder.render("knowledge-user.st",
                        Map.of("contents", CollUtil.join(stringList, StrUtil.CRLF),
                                "userMessage", chatMessageDTO.getContent(),
                                "emptyDesc", "未找到相关的答案",
                                systemTime, DateUtil.now()))).map(AiMessageResultDTO::new);
    }

    /**
     * 图片聊天
     *
     * @param chatMessageDTO 聊天消息 dto
     * @return {@link Flux }<{@link AiMessageResultDTO }>
     * @throws IOException io异常
     */
    @NotNull
    private Flux<AiMessageResultDTO> chat2Image(ChatMessageDTO chatMessageDTO) throws IOException {
        StreamingChatLanguageModel visionModel = modelProvider.getAiVisionStreamAssistant().getKey();

        List<Content> contentList = new ArrayList<>();
        contentList.add(TextContent.from(chatMessageDTO.getContent()));
        for (ChatMessageDTO.FileDTO image : chatMessageDTO.getExtDetails().getImages()) {
            @Cleanup Response response = remoteFileService.getFile(image.getName());
            @Cleanup InputStream inputStream = response.body().asInputStream();
            String encodeToString = Base64.getEncoder().encodeToString(IoUtil.readBytes(inputStream));
            contentList.add(ImageContent.from(encodeToString, MediaType.IMAGE_PNG_VALUE));
        }


        return Flux.create(sink -> {

            visionModel.chat(ChatRequest.builder().messages(UserMessage.from(contentList)).build(), new StreamingChatResponseHandler() {
                @Override
                public void onPartialResponse(String partialResponse) {
                    sink.next(new AiMessageResultDTO(partialResponse));
                }

                @Override
                public void onCompleteResponse(ChatResponse completeResponse) {
                    sink.complete();

                }

                @Override
                public void onError(Throwable error) {
                    sink.error(error);

                }
            });
        });
    }

}
