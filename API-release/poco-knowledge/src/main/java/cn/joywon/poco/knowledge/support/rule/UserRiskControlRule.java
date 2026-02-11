package cn.joywon.poco.knowledge.support.rule;

import cn.hutool.core.date.DateUtil;
import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import cn.joywon.poco.knowledge.config.properties.AiKnowledgeProperties;
import cn.joywon.poco.knowledge.config.properties.RiskControlProperties;
import cn.joywon.poco.knowledge.dto.ChatMessageContext;
import cn.joywon.poco.knowledge.entity.AiBillEntity;
import cn.joywon.poco.knowledge.service.AiBillService;
import com.yomahub.liteflow.core.NodeComponent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.jetbrains.annotations.Nullable;
import org.springframework.stereotype.Component;

/**
 * 基于user 的风控规则
 *
 * @author poco
 * @date 2024/3/26
 */
@Slf4j
@Component("user")
@RequiredArgsConstructor
public class UserRiskControlRule extends NodeComponent {

	private final AiKnowledgeProperties aiKnowledgeProperties;

	private final AiBillService aiBillService;

	@Override
	public void process() {
		ChatMessageContext messageContext = this.getContextBean(ChatMessageContext.class);

		String risked = riskControl(messageContext.getUsername());
		if (StrUtil.isNotBlank(risked)) {
			messageContext.setErrorMessage(risked);
			// 设置结束
			setIsEnd(true);
		}
	}

	/**
	 * 风控检查
	 * @return 风控提示
	 */
	@Nullable
	private String riskControl(String username) {
		RiskControlProperties riskControl = aiKnowledgeProperties.getRiskControl();
		if (!riskControl.isEnabled()) {
			return null;
		}

		// 根据IP查询今天的调用次数
		long count = aiBillService.count(Wrappers.<AiBillEntity>lambdaQuery()
			.eq(StrUtil.isNotBlank(username), AiBillEntity::getCreateBy, username)
			.ge(AiBillEntity::getCreateTime, DateUtil.yesterday()));

		log.info("username:{},count:{}", username, count);
		if (count > riskControl.getTimes()) {
			return riskControl.getErrorMsg();
		}

		return null;
	}

}
