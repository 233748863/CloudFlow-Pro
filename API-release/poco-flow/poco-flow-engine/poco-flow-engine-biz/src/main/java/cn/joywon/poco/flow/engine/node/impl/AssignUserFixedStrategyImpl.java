package cn.joywon.poco.flow.engine.node.impl;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import cn.joywon.poco.admin.api.entity.SysUser;
import cn.joywon.poco.admin.api.feign.RemoteUserService;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.flow.engine.node.AssignUserStrategy;
import cn.joywon.poco.flow.task.constant.NodeUserTypeEnum;
import cn.joywon.poco.flow.task.constant.ProcessInstanceConstant;
import cn.joywon.poco.flow.task.dto.Node;
import cn.joywon.poco.flow.task.dto.NodeUser;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 指定具体用户
 *
 * @author Huijun Zhao
 * @description
 * @date 2023-07-07 13:42
 */
@RequiredArgsConstructor
@Component(ProcessInstanceConstant.AssignedTypeClass.USER + "AssignUserStrategy")
public class AssignUserFixedStrategyImpl implements AssignUserStrategy {

	private final RemoteUserService remoteUserService;

	/**
	 * 处理节点并返回用户ID列表。
	 * @param node 节点
	 * @param rootUser 根用户
	 * @param variables 变量
	 * @return 用户ID列表
	 */
	@Override
	public List<Long> handle(Node node, NodeUser rootUser, Map<String, Object> variables) {

		// 指定人员
		List<NodeUser> userDtoList = node.getNodeUserList();
		// 用户ID列表
		List<Long> userIdList = userDtoList.stream()
			.filter(w -> StrUtil.equals(w.getType(), NodeUserTypeEnum.USER.getKey()))
			.map(NodeUser::getId)
			.collect(Collectors.toList());
		// 部门ID列表
		List<Long> deptIdList = userDtoList.stream()
			.filter(w -> StrUtil.equals(w.getType(), NodeUserTypeEnum.DEPT.getKey()))
			.map(NodeUser::getId)
			.collect(Collectors.toList());

		if (CollUtil.isNotEmpty(deptIdList)) {
			R<List<SysUser>> r = remoteUserService.getUserIdListByDeptIdList(deptIdList);
			if (CollUtil.isNotEmpty(r.getData())) {
				for (SysUser user : r.getData()) {
					if (!userIdList.contains(user.getUserId())) {
						userIdList.add(user.getUserId());
					}
				}
			}
		}

		return userIdList;
	}

}
