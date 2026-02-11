package cn.joywon.poco.knowledge.controller;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.ArrayUtil;
import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import cn.joywon.poco.common.core.constant.enums.YesNoEnum;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.excel.annotation.ResponseExcel;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.common.security.annotation.HasPermission;
import cn.joywon.poco.common.security.util.SecurityUtils;
import cn.joywon.poco.knowledge.dto.AiPromptDTO;
import cn.joywon.poco.knowledge.entity.AiPromptEntity;
import cn.joywon.poco.knowledge.service.AiPromptService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 提示词
 *
 * @author pig
 * @date 2024-03-20 16:29:05
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/aiPrompt")
@Tag(description = "aiPrompt", name = "提示词管理")
@SecurityRequirement(name = HttpHeaders.AUTHORIZATION)
public class AiPromptController {

	private final AiPromptService aiPromptService;

	/**
	 * 列表查询
	 * @param aiPrompt 提示词查询对象
	 * @return
	 */
	@Operation(summary = "列表查询", description = "列表查询")
	@GetMapping("/list")
	@HasPermission("knowledge_aiPrompt_view")
	public R getAiPromptList(AiPromptEntity aiPrompt) {
		LambdaQueryWrapper<AiPromptEntity> wrapper = Wrappers.lambdaQuery();
		wrapper.eq(AiPromptEntity::getUserId, SecurityUtils.getUser().getId());
		wrapper.eq(AiPromptEntity::getPromptStatus, YesNoEnum.YES.getCode());
		wrapper.like(StrUtil.isNotBlank(aiPrompt.getAct()), AiPromptEntity::getAct, aiPrompt.getAct())
			.or()
			.like(StrUtil.isNotBlank(aiPrompt.getAct()), AiPromptEntity::getPrompt, aiPrompt.getPrompt())
			.orderByDesc(AiPromptEntity::getCreateTime);
		return R.ok(aiPromptService.list(wrapper));
	}

	/**
	 * 分页查询
	 * @param page 分页对象
	 * @param aiPrompt 提示词
	 * @return
	 */
	@Operation(summary = "分页查询", description = "分页查询")
	@GetMapping("/page")
	@HasPermission("knowledge_aiPrompt_view")
	public R getAiPromptPage(@ParameterObject Page page, @ParameterObject AiPromptEntity aiPrompt) {
		LambdaQueryWrapper<AiPromptEntity> wrapper = Wrappers.lambdaQuery();
		return R.ok(aiPromptService.page(page, wrapper));
	}

	/**
	 * 通过id查询提示词
	 * @param id id
	 * @return R
	 */
	@Operation(summary = "通过id查询", description = "通过id查询")
	@GetMapping("/{id}")
	@HasPermission("knowledge_aiPrompt_view")
	public R getById(@PathVariable("id") Long id) {
		return R.ok(aiPromptService.getById(id));
	}

	/**
	 * 新增提示词
	 * @param aiPrompt 提示词
	 * @return R
	 */
	@Operation(summary = "新增提示词", description = "新增提示词")
	@SysLog("新增提示词")
	@PostMapping
	@HasPermission("knowledge_aiPrompt_add")
	public R save(@RequestBody AiPromptEntity aiPrompt) {
		aiPrompt.setUserId(SecurityUtils.getUser().getId());
		return R.ok(aiPromptService.save(aiPrompt));
	}

	/**
	 * 修改提示词
	 * @param aiPrompt 提示词
	 * @return R
	 */
	@Operation(summary = "修改提示词", description = "修改提示词")
	@SysLog("修改提示词")
	@PutMapping
	@HasPermission("knowledge_aiPrompt_edit")
	public R updateById(@RequestBody AiPromptEntity aiPrompt) {
		return R.ok(aiPromptService.updateById(aiPrompt));
	}

	/**
	 * 通过id删除提示词
	 * @param ids id列表
	 * @return R
	 */
	@Operation(summary = "通过id删除提示词", description = "通过id删除提示词")
	@SysLog("通过id删除提示词")
	@DeleteMapping
	@HasPermission("knowledge_aiPrompt_del")
	public R removeById(@RequestBody Long[] ids) {
		return R.ok(aiPromptService.removeBatchByIds(CollUtil.toList(ids)));
	}

	/**
	 * 导出excel 表格
	 * @param aiPrompt 查询条件
	 * @param ids 导出指定ID
	 * @return excel 文件流
	 */
	@ResponseExcel
	@GetMapping("/export")
	@HasPermission("knowledge_aiPrompt_export")
	public List<AiPromptEntity> export(AiPromptEntity aiPrompt, Long[] ids) {
		return aiPromptService
			.list(Wrappers.lambdaQuery(aiPrompt).in(ArrayUtil.isNotEmpty(ids), AiPromptEntity::getId, ids));
	}

	/**
	 * 优化提示
	 * @param act 做
	 * @return {@link R }<{@link String }>
	 */
	@Operation(summary = "调用大模型优化提示词", description = "OpenAI调用大模型优化提示词")
	@PostMapping("/optimize")
	@HasPermission("knowledge_aiPrompt_del")
	public R<String> optimizePrompt(@RequestBody AiPromptDTO aiPrompt) {
		return R.ok(aiPromptService.optimizePrompt(aiPrompt));
	}

}
