package cn.joywon.poco.knowledge.controller;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.ArrayUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.excel.annotation.RequestExcel;
import cn.joywon.poco.common.excel.annotation.ResponseExcel;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.common.security.annotation.HasPermission;
import cn.joywon.poco.knowledge.entity.AiOcrConfEntity;
import cn.joywon.poco.knowledge.service.AiOcrConfService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.http.HttpHeaders;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * AI OCR
 *
 * @author poco
 * @date 2024-09-10 00:49:08
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/ocr")
@Tag(description = "ocr", name = "AI OCR管理")
@SecurityRequirement(name = HttpHeaders.AUTHORIZATION)
public class AiOcrConfController {

	private final AiOcrConfService aiOcrConfService;

	/**
	 * 分页查询
	 * @param page 分页对象
	 * @param aiOcrConf AI OCR
	 * @return
	 */
	@Operation(summary = "分页查询", description = "分页查询")
	@GetMapping("/page")
	@HasPermission("knowledge_ocr_view")
	public R getAiOcrConfPage(@ParameterObject Page page, @ParameterObject AiOcrConfEntity aiOcrConf) {
		LambdaQueryWrapper<AiOcrConfEntity> wrapper = Wrappers.lambdaQuery();
		return R.ok(aiOcrConfService.page(page, wrapper));
	}

	/**
	 * 通过条件查询AI OCR
	 * @param aiOcrConf 查询条件
	 * @return R 对象列表
	 */
	@Operation(summary = "通过条件查询", description = "通过条件查询对象")
	@GetMapping("/details")
	@HasPermission("knowledge_ocr_view")
	public R getDetails(@ParameterObject AiOcrConfEntity aiOcrConf) {
		return R.ok(aiOcrConfService.list(Wrappers.query(aiOcrConf)));
	}

	/**
	 * 新增AI OCR
	 * @param aiOcrConf AI OCR
	 * @return R
	 */
	@Operation(summary = "新增AI OCR", description = "新增AI OCR")
	@SysLog("新增AI OCR")
	@PostMapping
	@HasPermission("knowledge_ocr_add")
	public R save(@RequestBody AiOcrConfEntity aiOcrConf) {
		return R.ok(aiOcrConfService.save(aiOcrConf));
	}

	/**
	 * 修改AI OCR
	 * @param aiOcrConf AI OCR
	 * @return R
	 */
	@Operation(summary = "修改AI OCR", description = "修改AI OCR")
	@SysLog("修改AI OCR")
	@PutMapping
	@HasPermission("knowledge_ocr_edit")
	public R updateById(@RequestBody AiOcrConfEntity aiOcrConf) {
		return R.ok(aiOcrConfService.updateById(aiOcrConf));
	}

	/**
	 * 通过id删除AI OCR
	 * @param ids id列表
	 * @return R
	 */
	@Operation(summary = "通过id删除AI OCR", description = "通过id删除AI OCR")
	@SysLog("通过id删除AI OCR")
	@DeleteMapping
	@HasPermission("knowledge_ocr_del")
	public R removeById(@RequestBody Long[] ids) {
		return R.ok(aiOcrConfService.removeBatchByIds(CollUtil.toList(ids)));
	}

	/**
	 * 导出excel 表格
	 * @param aiOcrConf 查询条件
	 * @param ids 导出指定ID
	 * @return excel 文件流
	 */
	@ResponseExcel
	@GetMapping("/export")
	@HasPermission("knowledge_ocr_export")
	public List<AiOcrConfEntity> exportExcel(AiOcrConfEntity aiOcrConf, Long[] ids) {
		return aiOcrConfService
			.list(Wrappers.lambdaQuery(aiOcrConf).in(ArrayUtil.isNotEmpty(ids), AiOcrConfEntity::getId, ids));
	}

	/**
	 * 导入excel 表
	 * @param aiOcrConfList 对象实体列表
	 * @param bindingResult 错误信息列表
	 * @return ok fail
	 */
	@PostMapping("/import")
	@HasPermission("knowledge_ocr_export")
	public R importExcel(@RequestExcel List<AiOcrConfEntity> aiOcrConfList, BindingResult bindingResult) {
		return R.ok(aiOcrConfService.saveBatch(aiOcrConfList));
	}

	/**
	 * 解析 图片
	 * @param aiOcrConf AI OCR 会议
	 * @return {@link R }
	 */
	@Operation(summary = "解析图片", description = "调用OCR解析图片")
	@SysLog("解析图片")
	@PostMapping("/parse")
	@HasPermission("knowledge_ocr_add")
	public R parse(@RequestBody AiOcrConfEntity aiOcrConf) {
		return aiOcrConfService.parseImage(aiOcrConf);
	}

}
