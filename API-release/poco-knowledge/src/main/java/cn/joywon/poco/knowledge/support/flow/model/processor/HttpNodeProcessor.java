package cn.joywon.poco.knowledge.support.flow.model.processor;

import cn.hutool.core.lang.Dict;
import cn.hutool.core.util.StrUtil;
import cn.hutool.extra.template.Template;
import cn.hutool.extra.template.TemplateConfig;
import cn.hutool.extra.template.TemplateEngine;
import cn.hutool.extra.template.TemplateUtil;
import cn.joywon.poco.knowledge.support.flow.constants.FlowConstant;
import cn.joywon.poco.knowledge.support.flow.constants.NodeTypeConstants;
import cn.joywon.poco.knowledge.support.flow.core.FlowContextHolder;
import cn.joywon.poco.knowledge.support.flow.core.FlowException;
import cn.joywon.poco.knowledge.support.flow.model.AiNodeDefinition;
import cn.joywon.poco.knowledge.support.flow.model.AiParamDefinition;
import cn.joywon.poco.knowledge.support.flow.model.nodes.AiHttpNode;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.List;

/**
 * HTTP节点处理器
 */
@Component(NodeTypeConstants.HTTP)
@RequiredArgsConstructor
public class HttpNodeProcessor extends AbstractNodeProcessor {

    public static final TemplateEngine engine = TemplateUtil.createEngine(new TemplateConfig());

    @Override
    protected Dict doExecute(AiNodeDefinition node, FlowContextHolder context) {
        try {
            // 节点配置判断
            AiHttpNode config = node.getHttpParams();
            if (config == null) {
                throw FlowException.invalidParam("HTTP节点配置无效");
            }
            if (config.getUrl() == null || config.getMethod() == null) {
                throw FlowException.invalidParam("HTTP节点配置无效");
            }

            // 获取输入参数
            Dict variables = getInputVariables(node, context);


            // 替换URL中的变量
            Template template = engine.getTemplate(config.getUrl());
            String url = template.render(variables);

            // 设置请求头
            HttpHeaders requestHeaders = new HttpHeaders();
            List<AiParamDefinition> headerParams = config.getHeaderParams();
            if (headerParams != null) {
                for (AiParamDefinition paramNode : headerParams) {
                    requestHeaders.add(paramNode.getName(), context.getVariable(paramNode.getType()).toString());
                }
            }

            // 设置URL参数
            List<AiParamDefinition> paramParams = config.getParamParams();
            if (paramParams != null) {
                for (AiParamDefinition paramNode : paramParams) {
                    url = addQueryParam(url, paramNode.getName(), context.getVariable(paramNode.getType()).toString());
                }
            }

            // 获取请求方法
            HttpMethod httpMethod = HttpMethod.valueOf(config.getMethod());

            // 处理请求体
            Object requestBody = null;

            // 处理 POST 和 PUT 请求的查询参数
            if (HttpMethod.POST.equals(httpMethod) || HttpMethod.PUT.equals(httpMethod)) {
                String jsonBody = config.getJsonBody();
                List<AiParamDefinition> bodyParams = config.getBodyParams();
                if (StrUtil.isNotBlank(jsonBody)) {
                    Template jsonBodyTemplate = engine.getTemplate(jsonBody);
                    requestBody = template.render(variables);
                } else if (bodyParams != null) {
                    Dict body = Dict.create();
                    for (AiParamDefinition paramNode : bodyParams) {
                        body.set(paramNode.getName(), context.getVariable(paramNode.getType()).toString());
                    }
                    requestBody = body;
                }
            }

            // 处理 GET 和 DELETE 请求的查询参数
            if (HttpMethod.GET.equals(httpMethod) || HttpMethod.DELETE.equals(httpMethod)) {
                // GET/DELETE 请求不需要请求体
                requestBody = null;
            }

            // 构建请求实体
            HttpEntity<?> requestEntity = new HttpEntity<>(requestBody, requestHeaders);

            // 发送请求
            ResponseEntity<Object> response = new RestTemplate().exchange(
                    url,
                    httpMethod,
                    requestEntity,
                    Object.class
            );

            // 设置结果
            return Dict.create().set(FlowConstant.HTTP_STATUS, response.getStatusCode())
                    .set(FlowConstant.HTTP_HEADERS, response.getHeaders())
                    .set(FlowConstant.HTTP_BODY, response.getBody())
                    .set(FlowConstant.TIMESTAMP, System.currentTimeMillis());

        } catch (Exception e) {
            // 捕获异常时，提供更多的上下文信息
            throw FlowException.nodeError(node.getId(), "[HTTP节点] -> " + e.getMessage());
        }
    }
}
