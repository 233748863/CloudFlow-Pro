package cn.joywon.poco.knowledge.support.constant;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 特殊支持的模型名称
 *
 * @author poco
 * @date 2024/4/15
 * <p>
 */
@Getter
@RequiredArgsConstructor
public enum ModelSupportEnums {

    ALIYUN_COSYVOICE_V1("cosyvoice-v1", "Aliyun", "Cosyvoice V1"),

    GLM_4V_FLASH("glm-4v-flash", "ChatGLM", "Glm 4v Flash"),

    DEEPSEEK_V3("deepseek-chat", "deepseek", "deepseek"),

    ARK_DEEPSEEK_V3("deepseek-v3-250324", "ark", "deepseek"),

    SILICONFLOW_DEEPSEEK_V3("deepseek-ai/DeepSeek-V3", "siliconflow", "deepseek"),

    OPENROUTER_QUASAR_ALPHA("openrouter/quasar-alpha", "OpenRouter", "Quasar Alpha"),


    SILICONFLOW_FLUX_1_SCHNELL("black-forest-labs/FLUX.1-schnell", "Siliconflow", "Black Forest Labs Flux 1 Schnell"),

    SILICONFLOW_SENSE_VOICE_SMALL("FunAudioLLM/SenseVoiceSmall", "Siliconflow", "Fun Audio LLM Sense Voice Small"),

    SILICONFLOW_GPT_SOVITS("RVC-Boss/GPT-SoVITS", "Siliconflow", "RVC-Boss/GPT-SoVITS:alex");

    /**
     * 编码
     */
    private final String code;

    /**
     * 供应商
     */
    private final String provider;

    /**
     * 描述
     */
    private final String desc;

}
