package cn.joywon.poco.knowledge.dto;

import cn.hutool.core.lang.Dict;
import lombok.Data;

/**
 * AI 流程执行 DTO
 *
 * @author poco
 * @date 2025/03/03
 */
@Data
public class AiFlowExecuteDTO {

    /**
     * ID
     */
    private Long id;

    /**
     * 参数
     */
    private Dict params;

    /**
     * 环境配置
     */
    private Dict envs;
}
