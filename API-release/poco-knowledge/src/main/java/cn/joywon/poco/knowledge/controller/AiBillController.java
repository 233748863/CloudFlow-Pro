package cn.joywon.poco.knowledge.controller;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.ArrayUtil;
import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.excel.annotation.ResponseExcel;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.common.security.annotation.HasPermission;
import cn.joywon.poco.knowledge.entity.AiBillEntity;
import cn.joywon.poco.knowledge.service.AiBillService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 账单
 *
 * @author pig
 * @date 2024-03-26 11:26:59
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/aiBill")
@Tag(description = "aiBill", name = "账单管理")
@SecurityRequirement(name = HttpHeaders.AUTHORIZATION)
public class AiBillController {

	private final AiBillService aiBillService;

	/**
	 * 分页查询
	 * @param page 分页对象
	 * @param aiBill 账单
	 * @return
	 */
	@Operation(summary = "分页查询", description = "分页查询")
	@GetMapping("/page")
	@HasPermission("knowledge_aiBill_view")
	public R getAiBillPage(@ParameterObject Page page, @ParameterObject AiBillEntity aiBill) {
		LambdaQueryWrapper<AiBillEntity> wrapper = Wrappers.lambdaQuery();
		wrapper.eq(StrUtil.isNotBlank(aiBill.getUsername()), AiBillEntity::getUsername, aiBill.getUsername());
		wrapper.eq(StrUtil.isNotBlank(aiBill.getTokenType()), AiBillEntity::getTokenType, aiBill.getTokenType());
		return R.ok(aiBillService.page(page, wrapper));
	}

	/**
	 * 通过id查询账单
	 * @param id id
	 * @return R
	 */
	@Operation(summary = "通过id查询", description = "通过id查询")
	@GetMapping("/{id}")
	@HasPermission("knowledge_aiBill_view")
	public R getById(@PathVariable("id") Long id) {
		return R.ok(aiBillService.getById(id));
	}

	/**
	 * 新增账单
	 * @param aiBill 账单
	 * @return R
	 */
	@Operation(summary = "新增账单", description = "新增账单")
	@SysLog("新增账单")
	@PostMapping
	@HasPermission("knowledge_aiBill_add")
	public R save(@RequestBody AiBillEntity aiBill) {
		return R.ok(aiBillService.save(aiBill));
	}

	/**
	 * 修改账单
	 * @param aiBill 账单
	 * @return R
	 */
	@Operation(summary = "修改账单", description = "修改账单")
	@SysLog("修改账单")
	@PutMapping
	@HasPermission("knowledge_aiBill_edit")
	public R updateById(@RequestBody AiBillEntity aiBill) {
		return R.ok(aiBillService.updateById(aiBill));
	}

	/**
	 * 通过id删除账单
	 * @param ids id列表
	 * @return R
	 */
	@Operation(summary = "通过id删除账单", description = "通过id删除账单")
	@SysLog("通过id删除账单")
	@DeleteMapping
	@HasPermission("knowledge_aiBill_del")
	public R removeById(@RequestBody Long[] ids) {
		return R.ok(aiBillService.removeBatchByIds(CollUtil.toList(ids)));
	}

	/**
	 * 导出excel 表格
	 * @param aiBill 查询条件
	 * @param ids 导出指定ID
	 * @return excel 文件流
	 */
	@ResponseExcel
	@GetMapping("/export")
	@HasPermission("knowledge_aiBill_export")
	public List<AiBillEntity> export(AiBillEntity aiBill, Long[] ids) {
		return aiBillService.list(Wrappers.lambdaQuery(aiBill).in(ArrayUtil.isNotEmpty(ids), AiBillEntity::getId, ids));
	}

	/**
	 * 统计三十天内的数据
	 * @return R
	 */
	@GetMapping("/sum")
	public R getBillSum() {
		return R.ok(aiBillService.getBillSum());
	}

}
