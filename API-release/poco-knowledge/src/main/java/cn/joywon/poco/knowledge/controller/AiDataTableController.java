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
import cn.joywon.poco.knowledge.entity.AiDataTableEntity;
import cn.joywon.poco.knowledge.service.AiDataTableService;
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
 * AI  数据表管理表
 *
 * @author poco
 * @date 2025-03-26 21:48:16
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/aiDataTable")
@Tag(description = "aiDataTable", name = "AI  数据表管理表管理")
@SecurityRequirement(name = HttpHeaders.AUTHORIZATION)
public class AiDataTableController {

    private final AiDataTableService aiDataTableService;

    /**
     * 分页查询
     *
     * @param page        分页对象
     * @param aiDataTable AI  数据表管理表
     * @return
     */
    @Operation(summary = "分页查询", description = "分页查询")
    @GetMapping("/page")
    @PreAuthorize("@pms.hasPermission('knowledge_aiDataTable_view')")
    public R getAiDataTablePage(@ParameterObject Page page, @ParameterObject AiDataTableEntity aiDataTable) {
        LambdaQueryWrapper<AiDataTableEntity> wrapper = Wrappers.lambdaQuery();
        wrapper.eq(StrUtil.isNotBlank(aiDataTable.getDsName()), AiDataTableEntity::getDsName, aiDataTable.getDsName())
                .like(StrUtil.isNotBlank(aiDataTable.getTableName()), AiDataTableEntity::getTableName, aiDataTable.getTableName())
                .or()
                .like(StrUtil.isNotBlank(aiDataTable.getTableComment()), AiDataTableEntity::getTableComment, aiDataTable.getTableName());
        return R.ok(aiDataTableService.page(page, wrapper));
    }

    /**
     * 查询所有同步的表
     *
     * @param aiDataTable 人工智能数据表
     * @return {@link R }
     */
    @Operation(summary = "列表查询", description = "列表查询所有已经同步的表")
    @GetMapping("/list")
    @PreAuthorize("@pms.hasPermission('knowledge_aiDataTable_view')")
    public R listTable(@ParameterObject AiDataTableEntity aiDataTable) {
        return R.ok(aiDataTableService.list(Wrappers.<AiDataTableEntity>lambdaQuery()
                .eq(StrUtil.isNotBlank(aiDataTable.getDsName()), AiDataTableEntity::getDsName, aiDataTable.getDsName())));
    }

    /**
     * 通过id查询AI  数据表管理表
     *
     * @param tableId id
     * @return R
     */
    @Operation(summary = "通过id查询", description = "通过id查询")
    @GetMapping("/{tableId}")
    @PreAuthorize("@pms.hasPermission('knowledge_aiDataTable_view')")
    public R getById(@PathVariable("tableId") Long tableId) {
        return R.ok(aiDataTableService.getById(tableId));
    }

    /**
     * 新增AI  数据表管理表
     *
     * @param aiDataTable AI  数据表管理表
     * @return R
     */
    @Operation(summary = "新增AI  数据表管理表", description = "新增AI  数据表管理表")
    @SysLog("新增AI  数据表管理表")
    @PostMapping
    @PreAuthorize("@pms.hasPermission('knowledge_aiDataTable_add')")
    public R save(@RequestBody AiDataTableEntity aiDataTable) {
        return R.ok(aiDataTableService.save(aiDataTable));
    }

    /**
     * 修改AI  数据表管理表
     *
     * @param aiDataTable AI  数据表管理表
     * @return R
     */
    @Operation(summary = "修改AI  数据表管理表", description = "修改AI  数据表管理表")
    @SysLog("修改AI  数据表管理表")
    @PutMapping
    @PreAuthorize("@pms.hasPermission('knowledge_aiDataTable_edit')")
    public R updateById(@RequestBody AiDataTableEntity aiDataTable) {
        return R.ok(aiDataTableService.updateById(aiDataTable));
    }

    /**
     * 通过id删除AI  数据表管理表
     *
     * @param ids tableId列表
     * @return R
     */
    @Operation(summary = "通过id删除AI  数据表管理表", description = "通过id删除AI  数据表管理表")
    @SysLog("通过id删除AI  数据表管理表")
    @DeleteMapping
    @PreAuthorize("@pms.hasPermission('knowledge_aiDataTable_del')")
    public R removeById(@RequestBody Long[] ids) {
        return R.ok(aiDataTableService.removeBatchByIds(CollUtil.toList(ids)));
    }


    /**
     * 导出excel 表格
     *
     * @param aiDataTable 查询条件
     * @param ids         导出指定ID
     * @return excel 文件流
     */
    @ResponseExcel
    @GetMapping("/export")
    @PreAuthorize("@pms.hasPermission('knowledge_aiDataTable_export')")
    public List<AiDataTableEntity> export(AiDataTableEntity aiDataTable, Long[] ids) {
        return aiDataTableService.list(Wrappers.lambdaQuery(aiDataTable).in(ArrayUtil.isNotEmpty(ids), AiDataTableEntity::getTableId, ids));
    }

    @Operation(summary = "同步数据表", description = "通过开发平台数据源里面的表，方便数据集使用")
    @SysLog("同步数据表")
    @PostMapping("/sync")
    @PreAuthorize("@pms.hasPermission('knowledge_aiDataTable_del')")
    public R sync() {
        return R.ok(aiDataTableService.sync());
    }
}
