package cn.joywon.poco.knowledge.service.impl;

import cn.hutool.core.util.StrUtil;
import cn.hutool.crypto.SecureUtil;
import cn.hutool.extra.servlet.JakartaServletUtil;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.common.core.constant.enums.YesNoEnum;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.core.util.WebUtils;
import cn.joywon.poco.common.data.tenant.TenantContextHolder;
import cn.joywon.poco.common.security.util.SecurityUtils;
import cn.joywon.poco.knowledge.config.properties.AiKnowledgeProperties;
import cn.joywon.poco.knowledge.dto.AiMessageResultDTO;
import cn.joywon.poco.knowledge.dto.ChatMessageContext;
import cn.joywon.poco.knowledge.dto.ChatMessageDTO;
import cn.joywon.poco.knowledge.entity.AiChatRecordEntity;
import cn.joywon.poco.knowledge.entity.AiDatasetEntity;
import cn.joywon.poco.knowledge.mapper.AiChatRecordMapper;
import cn.joywon.poco.knowledge.mapper.AiDatasetMapper;
import cn.joywon.poco.knowledge.service.ChatService;
import cn.joywon.poco.knowledge.support.constant.ChatTypeEnums;
import cn.joywon.poco.knowledge.support.constant.LLMUseStatusEnums;
import cn.joywon.poco.knowledge.support.rule.ChatRule;
import cn.joywon.poco.knowledge.support.util.ChatMessageContextHolder;
import com.yomahub.liteflow.core.FlowExecutor;
import com.yomahub.liteflow.flow.LiteflowResponse;
import dev.langchain4j.memory.ChatMemory;
import dev.langchain4j.memory.chat.ChatMemoryProvider;
import lombok.RequiredArgsConstructor;
import org.jetbrains.annotations.Nullable;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;

import java.util.Map;
import java.util.Objects;
import java.util.Optional;

import static cn.joywon.poco.knowledge.support.constant.AiChatConstants.END_MSG;

/**
 * chat 实现
 *
 * @author poco
 * @date 2024/3/20
 */
@Service
@RequiredArgsConstructor
public class AiChatServiceImpl implements ChatService {

    public static final String CHAT_CHAIN_ID = "chat";

    private final Optional<FlowExecutor> flowExecutorOptional;

    private final Map<String, ChatRule> chatRuleMap;

    private final AiDatasetMapper datasetMapper;

    private final AiChatRecordMapper recordMapper;

    private final ChatMemoryProvider chatMemoryProvider;

    private final AiKnowledgeProperties aiKnowledgeProperties;

    /**
     * 保持链接信息
     *
     * @param chatMessageDTO 消息内容体
     * @return uuid
     */
    @Override
    public R saveConnectionParams(ChatMessageDTO chatMessageDTO) {
        AiChatRecordEntity recordEntity = new AiChatRecordEntity();
        recordEntity.setQuestionText(chatMessageDTO.getContent());
        recordEntity.setConversationId(chatMessageDTO.getConversationId());
        recordEntity.setDatasetId(chatMessageDTO.getDatasetId());
        recordEntity.setLlmFlag(LLMUseStatusEnums.UNUSE.getStatus());
        recordEntity.setInnerFlag(YesNoEnum.NO.getCode());
        recordEntity.setStandardFlag(YesNoEnum.NO.getCode());
        recordEntity.setSuitability(YesNoEnum.NO.getCode());
        recordEntity.setModelName(chatMessageDTO.getModelName());
        if (Objects.nonNull(chatMessageDTO.getExtDetails())) {
            ChatMessageDTO.ExtDetails extDetails = chatMessageDTO.getExtDetails();
            extDetails.setAccessToken(SecurityUtils.getToken());
            extDetails.setTenantId(TenantContextHolder.getTenantId());
            recordEntity.setExtDetails(JSONUtil.toJsonPrettyStr(extDetails));
        }

        if (Objects.nonNull(SecurityUtils.getUser())) {
            chatMessageDTO.setInner(true);
            recordEntity.setInnerFlag(YesNoEnum.YES.getCode());
            recordEntity.setUsername(SecurityUtils.getUser().getUsername());
        } else {
            recordEntity.setIp(JakartaServletUtil.getClientIP(WebUtils.getRequest()));
            recordEntity.setUserAgent(WebUtils.getRequest().getHeader(HttpHeaders.USER_AGENT));
            // 如果是外部调用基于 IP + USER-AGENT 生成唯一标识
            recordEntity.setUsername(SecureUtil.md5(recordEntity.getIp() + recordEntity.getUserAgent()));
        }

        // 设置是否开启了 websearch
        recordEntity.setWebsearchFlag(YesNoEnum.getCode(chatMessageDTO.isWebsearch()));
        recordMapper.insert(recordEntity);

        // 内部调用直接存储
        if (chatMessageDTO.isInner()) {
            return R.ok(recordEntity.getRecordId());
        }

        // 安全校验 ,如果知识库设置为公开，校验密码不为空
        AiDatasetEntity aiDatasetEntity = datasetMapper.selectById(chatMessageDTO.getDatasetId());
        if (Objects.isNull(aiDatasetEntity)) {
            return R.ok(recordEntity.getRecordId());
        }

        if (YesNoEnum.YES.getCode().equals(aiDatasetEntity.getPublicFlag())
                && StrUtil.isNotBlank(aiDatasetEntity.getPublicPassword())) {
            if (!aiDatasetEntity.getPublicPassword().equals(chatMessageDTO.getAccessKey())) {
                return R.failed("此知识库为私有知识库，请先输入【访问密码】");
            }
        }

        return R.ok(recordEntity.getRecordId());
    }

    /**
     * 清除记忆内存
     *
     * @param id 身份证
     * @return boolean
     */
    @Override
    public boolean clearMemory(String id) {
        ChatMemory chatMemory = chatMemoryProvider.get(id);
        if (Objects.nonNull(chatMemory)) {
            chatMemory.clear();
            return true;
        }
        return false;
    }

    /**
     * 调用规则引擎处理消息，并返回结果
     *
     * @param key 信息key
     * @return String
     */
    @Override
    public Flux<AiMessageResultDTO> chatList(Long key) {
        AiChatRecordEntity recordEntity = recordMapper.selectById(key);
        if (Objects.isNull(recordEntity)) {
            return Flux.just(new AiMessageResultDTO("链接已失效"), new AiMessageResultDTO(END_MSG));
        }

        ChatMessageDTO chatMessageDTO = new ChatMessageDTO();
        chatMessageDTO.setMessageKey(key);
        chatMessageDTO.setModelName(recordEntity.getModelName());
        chatMessageDTO.setContent(recordEntity.getQuestionText());
        chatMessageDTO.setConversationId(recordEntity.getConversationId());
        chatMessageDTO.setDatasetId(recordEntity.getDatasetId());
        chatMessageDTO.setWebsearch(YesNoEnum.YES.getCode().equals(recordEntity.getWebsearchFlag()));
        chatMessageDTO.setInner(YesNoEnum.YES.getCode().equals(recordEntity.getInnerFlag()));
        if (Objects.nonNull(recordEntity.getExtDetails())) {
            ChatMessageDTO.ExtDetails extDetails = JSONUtil.toBean(recordEntity.getExtDetails(),
                    ChatMessageDTO.ExtDetails.class);
            chatMessageDTO.setExtDetails(extDetails);
        }

        // 如果开启了规则引擎
        if (flowExecutorOptional.isPresent()) {
            Flux<AiMessageResultDTO> aiMessageResultDTO = flowRisk(chatMessageDTO);
            if (aiMessageResultDTO != null)
                return aiMessageResultDTO.concatWithValues(new AiMessageResultDTO(END_MSG));
        }

        ChatTypeEnums chatTypeEnums = ChatTypeEnums.fromCode(chatMessageDTO.getDatasetId());
        ChatMessageContextHolder.set(chatMessageDTO);
        return chatRuleMap.get(chatTypeEnums.getType()).process(chatMessageDTO).concatWithValues(new AiMessageResultDTO(END_MSG));
    }

    /**
     * @param chatMessageDTO 消息内容体
     * @return Flux<AiMessageResultDTO>
     */
    private @Nullable Flux<AiMessageResultDTO> flowRisk(ChatMessageDTO chatMessageDTO) {
        AiDatasetEntity aiDatasetEntity = datasetMapper.selectById(chatMessageDTO.getDatasetId());
        ChatMessageContext content = new ChatMessageContext();
        content.setChatMessageDTO(chatMessageDTO);
        content.setAiDataset(aiDatasetEntity);
        content.setIp(JakartaServletUtil.getClientIP(WebUtils.getRequest()));

        if (Objects.nonNull(SecurityUtils.getUser())) {
            content.setUsername(SecurityUtils.getUser().getUsername());
            content.setUserId(SecurityUtils.getUser().getId());
        }

        LiteflowResponse response = flowExecutorOptional.get().execute2Resp(CHAT_CHAIN_ID, null, content);
        ChatMessageContext result = response.getContextBean(ChatMessageContext.class);
        if (Objects.isNull(result.getMessageResultDTO())) {
            AiMessageResultDTO aiMessageResultDTO = new AiMessageResultDTO();
            if (StrUtil.isNotBlank(result.getErrorMessage())) {
                aiMessageResultDTO.setMessage(result.getErrorMessage());
                return Flux.just(aiMessageResultDTO);
            }
        }
        return null;
    }

}
