package cn.joywon.poco.knowledge.support.flow.model.processor;

import cn.hutool.core.lang.Dict;
import cn.hutool.extra.template.Template;
import cn.hutool.extra.template.TemplateConfig;
import cn.hutool.extra.template.TemplateEngine;
import cn.hutool.extra.template.TemplateUtil;
import cn.hutool.script.JavaScriptEngine;
import cn.hutool.script.ScriptUtil;
import cn.joywon.poco.knowledge.support.flow.constants.FlowConstant;
import cn.joywon.poco.knowledge.support.flow.constants.NodeTypeConstants;
import cn.joywon.poco.knowledge.support.flow.core.FlowContextHolder;
import cn.joywon.poco.knowledge.support.flow.core.FlowException;
import cn.joywon.poco.knowledge.support.flow.model.AiNodeDefinition;
import cn.joywon.poco.knowledge.support.flow.model.nodes.AiCodeNode;
import org.openjdk.nashorn.api.scripting.ScriptObjectMirror;
import org.springframework.stereotype.Component;

/**
 * 代码节点执行器
 */
@Component(NodeTypeConstants.CODE)
public class CodeNodeExecutor extends AbstractNodeProcessor {
    public static final TemplateEngine engine = TemplateUtil.createEngine(new TemplateConfig());
    public static final JavaScriptEngine javaScriptEngine = ScriptUtil.getJavaScriptEngine();

    @Override
    protected Dict doExecute(AiNodeDefinition node, FlowContextHolder context) {
        try {
            // 节点配置判断
            AiCodeNode config = node.getCodeParams();
            if (config == null || config.getCode() == null) {
                throw FlowException.invalidParam("代码节点配置无效");
            }
            // 获取输入参数
            Dict variables = getInputVariables(node, context);
            // 增加环境变量参数
            variables.putAll(context.getEnvs());
            // 替换代码中的变量
            Template template = engine.getTemplate(config.getCode());
            String script = template.render(variables);
            javaScriptEngine.eval(script);
            ScriptObjectMirror objectMirror = (ScriptObjectMirror) javaScriptEngine.invokeFunction("main", variables);

            Dict result = Dict.create();
            for (String key : objectMirror.keySet()) {
                result.set(key, objectMirror.get(key));
            }

            return getOutputVariables(node, result).set(FlowConstant.TIMESTAMP, System.currentTimeMillis());
        } catch (Exception e) {
            throw FlowException.nodeError(node.getId(), "[代码节点] -> " + e.getMessage());
        }
    }
}
