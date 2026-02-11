package cn.joywon.poco.flow.task.controller;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.flow.task.service.IProcessCopyService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * <p>
 * 流程抄送数据 前端控制器
 * </p>
 *
 * @author Vincent
 * @since 2023-05-20
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/processCopy")
public class ProcessCopyController {

	private final IProcessCopyService processCopyService;

	/**
	 * 查询单个抄送详细信息
	 * @param id
	 * @return
	 */
	@GetMapping("querySingleDetail")
	public R querySingleDetail(long id) {
		return processCopyService.querySingleDetail(id);
	}

}
