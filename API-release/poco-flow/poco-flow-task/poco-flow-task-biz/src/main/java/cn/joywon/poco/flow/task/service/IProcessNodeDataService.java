package cn.joywon.poco.flow.task.service;

import com.baomidou.mybatisplus.extension.service.IService;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.flow.task.dto.Node;
import cn.joywon.poco.flow.task.dto.ProcessNodeDataDto;
import cn.joywon.poco.flow.task.entity.ProcessNodeData;

/**
 * <p>
 * 流程节点数据 服务类
 * </p>
 *
 * @author Vincent
 * @since 2023-05-07
 */
public interface IProcessNodeDataService extends IService<ProcessNodeData> {

	/**
	 * 保存流程节点数据
	 * @param processNodeDataDto
	 * @return
	 */
	R saveNodeData(ProcessNodeDataDto processNodeDataDto);

	/***
	 * 获取节点数据
	 * @param flowId
	 * @param nodeId
	 * @return
	 */
	R<Node> getNodeData(String flowId, String nodeId);

}
