package cn.joywon.poco.knowledge.service.impl;

import cn.hutool.core.lang.Pair;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.knowledge.dto.AiMessageResultDTO;
import cn.joywon.poco.knowledge.dto.AiPosterDTO;
import cn.joywon.poco.knowledge.entity.AiModelEntity;
import cn.joywon.poco.knowledge.entity.AiPosterEntity;
import cn.joywon.poco.knowledge.mapper.AiModelMapper;
import cn.joywon.poco.knowledge.mapper.AiPosterMapper;
import cn.joywon.poco.knowledge.service.AiNoMemoryStreamAssistantService;
import cn.joywon.poco.knowledge.service.AiPosterService;
import cn.joywon.poco.knowledge.support.constant.ModelSupportEnums;
import cn.joywon.poco.knowledge.support.provider.ModelProvider;
import cn.joywon.poco.knowledge.support.util.PromptBuilder;
import dev.langchain4j.model.chat.StreamingChatLanguageModel;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;

import java.util.Map;

/**
 * AI海报模板表
 *
 * @author poco
 * @date 2025-04-04 14:25:49
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiPosterServiceImpl extends ServiceImpl<AiPosterMapper, AiPosterEntity> implements AiPosterService {

    private final ModelProvider modelProvider;

    private final AiModelMapper aiModelMapper;

    /**
     * 生成海报
     *
     * @param posterDTO 海报 DTO
     * @return {@link R }
     */
    @Override
    public Flux<AiMessageResultDTO> generatePoster(AiPosterDTO posterDTO) {
        AiModelEntity aiModelEntity = aiModelMapper.selectOne(Wrappers.<AiModelEntity>lambdaQuery()
                        .in(AiModelEntity::getModelName, ModelSupportEnums.DEEPSEEK_V3.getCode(),
                                ModelSupportEnums.OPENROUTER_QUASAR_ALPHA.getCode(),
                                ModelSupportEnums.ARK_DEEPSEEK_V3.getCode(), ModelSupportEnums.SILICONFLOW_DEEPSEEK_V3.getCode())
                , false);

        if (aiModelEntity == null) {
            log.error("未找到 AI 模型: {}，不进行海报生成", ModelSupportEnums.DEEPSEEK_V3.getCode());
            return Flux.just(new AiMessageResultDTO("未找到 AI 模型: " + ModelSupportEnums.DEEPSEEK_V3.getCode() + "，不进行海报生成"));
        }

        AiPosterEntity posterEntity = baseMapper.selectById(posterDTO.getTemplateId());
        Pair<StreamingChatLanguageModel, AiNoMemoryStreamAssistantService> pair = modelProvider.getAiNoMemoryStreamAssistant(aiModelEntity.getName());

        return pair.getValue().chat(PromptBuilder.render("ai-poster.st", Map.of(
                        AiPosterEntity.Fields.templateStyle, posterEntity.getTemplateStyle(),
                        AiPosterDTO.Fields.qrCode, posterDTO.getQrCode(),
                        AiPosterDTO.Fields.prompt, posterDTO.getPrompt()
                ))).startWith(posterEntity.getTemplateCss())
                .map(AiMessageResultDTO::new);
    }
}
