package cn.joywon.poco.knowledge.support.provider;

import cn.hutool.core.date.DateUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.crypto.SecureUtil;
import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import cn.joywon.poco.knowledge.dto.BaseAiRequest;
import cn.joywon.poco.knowledge.dto.ChatMessageDTO;
import cn.joywon.poco.knowledge.dto.FunctionFieldDTO;
import cn.joywon.poco.knowledge.entity.AiFuncEntity;
import cn.joywon.poco.knowledge.mapper.AiFuncMapper;
import cn.joywon.poco.knowledge.support.function.FunctionCalling;
import cn.joywon.poco.knowledge.support.util.ChatMessageContextHolder;
import cn.joywon.poco.knowledge.support.util.PromptBuilder;
import cn.joywon.poco.knowledge.support.util.ToolSpecificationsUtils;
import dev.langchain4j.agent.tool.Tool;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.agent.tool.ToolSpecification;
import dev.langchain4j.service.tool.ToolExecutor;
import dev.langchain4j.service.tool.ToolProvider;
import dev.langchain4j.service.tool.ToolProviderRequest;
import dev.langchain4j.service.tool.ToolProviderResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.prompt.PromptTemplate;
import org.springframework.stereotype.Service;
import org.ssssssss.magicapi.core.model.MagicEntity;
import org.ssssssss.magicapi.core.service.MagicAPIService;
import org.ssssssss.magicapi.core.service.MagicResourceService;

import java.util.*;

import static cn.joywon.poco.knowledge.support.constant.AiPromptField.systemTime;

/**
 * 动态工具指定
 *
 * @author poco
 * @date 2024/9/27
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DynamicToolProvider implements ToolProvider {

    private final List<FunctionCalling> functionCallingList;

    private final MagicResourceService magicResourceService;

    private final MagicAPIService magicAPIService;

    private final AiFuncMapper aiFuncMapper;

    /**
     * 构建 func 参数
     *
     * @param aiFuncEntity AI func 实体
     * @param builder      builder
     */
    private static void buildFuncParams(AiFuncEntity aiFuncEntity, ToolSpecification.Builder builder) {
        List<FunctionFieldDTO> functionFieldDTOS = JSONUtil.toList(aiFuncEntity.getColumnInfo(),
                FunctionFieldDTO.class);

        builder.parameters(ToolSpecificationsUtils.parametersFrom(functionFieldDTOS));
    }

    /**
     * 提供工具
     *
     * @param request 请求
     * @return {@link ToolProviderResult }
     */
    @Override
    @Tool
    public ToolProviderResult provideTools(ToolProviderRequest request) {
        ChatMessageDTO chatMessageDTO = ChatMessageContextHolder.get();
        // 判断是否包含函数名称
        Optional<FunctionCalling> optionalFunctionCalling = functionCallingList.stream()
                .filter(functionCalling -> StrUtil.equals(chatMessageDTO.getExtDetails().getFuncName(),
                        functionCalling.functionName()))
                .findFirst();

        // 如果为空的时候，再次查询 aifunc 表
        if (optionalFunctionCalling.isEmpty()) {
            AiFuncEntity aiFuncEntity = aiFuncMapper.selectOne(Wrappers.<AiFuncEntity>lambdaQuery()
                    .eq(AiFuncEntity::getFuncName, chatMessageDTO.getExtDetails().getFuncName()), false);

            if (Objects.isNull(aiFuncEntity)) {
                log.error("未找到对应的函数：{}，函数调用失败", chatMessageDTO.getExtDetails().getFuncName());
                return ToolProviderResult.builder().build();
            }

            ToolSpecification.Builder builder = ToolSpecification.builder();

            // 构建函数描述
            buildFuncDesc(chatMessageDTO, aiFuncEntity, builder);

            // 构建参数
            buildFuncParams(aiFuncEntity, builder);

            // 大模型回调执行逻辑
            ToolSpecification toolSpecification = builder.build();
            ToolExecutor toolExecutor = (toolExecutionRequest, memoryId) -> execLocalResultScript(toolExecutionRequest,
                    aiFuncEntity);
            return ToolProviderResult.builder().add(toolSpecification, toolExecutor).build();
        }

        FunctionCalling functionCalling = optionalFunctionCalling.get();
        return ToolProviderResult.builder().add(functionCalling.buildToolSpecification(), functionCalling).build();

    }

    /**
     * 执行本地结果脚本
     *
     * @param toolExecutionRequest 工具执行请求
     * @param aiFuncEntity         AI func 实体
     * @return {@link String }
     */
    private String execLocalResultScript(ToolExecutionRequest toolExecutionRequest, AiFuncEntity aiFuncEntity) {
        String arguments = toolExecutionRequest.arguments();
        log.info("大模型返回执行参数：{}", arguments);
        if (!JSONUtil.isTypeJSON(arguments)) {
            return "输入有误，请重新输入";
        }

        Map<String, Object> bean = JSONUtil.toBean(arguments, Map.class);
        String path = String.format("/funcs/%s/result", aiFuncEntity.getFuncName());
        Object invoke = magicAPIService.invoke(path, bean);
        return invoke.toString();
    }

    /**
     * 构建 func desc
     *
     * @param chatMessageDTO 聊天消息 DTO
     * @param aiFuncEntity   AI func 实体
     * @param builder        builder
     */
    private void buildFuncDesc(ChatMessageDTO chatMessageDTO, AiFuncEntity aiFuncEntity,
                               ToolSpecification.Builder builder) {
        String metadata = PromptBuilder.render("knowledge-func-metadata.st",
                Map.of(systemTime, DateUtil.now(), BaseAiRequest.Fields.messageKey, chatMessageDTO.getMessageKey()));

        String descId = String.format("%s/desc", aiFuncEntity.getFuncName());
        MagicEntity file = magicResourceService.file(SecureUtil.md5(descId));

        if (Objects.nonNull(file)) {
            String path = String.format("/funcs/%s/desc", aiFuncEntity.getFuncName());
            Object invoke = magicAPIService.invoke(path, new HashMap<>());

            PromptTemplate descTemplate = new PromptTemplate(aiFuncEntity.getFuncDesc());
            String render = descTemplate.render(Map.of());
            builder.name(aiFuncEntity.getFuncName())
                    .description(render + StrUtil.LF + invoke.toString() + StrUtil.LF + metadata);
        } else {
            builder.name(aiFuncEntity.getFuncName()).description(aiFuncEntity.getFuncDesc() + StrUtil.LF + metadata);
        }
    }

}
