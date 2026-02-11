package cn.joywon.poco.knowledge.dto;

import lombok.Data;
import lombok.experimental.FieldNameConstants;

/**
 * @author poco
 * @date 2025/4/4
 */
@Data
@FieldNameConstants
public class AiPosterDTO {

    /**
     * 模板id
     */
    public String templateId;

    /**
     * 二维码
     */
    public String qrCode;

    /**
     * 提示
     */
    public String prompt;
}
