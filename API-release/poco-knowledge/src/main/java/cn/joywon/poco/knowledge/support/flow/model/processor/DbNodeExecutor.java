package cn.joywon.poco.knowledge.support.flow.model.processor;

import cn.hutool.core.lang.Dict;
import cn.hutool.extra.template.Template;
import cn.hutool.extra.template.TemplateConfig;
import cn.hutool.extra.template.TemplateEngine;
import cn.hutool.extra.template.TemplateUtil;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.knowledge.support.feign.RemoteTableInfoService;
import cn.joywon.poco.knowledge.support.flow.constants.FlowConstant;
import cn.joywon.poco.knowledge.support.flow.constants.NodeTypeConstants;
import cn.joywon.poco.knowledge.support.flow.core.FlowContextHolder;
import cn.joywon.poco.knowledge.support.flow.core.FlowException;
import cn.joywon.poco.knowledge.support.flow.model.AiNodeDefinition;
import cn.joywon.poco.knowledge.support.flow.model.nodes.AiDbNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 数据库节点执行器
 */
@Component(NodeTypeConstants.DB)
@RequiredArgsConstructor
public class DbNodeExecutor extends AbstractNodeProcessor {
    public static final TemplateEngine engine = TemplateUtil.createEngine(new TemplateConfig());

    private final RemoteTableInfoService remoteTableInfoService;

    @Override
    protected Dict doExecute(AiNodeDefinition node, FlowContextHolder context) {

        // 节点配置判断
        AiDbNode config = node.getDbParams();
        if (config == null || config.getSql() == null) {
            throw FlowException.invalidParam("数据库节点配置无效");
        }
        // 获取输入参数
        Dict variables = getInputVariables(node, context);

        Template template = engine.getTemplate(config.getSql());
        String sql = template.render(variables);

        R execSQLResult = remoteTableInfoService.execSQL(config.getDbId(), sql);
        if (execSQLResult.isOk()) {
            return Dict.create().set(FlowConstant.RESULT, execSQLResult.getData())
                    .set(FlowConstant.SQL, sql)
                    .set(FlowConstant.TIMESTAMP, System.currentTimeMillis());
        }
        return null;
    }
}
