package cn.joywon.poco.flow.task.vo;

import cn.joywon.poco.flow.task.entity.Process;
import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
public class ProcessVO extends Process {

	/**
	 * 需要发起人选择的节点id
	 */
	private List<String> selectUserNodeId;

	private Map<String, Object> variableMap;

	/**
	 * 发起人节点的表单权限
	 */
	private Map<String,String> formPerms;

}
