package cn.joywon.poco.flow.task.controller;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.flow.task.entity.ProcessGroup;
import cn.joywon.poco.flow.task.service.IProcessGroupService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("processGroup")
public class ProcessGroupController {

	private final IProcessGroupService processGroupService;

	/**
	 * 组列表
	 * @return
	 */
	@GetMapping("list")
	public R<List<ProcessGroup>> queryList() {
		return processGroupService.queryList();
	}

	/**
	 * 新增流程分组
	 * @param processGroup 分组名
	 * @return 添加结果
	 */
	@PostMapping("create")
	public R create(@RequestBody ProcessGroup processGroup) {
		return processGroupService.create(processGroup);
	}

	/**
	 * 删除分组
	 * @param id
	 * @return
	 */
	@DeleteMapping("delete/{id}")
	public R delete(@PathVariable long id) {
		return processGroupService.delete(id);
	}

}
