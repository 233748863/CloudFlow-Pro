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
import cn.joywon.poco.knowledge.entity.AiDataEntity;
import cn.joywon.poco.knowledge.service.AiDataService;
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
 * AI 数据集管理表
 *
 * @author poco
 * @date 2025-03-26 21:47:45
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/aiData")
@Tag(description = "aiData", name = "AI 数据集管理表管理")
@SecurityRequirement(name = HttpHeaders.AUTHORIZATION)
public class AiDataController {

    private final AiDataService aiDataService;

    /**
     * 分页查询
     *
     * @param page   分页对象
     * @param aiData AI 数据集管理表
     * @return
     */
    @Operation(summary = "分页查询", description = "分页查询")
    @GetMapping("/page")
    @PreAuthorize("@pms.hasPermission('knowledge_aiData_view')")
    public R getAiDataPage(@ParameterObject Page page, @ParameterObject AiDataEntity aiData) {
        LambdaQueryWrapper<AiDataEntity> wrapper = Wrappers.lambdaQuery();
        wrapper.like(StrUtil.isNotBlank(aiData.getDatasetName()), AiDataEntity::getDatasetName, aiData.getDatasetName());
        return R.ok(aiDataService.page(page, wrapper));
    }


    /**
     * 通过id查询AI 数据集管理表
     *
     * @param dataId id
     * @return R
     */
    @Operation(summary = "通过id查询", description = "通过id查询")
    @GetMapping("/{dataId}")
    @PreAuthorize("@pms.hasPermission('knowledge_aiData_view')")
    public R getById(@PathVariable("dataId") Long dataId) {
        return R.ok(aiDataService.getById(dataId));
    }

    /**
     * 新增AI 数据集管理表
     *
     * @param aiData AI 数据集管理表
     * @return R
     */
    @Operation(summary = "新增AI 数据集管理表", description = "新增AI 数据集管理表")
    @SysLog("新增AI 数据集管理表")
    @PostMapping
    @PreAuthorize("@pms.hasPermission('knowledge_aiData_add')")
    public R save(@RequestBody AiDataEntity aiData) {
        return R.ok(aiDataService.saveOrUpdateData(aiData));
    }

    /**
     * 修改AI 数据集管理表
     *
     * @param aiData AI 数据集管理表
     * @return R
     */
    @Operation(summary = "修改AI 数据集管理表", description = "修改AI 数据集管理表")
    @SysLog("修改AI 数据集管理表")
    @PutMapping
    @PreAuthorize("@pms.hasPermission('knowledge_aiData_edit')")
    public R updateById(@RequestBody AiDataEntity aiData) {
        return R.ok(aiDataService.saveOrUpdateData(aiData));
    }

    /**
     * 通过id删除AI 数据集管理表
     *
     * @param ids dataId列表
     * @return R
     */
    @Operation(summary = "通过id删除AI 数据集管理表", description = "通过id删除AI 数据集管理表")
    @SysLog("通过id删除AI 数据集管理表")
    @DeleteMapping
    @PreAuthorize("@pms.hasPermission('knowledge_aiData_del')")
    public R removeById(@RequestBody Long[] ids) {
        return R.ok(aiDataService.removeBatchByIds(CollUtil.toList(ids)));
    }


    /**
     * 导出excel 表格
     *
     * @param aiData 查询条件
     * @param ids    导出指定ID
     * @return excel 文件流
     */
    @ResponseExcel
    @GetMapping("/export")
    @PreAuthorize("@pms.hasPermission('knowledge_aiData_export')")
    public List<AiDataEntity> export(AiDataEntity aiData, Long[] ids) {
        return aiDataService.list(Wrappers.lambdaQuery(aiData).in(ArrayUtil.isNotEmpty(ids), AiDataEntity::getDataId, ids));
    }
}
