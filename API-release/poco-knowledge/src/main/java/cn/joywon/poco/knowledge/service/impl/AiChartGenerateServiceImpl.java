package cn.joywon.poco.knowledge.service.impl;

import cn.hutool.cache.Cache;
import cn.hutool.cache.CacheUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import cn.joywon.poco.knowledge.dto.ChatMessageDTO;
import cn.joywon.poco.knowledge.entity.AiModelEntity;
import cn.joywon.poco.knowledge.mapper.AiModelMapper;
import cn.joywon.poco.knowledge.service.AiAssistantService;
import cn.joywon.poco.knowledge.service.AiChartGenerateService;
import cn.joywon.poco.knowledge.support.constant.AiChartTypeEnums;
import cn.joywon.poco.knowledge.support.constant.ModelSupportEnums;
import cn.joywon.poco.knowledge.support.flow.constants.FlowConstant;
import cn.joywon.poco.knowledge.support.provider.ModelProvider;
import cn.joywon.poco.knowledge.support.util.PromptBuilder;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.request.json.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.tuple.Triple;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * AI 图表生成服务
 *
 * @author poco
 * @date 2025/03/23
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiChartGenerateServiceImpl implements AiChartGenerateService {

    private final static Cache<String, String> CHART_JSON_MAP = CacheUtil.newLRUCache(1024 * 1000);

    private final AiModelMapper aiModelMapper;

    @Lazy
    private final ModelProvider modelProvider;


    /**
     * 生成图表
     *
     * @param chatMessageDTO 聊天消息 dto
     * @param data           数据
     */
    @Async
    @Override
    public void generateChart(ChatMessageDTO chatMessageDTO, Object data) {

        AiModelEntity aiModelEntity = aiModelMapper.selectOne(Wrappers.<AiModelEntity>lambdaQuery()
                        .in(AiModelEntity::getModelName, ModelSupportEnums.DEEPSEEK_V3.getCode(),
                                ModelSupportEnums.OPENROUTER_QUASAR_ALPHA.getCode(),
                                ModelSupportEnums.ARK_DEEPSEEK_V3.getCode(), ModelSupportEnums.SILICONFLOW_DEEPSEEK_V3.getCode())
                , false);

        if (aiModelEntity == null) {
            log.error("未找到 AI 模型: {}，不进行图表生成", ModelSupportEnums.DEEPSEEK_V3.getCode());
            CHART_JSON_MAP.put(chatMessageDTO.getExtDetails().getChartId(), "{}");
            return;
        }

        // 获取 AI 助手服务
        Triple<ChatLanguageModel, AiAssistantService, String> jsonTriple = modelProvider.getAiJSONAssistant(aiModelEntity.getName());

        String chartType = chatMessageDTO.getExtDetails().getChartType();


        // 渲染用户消息
        JsonSchema jsonSchema = null;
        if (AiChartTypeEnums.LINE.getCode().equals(chartType)) {
            jsonSchema = buildLineJsonSchema();
        } else if (AiChartTypeEnums.PIE.getCode().equals(chartType)) {
            jsonSchema = buildPieJsonSchema();
        } else if (AiChartTypeEnums.BAR.getCode().equals(chartType)) {
            jsonSchema = buildBarJsonSchema();
        }


        // 构造数据输入
        String result = String.format("%s:%s", chatMessageDTO.getContent(), data);

        String userMessage = PromptBuilder.render("chat2db-result-chart.st"
                , Map.of(FlowConstant.RESULT, result, "jsonSchema", jsonSchema
                        , "chartType", AiChartTypeEnums.getEnumByCode(chartType).getDesc()));
        ChatRequest.Builder builder = ChatRequest.builder().messages(UserMessage.from(userMessage));
        String chartResult = jsonTriple.getLeft().chat(builder.build()).aiMessage().text();

        log.info("图表生成完成 (类型: {}): {}", chatMessageDTO.getExtDetails().getChartType(), chartResult);
        CHART_JSON_MAP.put(chatMessageDTO.getExtDetails().getChartId(), chartResult);
    }

    /**
     * 获取图表
     *
     * @param chartId 图表id
     * @return {@link String }
     */
    @Override
    public String getChart(String chartId) {
        return CHART_JSON_MAP.get(chartId);
    }

    /**
     * 构建折线图的 JSON Schema
     *
     * @return {@link JsonSchema }
     */
    private static JsonSchema buildLineJsonSchema() {
        return JsonSchema.builder()
                .rootElement(JsonObjectSchema.builder()
                        .addProperties(new LinkedHashMap<>() {
                            {
                                // 配置X轴
                                put("xAxis", JsonObjectSchema.builder()
                                        .addStringProperty("type", "固定值:category")
                                        .addProperty("data", JsonArraySchema.builder()
                                                .items(JsonStringSchema.builder()
                                                        .description("X轴数据项，例如 ['A', 'B', 'C']")
                                                        .build())
                                                .description("X轴的分类标签数组")
                                                .build())
                                        .build()
                                );

                                // 配置Y轴
                                put("yAxis", JsonObjectSchema.builder()
                                        .addStringProperty("type", "固定值:value")
                                        .description("Y轴数据类型，代表数值轴")
                                        .build()
                                );

                                // 配置折线图数据
                                put("series", JsonArraySchema.builder()
                                        .description("折线图的数据项，支持多条折线")
                                        .items(JsonObjectSchema.builder()
                                                .addStringProperty("type", "固定值:line")
                                                .addProperty("data", JsonArraySchema.builder()
                                                        .description("Y轴数据数组，例如 [10, 20, 30]，每个值对应xAxis中的类别")
                                                        .items(JsonNumberSchema.builder()
                                                                .description("Y轴具体数值，代表对应类别的值")
                                                                .build())
                                                        .build())
                                                .description("单条折线的数据配置")
                                                .build())
                                        .build()
                                );
                            }
                        }).required().additionalProperties(false).build())
                .build();
    }

    /**
     * 生成柱状图 JSON 架构
     *
     * @return {@link JsonSchema }
     */
    private JsonSchema buildBarJsonSchema() {
        return JsonSchema.builder()
                .rootElement(JsonObjectSchema.builder()
                        .addProperties(new LinkedHashMap<>() {
                            {
                                // 配置X轴
                                put("xAxis", JsonObjectSchema.builder()
                                        .addStringProperty("type", "固定值:category")
                                        .addProperty("data", JsonArraySchema.builder()
                                                .items(JsonStringSchema.builder()
                                                        .description("X轴数据，必须是字符串数组，例如 ['A', 'B', 'C']")
                                                        .build())
                                                .description("X轴的分类标签数组")
                                                .build())
                                        .build()
                                );

                                // 配置Y轴
                                put("yAxis", JsonObjectSchema.builder()
                                        .addStringProperty("type", "固定值:value")
                                        .description("Y轴数据类型，固定为数值类型")
                                        .build()
                                );

                                // 配置柱状图数据
                                put("series", JsonArraySchema.builder()
                                        .description("柱状图的数据集合，支持多个系列")
                                        .items(JsonObjectSchema.builder()
                                                .addStringProperty("type", "固定值:bar")
                                                .addProperty("data", JsonArraySchema.builder()
                                                        .description("Y轴数据数组，例如 [10, 20, 30]，每个值对应xAxis中的类别")
                                                        .items(JsonNumberSchema.builder()
                                                                .description("Y轴具体数值，代表对应类别的值")
                                                                .build())
                                                        .build())
                                                .description("单个系列的柱状图配置")
                                                .build())
                                        .build()
                                );
                            }
                        }).required().additionalProperties(false).build())
                .build();
    }

    /**
     * 构建饼图 JSON 架构
     *
     * @return {@link JsonSchema }
     */
    private JsonSchema buildPieJsonSchema() {
        return JsonSchema.builder()
                .rootElement(JsonObjectSchema.builder()
                        .addProperties(new LinkedHashMap<>() {
                            {
                                // 配置饼图数据
                                put("series", JsonArraySchema.builder()
                                        .description("饼图的数据集合，支持多个系列")
                                        .items(JsonObjectSchema.builder()
                                                .addStringProperty("type", "固定值:pie")
                                                .addStringProperty("radius", "饼图半径固定值:50%")
                                                .addProperty("data", JsonArraySchema.builder()
                                                        .description("饼图数据项数组，每个对象包含一个值和名称")
                                                        .items(JsonObjectSchema.builder()
                                                                .addNumberProperty("value", "数据值，表示该项的占比大小")
                                                                .addStringProperty("name", "数据项名称，例如 '分类A'")
                                                                .build())
                                                        .build())
                                                .description("单个系列的饼图配置")
                                                .build())
                                        .build()
                                );
                            }
                        }).required().additionalProperties(false).build())
                .build();
    }
}
