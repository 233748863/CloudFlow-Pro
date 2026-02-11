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
import cn.joywon.poco.knowledge.entity.AiEmbedStoreEntity;
import cn.joywon.poco.knowledge.service.AiEmbedStoreService;
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
 * 向量库配置
 *
 * @author poco
 * @date 2025-02-11 15:07:46
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/aiEmbedStore")
@Tag(description = "aiEmbedStore", name = "向量库配置管理")
@SecurityRequirement(name = HttpHeaders.AUTHORIZATION)
public class AiEmbedStoreController {

	private final AiEmbedStoreService aiEmbedStoreService;

	/**
	 * 分页查询
	 * @param page 分页对象
	 * @param aiEmbedStore 向量库配置
	 * @return
	 */
	@Operation(summary = "分页查询", description = "分页查询")
	@GetMapping("/page")
	@PreAuthorize("@pms.hasPermission('knowledge_aiEmbedStore_view')")
	public R getAiEmbedStorePage(@ParameterObject Page page, @ParameterObject AiEmbedStoreEntity aiEmbedStore) {
		LambdaQueryWrapper<AiEmbedStoreEntity> wrapper = Wrappers.lambdaQuery();
		wrapper.like(StrUtil.isNotBlank(aiEmbedStore.getName()), AiEmbedStoreEntity::getName, aiEmbedStore.getName());
		wrapper.eq(StrUtil.isNotBlank(aiEmbedStore.getStoreType()), AiEmbedStoreEntity::getStoreType,
				aiEmbedStore.getStoreType());
		return R.ok(aiEmbedStoreService.page(page, wrapper));
	}

	/**
	 * 获取详细信息
	 * @param query 查询
	 * @return {@link R }
	 */
	@Operation(summary = "获取详细信息", description = "获取详细信息")
	@GetMapping("/details")
	@PreAuthorize("@pms.hasPermission('knowledge_aiEmbedStore_view')")
	public R getDetails(@ParameterObject AiEmbedStoreEntity query) {
		return R.ok(aiEmbedStoreService.getOne(Wrappers.query(query), false));
	}

	@Operation(summary = "获取详细信息", description = "获取详细信息")
	@GetMapping("/list")
	@PreAuthorize("@pms.hasPermission('knowledge_aiEmbedStore_view')")
	public R list() {
		return R.ok(aiEmbedStoreService.list());
	}

	/**
	 * 新增向量库配置
	 * @param aiEmbedStore 向量库配置
	 * @return R
	 */
	@Operation(summary = "新增向量库配置", description = "新增向量库配置")
	@SysLog("新增向量库配置")
	@PostMapping
	@PreAuthorize("@pms.hasPermission('knowledge_aiEmbedStore_add')")
	public R save(@RequestBody AiEmbedStoreEntity aiEmbedStore) {
		return R.ok(aiEmbedStoreService.save(aiEmbedStore));
	}

	/**
	 * 修改向量库配置
	 * @param aiEmbedStore 向量库配置
	 * @return R
	 */
	@Operation(summary = "修改向量库配置", description = "修改向量库配置")
	@SysLog("修改向量库配置")
	@PutMapping
	@PreAuthorize("@pms.hasPermission('knowledge_aiEmbedStore_edit')")
	public R updateById(@RequestBody AiEmbedStoreEntity aiEmbedStore) {
		return R.ok(aiEmbedStoreService.updateEmbedStore(aiEmbedStore));
	}

	/**
	 * 通过id删除向量库配置
	 * @param ids storeId列表
	 * @return R
	 */
	@Operation(summary = "通过id删除向量库配置", description = "通过id删除向量库配置")
	@SysLog("通过id删除向量库配置")
	@DeleteMapping
	@PreAuthorize("@pms.hasPermission('knowledge_aiEmbedStore_del')")
	public R removeById(@RequestBody Long[] ids) {
		return R.ok(aiEmbedStoreService.removeBatchByIds(CollUtil.toList(ids)));
	}

	/**
	 * 导出excel 表格
	 * @param aiEmbedStore 查询条件
	 * @param ids 导出指定ID
	 * @return excel 文件流
	 */
	@ResponseExcel
	@GetMapping("/export")
	@PreAuthorize("@pms.hasPermission('knowledge_aiEmbedStore_export')")
	public List<AiEmbedStoreEntity> export(AiEmbedStoreEntity aiEmbedStore, Long[] ids) {
		return aiEmbedStoreService.list(
				Wrappers.lambdaQuery(aiEmbedStore).in(ArrayUtil.isNotEmpty(ids), AiEmbedStoreEntity::getStoreId, ids));
	}

}
