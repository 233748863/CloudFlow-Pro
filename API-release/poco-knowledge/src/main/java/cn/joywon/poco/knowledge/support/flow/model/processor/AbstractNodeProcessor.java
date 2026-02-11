package cn.joywon.poco.knowledge.support.flow.model.processor;

import cn.hutool.core.lang.Dict;
import cn.joywon.poco.knowledge.support.flow.core.FlowContextHolder;
import cn.joywon.poco.knowledge.support.flow.model.AiNodeDefinition;
import cn.joywon.poco.knowledge.support.flow.model.AiParamDefinition;
import lombok.RequiredArgsConstructor;

import java.util.List;

/**
 * 节点处理器抽象基类
 */
@RequiredArgsConstructor
public abstract class AbstractNodeProcessor implements AiNodeProcessor {

    @Override
    public Dict execute(AiNodeDefinition node, FlowContextHolder context) {
        // 验证参数
        validateParams(node, context);
        // 执行节点逻辑
        return doExecute(node, context);
    }

    /**
     * 执行节点具体逻辑
     *
     * @param node    节点配置
     * @param context 上下文
     * @return 执行结果
     */
    protected abstract Dict doExecute(AiNodeDefinition node, FlowContextHolder context);

    /**
     * 验证参数
     */
    protected void validateParams(AiNodeDefinition node, FlowContextHolder context) {

    }

    /**
     * 获取输入节点参数值
     *
     * @param node    节点配置
     * @param context 上下文
     * @return 参数值
     */
    protected Dict getInputVariables(AiNodeDefinition node, FlowContextHolder context) {
        Dict variables = Dict.create();
        List<AiParamDefinition> inputParams = node.getInputParams();
        if (inputParams == null || inputParams.isEmpty()) {
            return variables;
        }
        inputParams.forEach(param -> variables.set(param.getName(), context.getVariable(param.getType())));
        return variables;
    }

    /**
     * 获取输出节点参数值
     *
     * @param node   节点配置
     * @param result 执行结果
     * @return 参数值
     */
    protected Dict getOutputVariables(AiNodeDefinition node, Dict kv) {
        Dict variables = Dict.create();
        List<AiParamDefinition> outputParams = node.getOutputParams();
        if (outputParams == null || outputParams.isEmpty()) {
            return variables;
        }
        outputParams.forEach(param -> {
            if (param.getName() != null) {
                String type = param.getType().toLowerCase();
                switch (type) {
                    case "string":
                        variables.set(param.getName(), kv.getStr(param.getName()));
                        break;
                    case "int":
                        variables.set(param.getName(), kv.getInt(param.getName()));
                        break;
                    case "long":
                        variables.set(param.getName(), kv.getLong(param.getName()));
                        break;
                    case "double":
                    case "number":
                        variables.set(param.getName(), kv.getDouble(param.getName()));
                        break;
                    case "boolean":
                        variables.set(param.getName(), kv.getBool(param.getName()));
                        break;
                    default:
                        variables.set(param.getName(), kv.get(param.getName()));
                        break;
                }
            }
        });
        return variables;
    }

    /**
     * 添加查询参数
     */
    protected String addQueryParam(String url, String name, Object value) {
        if (url == null || name == null || value == null) {
            return url;
        }
        String separator = url.contains("?") ? "&" : "?";
        return url + separator + name + "=" + value;
    }
}
