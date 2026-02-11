package cn.joywon.poco.knowledge.controller;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.ArrayUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.excel.annotation.ResponseExcel;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.knowledge.entity.AiDataFieldEntity;
import cn.joywon.poco.knowledge.service.AiDataFieldService;
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
 * AI 字段管理表
 *
 * @author poco
 * @date 2025-03-26 21:49:03
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/aiDataField")
@Tag(description = "aiDataField", name = "AI 字段管理表管理")
@SecurityRequirement(name = HttpHeaders.AUTHORIZATION)
public class AiDataFieldController {

    private final AiDataFieldService aiDataFieldService;

    /**
     * 分页查询
     *
     * @param page        分页对象
     * @param aiDataField AI 字段管理表
     * @return
     */
    @Operation(summary = "分页查询", description = "分页查询")
    @GetMapping("/page")
    @PreAuthorize("@pms.hasPermission('knowledge_aiData_view')")
    public R getAiDataFieldPage(@ParameterObject Page page, @ParameterObject AiDataFieldEntity aiDataField) {
        LambdaQueryWrapper<AiDataFieldEntity> wrapper = Wrappers.lambdaQuery();
        return R.ok(aiDataFieldService.page(page, wrapper));
    }


    /**
     * 通过id查询AI 字段管理表
     *
     * @param fieldId id
     * @return R
     */
    @Operation(summary = "通过id查询", description = "通过id查询")
    @GetMapping("/{fieldId}")
    @PreAuthorize("@pms.hasPermission('knowledge_aiData_view')")
    public R getById(@PathVariable("fieldId") Long fieldId) {
        return R.ok(aiDataFieldService.getById(fieldId));
    }

    /**
     * 新增AI 字段管理表
     *
     * @param aiDataField AI 字段管理表
     * @return R
     */
    @Operation(summary = "新增AI 字段管理表", description = "新增AI 字段管理表")
    @SysLog("新增AI 字段管理表")
    @PostMapping
    @PreAuthorize("@pms.hasPermission('knowledge_aiData_add')")
    public R save(@RequestBody AiDataFieldEntity aiDataField) {
        return R.ok(aiDataFieldService.save(aiDataField));
    }

    /**
     * 修改AI 字段管理表
     *
     * @param aiDataField AI 字段管理表
     * @return R
     */
    @Operation(summary = "修改AI 字段管理表", description = "修改AI 字段管理表")
    @SysLog("修改AI 字段管理表")
    @PutMapping
    @PreAuthorize("@pms.hasPermission('knowledge_aiData_edit')")
    public R updateById(@RequestBody AiDataFieldEntity aiDataField) {
        return R.ok(aiDataFieldService.updateById(aiDataField));
    }

    /**
     * 通过id删除AI 字段管理表
     *
     * @param ids fieldId列表
     * @return R
     */
    @Operation(summary = "通过id删除AI 字段管理表", description = "通过id删除AI 字段管理表")
    @SysLog("通过id删除AI 字段管理表")
    @DeleteMapping
    @PreAuthorize("@pms.hasPermission('knowledge_aiData_del')")
    public R removeById(@RequestBody Long[] ids) {
        return R.ok(aiDataFieldService.removeBatchByIds(CollUtil.toList(ids)));
    }


    /**
     * 导出excel 表格
     *
     * @param aiDataField 查询条件
     * @param ids         导出指定ID
     * @return excel 文件流
     */
    @ResponseExcel
    @GetMapping("/export")
    @PreAuthorize("@pms.hasPermission('knowledge_aiData_export')")
    public List<AiDataFieldEntity> export(AiDataFieldEntity aiDataField, Long[] ids) {
        return aiDataFieldService.list(Wrappers.lambdaQuery(aiDataField).in(ArrayUtil.isNotEmpty(ids), AiDataFieldEntity::getFieldId, ids));
    }


    /**
     * 获取
     *
     * @param dsName    DS 名称
     * @param tableName 表名字
     * @return {@link R }
     */
    @Operation(summary = "通过table 获取字段", description = "如果没有的话则会初始化")
    @SysLog("获取字段")
    @GetMapping("/table/{dsName}/{tableName}")
    public R get(@PathVariable String dsName, @PathVariable String tableName) {
        return R.ok(aiDataFieldService.getOrSync(dsName, tableName));
    }

    /**
     * 同步字段
     *
     * @param dsName    DS 名称
     * @param tableName 表名字
     * @return {@link R }
     */
    @SysLog("同步字段")
    @PostMapping("/sync/{dsName}/{tableName}")
    @PreAuthorize("@pms.hasPermission('knowledge_aiData_del')")
    public R syncTableField(@PathVariable String dsName, @PathVariable String tableName) {
        return R.ok(aiDataFieldService.syncTableField(dsName, tableName));
    }

    /**
     * 批量保存
     *
     * @param aiDataField
     * @return {@link R }
     */
    @Operation(summary = "批量更新", description = "批量更新")
    @SysLog("批量更新")
    @PutMapping("/batch")
    @PreAuthorize("@pms.hasPermission('knowledge_aiData_del')")
    public R batchSave(@RequestBody List<AiDataFieldEntity> aiDataField) {
        return R.ok(aiDataFieldService.saveOrUpdateBatch(aiDataField));
    }


    /**
     * 评估
     *
     * @param dsName    DS 名称
     * @param tableName 表名字
     * @return {@link R }
     */
    @Operation(summary = "字段评估")
    @SysLog("字段评估")
    @PostMapping("/assess/{dsName}/{tableName}")
    @PreAuthorize("@pms.hasPermission('knowledge_aiData_del')")
    public R assess(@PathVariable String dsName, @PathVariable String tableName) {
        aiDataFieldService.assessTableField(dsName, tableName);
        return R.ok();
    }
}
