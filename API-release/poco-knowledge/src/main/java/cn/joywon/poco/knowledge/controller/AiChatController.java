package cn.joywon.poco.knowledge.controller;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.security.annotation.Inner;
import cn.joywon.poco.knowledge.dto.AiGenerateDTO;
import cn.joywon.poco.knowledge.dto.AiMessageResultDTO;
import cn.joywon.poco.knowledge.dto.ChatMessageDTO;
import cn.joywon.poco.knowledge.service.AiChartGenerateService;
import cn.joywon.poco.knowledge.service.AiGenerateService;
import cn.joywon.poco.knowledge.service.ChatService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;

import java.io.IOException;

import static cn.joywon.poco.knowledge.support.constant.AiChatConstants.END_MSG;

/**
 * @author poco
 * @date 2024/3/15
 */
@Slf4j
@RestController
@RequestMapping("/chat")
@RequiredArgsConstructor
public class AiChatController {

    /**
     * The ChatService instance used to handle chat-related operations.
     */
    private final ChatService chatService;

    private final AiGenerateService generateService;

    private final AiChartGenerateService chartGenerateService;

    /**
     * 创建对外连接
     *
     * @param chatMessageDTO 消息内容体
     * @return R<uuid>
     */
    @Inner(value = false)
    @PostMapping("/create")
    public R<String> createPublicConnection(@Valid @RequestBody ChatMessageDTO chatMessageDTO) {
        return chatService.saveConnectionParams(chatMessageDTO);
    }

    /**
     * 实际创建sse链接调用大模型的入口 依赖于上文的createConnection ，所以即使此接口设置暴露，没有message key也无法调用。
     *
     * @param key message key
     * @return Flux<AiMessageResultDTO>
     */
    @Inner(value = false)
    @GetMapping(value = "/msg/list", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<AiMessageResultDTO> msg(@RequestParam Long key) {
        try {
            return chatService.chatList(key);
        } catch (Exception e) {
            log.error("chat error", e);
            return Flux.just(new AiMessageResultDTO(e.getMessage())).concatWithValues(new AiMessageResultDTO(END_MSG));
        }
    }


    /**
     * 删除会话
     *
     * @param id 会话ID
     * @return R
     */
    @Inner(value = false)
    @DeleteMapping("/conversation/{id}")
    public R deleteConversation(@PathVariable String id) {
        return R.ok(chatService.clearMemory(id));
    }

    /**
     * 生成文本
     *
     * @param generateDTO 消息内容体
     * @return R<String>
     */
    @PostMapping("/generate/text")
    public R<String> generateText(@RequestBody AiGenerateDTO generateDTO) {
        return R.ok(generateService.generateText(generateDTO));
    }

    /**
     * 通过音频生成文本
     *
     * @param fileData 文件数据
     * @return {@link R }<{@link String }>
     */
    @PostMapping("/audio")
    @SneakyThrows
    public R<String> generateTextByAudio(@RequestBody byte[] fileData) {
        return R.ok(generateService.generateTextByAudio(fileData));
    }

    /**
     * 通过文本生成音频
     *
     * @param generateDTO 生成 DTO
     * @return {@link R }<{@link String }>
     * @throws IOException io异常
     */
    @PostMapping("/generate/tts")
    public R<String> generateAudioByText(@RequestBody AiGenerateDTO generateDTO) throws IOException {
        return R.ok(generateService.generateAudioByText(generateDTO.getPrompt()));
    }

    /**
     * 获取图表
     *
     * @param chartId 图表id
     * @return {@link R }<{@link String }>
     */
    @GetMapping("/generate/chart/{chartId}")
    public R<String> getChart(@PathVariable String chartId) {
        return R.ok(chartGenerateService.getChart(chartId));
    }
}
