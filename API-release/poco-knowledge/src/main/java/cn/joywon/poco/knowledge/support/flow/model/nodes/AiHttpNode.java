package cn.joywon.poco.knowledge.support.flow.model.nodes;

import cn.joywon.poco.knowledge.support.flow.model.AiParamDefinition;
import lombok.Data;

import java.util.List;

/**
 * AI HTTP 节点
 *
 * @author poco
 * @date 2025/03/03
 */
@Data
public class AiHttpNode {
    /**
     * 请求URL
     */
    private String url;

    /**
     * 请求方法
     */
    private String method;

    /**
     * 内容类型
     */
    private String contentType;

    /**
     * 请求头参数
     */
    private List<AiParamDefinition> headerParams;

    /**
     * 请求参数
     */
    private List<AiParamDefinition> paramParams;

    /**
     * 请求体参数
     */
    private List<AiParamDefinition> bodyParams;

    /**
     * 请求体JSON
     */
    private String jsonBody;
}
