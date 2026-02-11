package cn.joywon.poco.flow.engine.node.impl;

import cn.hutool.core.collection.CollUtil;
import cn.joywon.poco.flow.engine.node.AssignUserStrategy;
import cn.joywon.poco.flow.task.constant.ProcessInstanceConstant;
import cn.joywon.poco.flow.task.dto.Node;
import cn.joywon.poco.flow.task.dto.NodeUser;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * 发起人自己
 *
 * @author Huijun Zhao
 * @description
 * @date 2023-07-07 13:42
 */
@Component(ProcessInstanceConstant.AssignedTypeClass.SELF + "AssignUserStrategy")
public class AssignUserSelfStrategyImpl implements AssignUserStrategy {

	@Override
	public List<Long> handle(Node node, NodeUser rootUser, Map<String, Object> variables) {
		return CollUtil.newArrayList(rootUser.getId());
	}

}
