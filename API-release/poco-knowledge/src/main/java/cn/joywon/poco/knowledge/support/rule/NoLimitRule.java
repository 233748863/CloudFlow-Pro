package cn.joywon.poco.knowledge.support.rule;

import cn.joywon.poco.common.security.util.SecurityUtils;
import com.yomahub.liteflow.core.NodeComponent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 不风控，空任务
 *
 * @author poco
 * @date 2024/3/26
 */
@Slf4j
@Component("noLimit")
@RequiredArgsConstructor
public class NoLimitRule extends NodeComponent {

	@Override
	public void process() {
		log.debug("当前用户无风控，无限制任务 {}", SecurityUtils.getUser().getUsername());
	}

}
