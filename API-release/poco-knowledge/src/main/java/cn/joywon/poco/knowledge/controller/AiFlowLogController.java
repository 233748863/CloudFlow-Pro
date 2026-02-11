package cn.joywon.poco.knowledge.controller;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.ArrayUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.excel.annotation.ResponseExcel;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.knowledge.entity.AiFlowLogEntity;
import cn.joywon.poco.knowledge.service.AiFlowLogService;
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
 * 大模型流程日志表
 *
 * @author poco
 * @date 2025-03-03 10:21:15
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/aiFlowLog")
@Tag(description = "aiFlowLog", name = "大模型流程日志表管理")
@SecurityRequirement(name = HttpHeaders.AUTHORIZATION)
public class AiFlowLogController {

    private final AiFlowLogService aiFlowLogService;

    /**
     * 分页查询
     *
     * @param page      分页对象
     * @param aiFlowLog 大模型流程日志表
     * @return
     */
    @Operation(summary = "分页查询", description = "分页查询")
    @GetMapping("/page")
    @PreAuthorize("@pms.hasPermission('knowledge_aiFlowLog_view')")
    public R getAiFlowLogPage(@ParameterObject Page page, @ParameterObject AiFlowLogEntity aiFlowLog) {
        LambdaQueryWrapper<AiFlowLogEntity> wrapper = Wrappers.lambdaQuery();
        return R.ok(aiFlowLogService.page(page, wrapper));
    }


    /**
     * 通过id查询大模型流程日志表
     *
     * @param id id
     * @return R
     */
    @Operation(summary = "通过id查询", description = "通过id查询")
    @GetMapping("/{id}")
    @PreAuthorize("@pms.hasPermission('knowledge_aiFlowLog_view')")
    public R getById(@PathVariable("id") Long id) {
        return R.ok(aiFlowLogService.getById(id));
    }

    /**
     * 新增大模型流程日志表
     *
     * @param aiFlowLog 大模型流程日志表
     * @return R
     */
    @Operation(summary = "新增大模型流程日志表", description = "新增大模型流程日志表")
    @SysLog("新增大模型流程日志表")
    @PostMapping
    @PreAuthorize("@pms.hasPermission('knowledge_aiFlowLog_add')")
    public R save(@RequestBody AiFlowLogEntity aiFlowLog) {
        return R.ok(aiFlowLogService.save(aiFlowLog));
    }

    /**
     * 修改大模型流程日志表
     *
     * @param aiFlowLog 大模型流程日志表
     * @return R
     */
    @Operation(summary = "修改大模型流程日志表", description = "修改大模型流程日志表")
    @SysLog("修改大模型流程日志表")
    @PutMapping
    @PreAuthorize("@pms.hasPermission('knowledge_aiFlowLog_edit')")
    public R updateById(@RequestBody AiFlowLogEntity aiFlowLog) {
        return R.ok(aiFlowLogService.updateById(aiFlowLog));
    }

    /**
     * 通过id删除大模型流程日志表
     *
     * @param ids id列表
     * @return R
     */
    @Operation(summary = "通过id删除大模型流程日志表", description = "通过id删除大模型流程日志表")
    @SysLog("通过id删除大模型流程日志表")
    @DeleteMapping
    @PreAuthorize("@pms.hasPermission('knowledge_aiFlowLog_del')")
    public R removeById(@RequestBody Long[] ids) {
        return R.ok(aiFlowLogService.removeBatchByIds(CollUtil.toList(ids)));
    }


    /**
     * 导出excel 表格
     *
     * @param aiFlowLog 查询条件
     * @param ids       导出指定ID
     * @return excel 文件流
     */
    @ResponseExcel
    @GetMapping("/export")
    @PreAuthorize("@pms.hasPermission('knowledge_aiFlowLog_export')")
    public List<AiFlowLogEntity> export(AiFlowLogEntity aiFlowLog, Long[] ids) {
        return aiFlowLogService.list(Wrappers.lambdaQuery(aiFlowLog).in(ArrayUtil.isNotEmpty(ids), AiFlowLogEntity::getId, ids));
    }
}
