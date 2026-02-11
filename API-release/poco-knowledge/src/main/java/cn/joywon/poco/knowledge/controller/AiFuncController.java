package cn.joywon.poco.knowledge.controller;

import cn.hutool.core.util.ArrayUtil;
import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.excel.annotation.ResponseExcel;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.knowledge.dto.FunctionDTO;
import cn.joywon.poco.knowledge.entity.AiFuncEntity;
import cn.joywon.poco.knowledge.service.AiFuncService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.http.HttpHeaders;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * AI功能
 *
 * @author poco
 * @date 2024-07-31 15:39:33
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/aiFunc")
@Tag(description = "aiFunc", name = "AI功能管理")
@SecurityRequirement(name = HttpHeaders.AUTHORIZATION)
public class AiFuncController {

	private final AiFuncService aiFuncService;


	/**
	 * 分页查询
	 * @param page 分页对象
	 * @param aiFunc AI功能
	 * @return
	 */
	@Operation(summary = "分页查询", description = "分页查询")
	@GetMapping("/page")
	@PreAuthorize("@pms.hasPermission('knowledge_aiFunc_view')")
	public R getAiFuncPage(@ParameterObject Page page, @ParameterObject AiFuncEntity aiFunc) {
		LambdaQueryWrapper<AiFuncEntity> wrapper = Wrappers.lambdaQuery();
		wrapper.like(StrUtil.isNotBlank(aiFunc.getFuncName()), AiFuncEntity::getFuncName, aiFunc.getFuncName());
		wrapper.like(StrUtil.isNotBlank(aiFunc.getFuncTitle()), AiFuncEntity::getFuncTitle, aiFunc.getFuncTitle());
		return R.ok(aiFuncService.page(page, wrapper));
	}

	/**
	 * 通过条件查询AI功能
	 * @param aiFunc 查询条件
	 * @return R 对象列表
	 */
	@Operation(summary = "通过条件查询", description = "通过条件查询对象")
	@GetMapping("/details")
	@PreAuthorize("@pms.hasPermission('knowledge_aiFunc_view')")
	public R getDetails(@ParameterObject AiFuncEntity aiFunc) {
		return R.ok(aiFuncService.list(Wrappers.query(aiFunc)));
	}

	/**
	 * 新增AI功能
	 * @param aiFunc AI功能
	 * @return R
	 */
	@Operation(summary = "新增AI功能", description = "新增AI功能")
	@SysLog("新增AI功能")
	@PostMapping
	@PreAuthorize("@pms.hasPermission('knowledge_aiFunc_add')")
	public R save(@RequestBody AiFuncEntity aiFunc) {
		return R.ok(aiFuncService.saveOrUpdateFunc(aiFunc));
	}

	/**
	 * 脚本检查
	 * @param functionDTO AI 函数
	 * @return {@link R }
	 */
	@Operation(summary = "脚本检查", description = "脚本检查")
	@PostMapping("/scriptCheck")
	@PreAuthorize("@pms.hasPermission('knowledge_aiFunc_add')")
	public R scriptCheck(@RequestBody FunctionDTO functionDTO) {
		return aiFuncService.checkScript(functionDTO);
	}

	/**
	 * 通过id删除AI功能
	 * @param ids id列表
	 * @return R
	 */
	@Operation(summary = "通过id删除AI功能", description = "通过id删除AI功能")
	@SysLog("通过id删除AI功能")
	@DeleteMapping
	@PreAuthorize("@pms.hasPermission('knowledge_aiFunc_del')")
	public R removeById(@RequestBody Long[] ids) {
		return R.ok(aiFuncService.removeFuncs(ids));
	}

	/**
	 * 导出excel 表格
	 * @param aiFunc 查询条件
	 * @param ids 导出指定ID
	 * @return excel 文件流
	 */
	@ResponseExcel
	@GetMapping("/export")
	@PreAuthorize("@pms.hasPermission('knowledge_aiFunc_export')")
	public List<AiFuncEntity> export(AiFuncEntity aiFunc, Long[] ids) {
		return aiFuncService.list(Wrappers.lambdaQuery(aiFunc).in(ArrayUtil.isNotEmpty(ids), AiFuncEntity::getId, ids));
	}

	/**
	 * Handles a GET request to get all the functions.
	 *
	 * @return map function name and function description
	 */
	@GetMapping("/functions")
	public R getAllFunction() {
		return aiFuncService.listFunctionCalling();
	}

}
