package cn.joywon.poco.flow.task.controller;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.flow.task.dto.Node;
import cn.joywon.poco.flow.task.dto.ProcessNodeDataDto;
import cn.joywon.poco.flow.task.service.IProcessNodeDataService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/**
 * <p>
 * 流程节点数据 前端控制器
 * </p>
 *
 * @author Vincent
 * @since 2023-05-07
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/processNodeData")
public class ProcessNodeDataController {

	private final IProcessNodeDataService processNodeDataService;

	/**
	 * 保存节点数据
	 * @param processNodeDataDto
	 * @return
	 */
	@PostMapping("saveNodeData")
	public R saveNodeData(@RequestBody ProcessNodeDataDto processNodeDataDto) {
		return processNodeDataService.saveNodeData(processNodeDataDto);
	}

	/**
	 * 获取节点数据
	 * @param flowId
	 * @param nodeId
	 * @return
	 */
	@GetMapping("getNodeData")
	public R<Node> getNodeData(String flowId, String nodeId) {
		return processNodeDataService.getNodeData(flowId, nodeId);
	}

}
