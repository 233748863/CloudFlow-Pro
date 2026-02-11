package cn.joywon.poco.knowledge.support.rule;

import cn.hutool.core.collection.CollUtil;
import cn.joywon.poco.common.security.util.SecurityUtils;
import cn.joywon.poco.knowledge.config.properties.AiKnowledgeProperties;
import com.yomahub.liteflow.core.NodeBooleanComponent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 哪些特征直接跳过风控
 *
 * @author poco
 * @date 2024/4/14
 */
@Slf4j
@Component("isNoLimit")
@RequiredArgsConstructor
public class IsNoLimitRule extends NodeBooleanComponent {

	private final AiKnowledgeProperties aiKnowledgeProperties;

	@Override
	public boolean processBoolean() throws Exception {
		if (CollUtil.isEmpty(aiKnowledgeProperties.getRiskControl().getNoLimitUsernames())) {
			return false;
		}

		String username = SecurityUtils.getUser().getUsername();
		return aiKnowledgeProperties.getRiskControl().getNoLimitUsernames().contains(username);
	}

}
