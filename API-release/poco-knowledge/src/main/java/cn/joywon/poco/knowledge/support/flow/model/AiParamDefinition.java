package cn.joywon.poco.knowledge.support.flow.model;

import lombok.Data;

/**
 * AI 参数定义
 *
 * @author poco
 * @date 2025/03/03
 */
@Data
public class AiParamDefinition {


    /**
     * 名字
     */
    private String name;

    /**
     * 类型
     */
    private String type;

    /**
     * 值
     */
    private String value;

    /**
     * 必填
     */
    private boolean required;
}
