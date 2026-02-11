package cn.joywon.poco.knowledge.support.rule;

import com.yomahub.liteflow.core.NodeComponent;
import org.springframework.stereotype.Component;

/**
 * 基于tokens 的风控规则
 *
 * @author poco
 * @date 2024/3/26
 */
@Component("tokens")
public class TokensRiskControlRule extends NodeComponent {

	@Override
	public void process() {
		// TODO 业务逻辑
	}

}
