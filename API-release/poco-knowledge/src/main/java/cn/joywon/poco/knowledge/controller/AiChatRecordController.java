package cn.joywon.poco.knowledge.controller;

import cn.hutool.core.util.ArrayUtil;
import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.github.yulichang.wrapper.MPJLambdaWrapper;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.excel.annotation.ResponseExcel;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.common.security.annotation.HasPermission;
import cn.joywon.poco.knowledge.entity.AiChatRecordEntity;
import cn.joywon.poco.knowledge.entity.AiDatasetEntity;
import cn.joywon.poco.knowledge.service.AiChatRecordService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Objects;

/**
 * 聊天记录
 *
 * @author pig
 * @date 2024-07-03 12:39:32
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/aiChatRecord")
@Tag(description = "aiChatRecord", name = "聊天记录管理")
@SecurityRequirement(name = HttpHeaders.AUTHORIZATION)
public class AiChatRecordController {

	private final AiChatRecordService aiChatRecordService;

	/**
	 * 分页查询
	 * @param page 分页对象
	 * @param aiChatRecord 聊天记录
	 * @return
	 */
	@Operation(summary = "分页查询", description = "分页查询")
	@GetMapping("/page")
	@HasPermission("knowledge_aiChatRecord_view")
	public R getAiChatRecordPage(@ParameterObject Page page, @ParameterObject AiChatRecordEntity aiChatRecord) {
		MPJLambdaWrapper<AiChatRecordEntity> wrapper = new MPJLambdaWrapper<AiChatRecordEntity>()
			.selectAll(AiChatRecordEntity.class)
			.selectAs(AiDatasetEntity::getName, AiChatRecordEntity.Fields.datasetName)
			.leftJoin(AiDatasetEntity.class, AiDatasetEntity::getId, AiChatRecordEntity::getDatasetId);
		wrapper.like(StrUtil.isNotBlank(aiChatRecord.getUsername()), AiChatRecordEntity::getUsername,
				aiChatRecord.getUsername());
		wrapper.like(StrUtil.isNotBlank(aiChatRecord.getQuestionText()), AiChatRecordEntity::getQuestionText,
				aiChatRecord.getQuestionText());
		wrapper.eq(StrUtil.isNotBlank(aiChatRecord.getStandardFlag()), AiChatRecordEntity::getStandardFlag,
				aiChatRecord.getStandardFlag());
		wrapper.eq(StrUtil.isNotBlank(aiChatRecord.getLlmFlag()), AiChatRecordEntity::getLlmFlag,
				aiChatRecord.getLlmFlag());
		wrapper.eq(Objects.nonNull(aiChatRecord.getDatasetId()), AiChatRecordEntity::getDatasetId,
				aiChatRecord.getDatasetId());
		wrapper.isNotNull(AiDatasetEntity::getName);
		return R.ok(aiChatRecordService.page(page, wrapper));
	}

	/**
	 * 通过id查询聊天记录
	 * @param id id
	 * @return R
	 */
	@Operation(summary = "通过id查询", description = "通过id查询")
	@GetMapping("/{id}")
	@HasPermission("knowledge_aiChatRecord_view")
	public R getById(@PathVariable("id") Long id) {
		return R.ok(aiChatRecordService.getById(id));
	}

	/**
	 * 新增聊天记录
	 * @param aiChatRecord 聊天记录
	 * @return R
	 */
	@Operation(summary = "新增聊天记录", description = "新增聊天记录")
	@SysLog("新增聊天记录")
	@PostMapping
	@HasPermission("knowledge_aiChatRecord_add")
	public R save(@RequestBody AiChatRecordEntity aiChatRecord) {
		return R.ok(aiChatRecordService.save(aiChatRecord));
	}

	/**
	 * 修改聊天记录
	 * @param aiChatRecord 聊天记录
	 * @return R
	 */
	@Operation(summary = "修改聊天记录", description = "修改聊天记录")
	@SysLog("修改聊天记录")
	@PutMapping
	@HasPermission("knowledge_aiChatRecord_edit")
	public R updateById(@Valid @RequestBody AiChatRecordEntity aiChatRecord) {
		return aiChatRecordService.updateAndStandardRecord(aiChatRecord);
	}

	/**
	 * 通过id删除聊天记录
	 * @param ids id列表
	 * @return R
	 */
	@Operation(summary = "通过id删除聊天记录", description = "通过id删除聊天记录")
	@SysLog("通过id删除聊天记录")
	@DeleteMapping
	@HasPermission("knowledge_aiChatRecord_del")
	public R removeById(@RequestBody Long[] ids) {
		return aiChatRecordService.removeRecordAndStandardByIds(ids);
	}

	/**
	 * 导出excel 表格
	 * @param aiChatRecord 查询条件
	 * @param ids 导出指定ID
	 * @return excel 文件流
	 */
	@ResponseExcel
	@GetMapping("/export")
	@HasPermission("knowledge_aiChatRecord_export")
	public List<AiChatRecordEntity> export(AiChatRecordEntity aiChatRecord, Long[] ids) {
		return aiChatRecordService.list(
				Wrappers.lambdaQuery(aiChatRecord).in(ArrayUtil.isNotEmpty(ids), AiChatRecordEntity::getRecordId, ids));
	}

}
