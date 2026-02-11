package cn.joywon.poco.knowledge.support.function;

import cn.hutool.core.date.DateUtil;
import cn.hutool.core.util.ReflectUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.extra.spring.SpringUtil;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.data.tenant.TenantContextHolder;
import cn.joywon.poco.common.security.component.PocoCustomOpaqueTokenIntrospector;
import cn.joywon.poco.common.security.service.PocoUser;
import cn.joywon.poco.common.security.util.NonWebTokenContextHolder;
import cn.joywon.poco.knowledge.dto.BaseAiRequest;
import cn.joywon.poco.knowledge.dto.ChatMessageDTO;
import cn.joywon.poco.knowledge.entity.AiChatRecordEntity;
import cn.joywon.poco.knowledge.mapper.AiChatRecordMapper;
import cn.joywon.poco.knowledge.support.util.ChatMessageContextHolder;
import cn.joywon.poco.knowledge.support.util.PromptBuilder;
import cn.joywon.poco.knowledge.support.util.ToolSpecificationsUtils;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.agent.tool.ToolSpecification;
import dev.langchain4j.service.tool.ToolExecutor;

import java.lang.reflect.Field;
import java.lang.reflect.ParameterizedType;
import java.util.Map;
import java.util.Objects;

import static cn.joywon.poco.knowledge.support.constant.AiPromptField.systemTime;

/**
 * 函数调用
 *
 * @author poco
 * @date 2024/3/29
 */
public interface FunctionCalling<T extends BaseAiRequest> extends ToolExecutor {

    /**
     * 展示
     *
     * @return boolean
     */
    default boolean showFunction() {
        return true;
    }

    /**
     * 显示名称
     *
     * @return {@link String }
     */
    default String showInfo() {
        return this.functionName();
    }

    /**
     * 函数名称
     *
     * @return String
     */
    default String functionName() {
        return this.getClass().getSimpleName();
    }

    /**
     * 路由路径
     *
     * @return {@link String }
     */
    default String routePath() {
        return "";
    }

    /**
     * 函数描述
     * <p>
     * 默认回调 请求用户、请求时间、请求租户
     *
     * @return String
     */
    default String functionDesc() {
        String functionDesc = PromptBuilder.render(String.format("%s.st", this.functionName()),
                Map.of("tenantId", Objects.nonNull(TenantContextHolder.getTenantId()) ? TenantContextHolder.getTenantId() : StrUtil.EMPTY,
                        "systemTime", DateUtil.now()));
        String metadata = PromptBuilder.render("knowledge-func-metadata.st", Map.of(BaseAiRequest.Fields.messageKey,
                Objects.nonNull(ChatMessageContextHolder.get()) ? ChatMessageContextHolder.get().getMessageKey() : StrUtil.EMPTY, systemTime, DateUtil.now()));
        return functionDesc + metadata;
    }

    /**
     * 构建 function calling
     *
     * @return {@link ToolSpecification }
     */
    default ToolSpecification buildToolSpecification() {
        ToolSpecification.Builder builder = ToolSpecification.builder();
        builder.name(this.functionName());
        builder.description(this.functionDesc());

        Field[] fields = ReflectUtil.getFields(getGenericType());
        builder.parameters(ToolSpecificationsUtils.parametersFrom(fields));
        return builder.build();
    }

    /**
     * 大模型回调执行入口
     *
     * @param toolExecutionRequest 工具执行请求
     * @param memoryId             内存 ID
     * @return {@link String }
     */
    @Override
    default String execute(ToolExecutionRequest toolExecutionRequest, Object memoryId) {
        R<String> result = preHandle(JSONUtil.toBean(toolExecutionRequest.arguments(), getGenericType()));
        return StrUtil.isBlank(result.getData()) ? result.getMsg() : result.getData();
    }

    /**
     * 大模型回调执行入口
     *
     * @param toolExecutionRequest 工具执行请求
     * @return {@link String }
     */
    default R execute(ToolExecutionRequest toolExecutionRequest) {
        return preHandle(JSONUtil.toBean(toolExecutionRequest.arguments(), getGenericType()));
    }

    /**
     * 检查参数是否正确
     *
     * @param t           请求信息
     * @param userDetails 用户信息
     * @param extDetails
     * @return
     */
    R checkParams(T t, PocoUser userDetails, ChatMessageDTO.ExtDetails extDetails);

    default Class<T> getGenericType() {
        return (Class<T>) ((ParameterizedType) getClass().getGenericInterfaces()[0]).getActualTypeArguments()[0];
    }

    /**
     * 预处理
     *
     * @param t 请求参数
     * @return R 错误信息
     */
    default R preHandle(T t) {
        if (Objects.isNull(t.getMessageKey())) {
            return R.failed("创建失败，系统内部错误");
        }

        AiChatRecordMapper chatRecordMapper = SpringUtil.getBean(AiChatRecordMapper.class);
        AiChatRecordEntity chatRecordEntity = chatRecordMapper.selectById(t.getMessageKey());

        if (Objects.isNull(chatRecordEntity) || StrUtil.isBlank(chatRecordEntity.getExtDetails())) {
            return R.failed("创建失败，系统内部错误");
        }

        ChatMessageDTO.ExtDetails extDetails = JSONUtil.toBean(chatRecordEntity.getExtDetails(),
                ChatMessageDTO.ExtDetails.class);

        ChatMessageDTO chatMessageDTO = new ChatMessageDTO();
        chatMessageDTO.setContent(chatRecordEntity.getQuestionText());
        chatMessageDTO.setExtDetails(extDetails);
        chatMessageDTO.setConversationId(chatRecordEntity.getConversationId());
        ChatMessageContextHolder.set(chatMessageDTO);

        String accessToken = extDetails.getAccessToken();
        Long tenantId = extDetails.getTenantId();

        // 获取上下文的用户、租户
        TenantContextHolder.setTenantId(tenantId);
        PocoCustomOpaqueTokenIntrospector opaqueTokenIntrospector = SpringUtil
                .getBean(PocoCustomOpaqueTokenIntrospector.class);
        NonWebTokenContextHolder.setToken(accessToken);

        try {
            PocoUser userDetails = (PocoUser) opaqueTokenIntrospector.introspect(accessToken);

            R result = checkParams(t, userDetails, extDetails);
            // 没有校验失败返回 R error
            if (!result.isOk()) {
                return result;
            }
            return handle(t, userDetails, extDetails);
        } catch (Exception e) {
            return R.failed("创建失败，请重试 {}", e.getMessage());
        } finally {
            NonWebTokenContextHolder.clear();
            TenantContextHolder.clear();
        }
    }

    /**
     * 业务处理逻辑
     *
     * @param t           t
     * @param userDetails 用户详细信息
     * @param extDetails  ext 详细信息
     * @return {@link R }<{@link String }>
     */
    R<String> handle(T t, PocoUser userDetails, ChatMessageDTO.ExtDetails extDetails);

}
