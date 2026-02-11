package cn.joywon.poco.knowledge.controller;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.ArrayUtil;
import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.excel.annotation.ResponseExcel;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.common.security.annotation.Inner;
import cn.joywon.poco.knowledge.entity.AiModelEntity;
import cn.joywon.poco.knowledge.service.AiModelService;
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
 * 模型配置
 *
 * @author poco
 * @date 2024-09-27 23:37:54
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/aiModel")
@Tag(description = "aiModel", name = "模型配置管理")
@SecurityRequirement(name = HttpHeaders.AUTHORIZATION)
public class AiModelController {

    private final AiModelService aiModelService;

    /**
     * 分页查询
     *
     * @param page    分页对象
     * @param aiModel 模型配置
     * @return
     */
    @Operation(summary = "分页查询", description = "分页查询")
    @GetMapping("/page")
    @PreAuthorize("@pms.hasPermission('knowledge_aiModel_view')")
    public R getAiModelPage(@ParameterObject Page page, @ParameterObject AiModelEntity aiModel) {
        return R.ok(aiModelService.page(page, Wrappers.<AiModelEntity>lambdaQuery()
                .eq(StrUtil.isNotBlank(aiModel.getModelType()), AiModelEntity::getModelType, aiModel.getModelType())));
    }

    /**
     * 列出 AI 模型页面
     *
     * @param aiModel AI 模型
     * @return {@link R }
     */
    @Inner(value = false)
    @Operation(summary = "列表查询", description = "列表查询")
    @GetMapping("/details")
    public R getDetails(@ParameterObject AiModelEntity aiModel) {
        // 如果是默认模型，则优先显示
        return R.ok(aiModelService.list(Wrappers.lambdaQuery(aiModel).orderByDesc(AiModelEntity::getDefaultModel)));
    }

    /**
     * 模型列表
     *
     * @param modelType 模式类型
     * @return {@link R }
     */
    @Operation(summary = "列表查询", description = "列表查询")
    @GetMapping("/list")
    public R list(String[] modelType) {
        return R.ok(aiModelService.list(Wrappers.lambdaQuery(AiModelEntity.class)
                .in(ArrayUtil.isNotEmpty(modelType), AiModelEntity::getModelType, modelType)
                .orderByDesc(AiModelEntity::getDefaultModel, AiModelEntity::getCreateTime))
        );
    }

    /**
     * 通过id查询模型配置
     *
     * @param id id
     * @return R
     */
    @Operation(summary = "通过id查询", description = "通过id查询")
    @GetMapping("/{id}")
    @PreAuthorize("@pms.hasPermission('knowledge_aiModel_view')")
    public R getById(@PathVariable("id") Long id) {
        return R.ok(aiModelService.getById(id));
    }

    /**
     * 新增模型配置
     *
     * @param aiModel 模型配置
     * @return R
     */
    @Operation(summary = "新增模型配置", description = "新增模型配置")
    @SysLog("新增模型配置")
    @PostMapping
    @PreAuthorize("@pms.hasPermission('knowledge_aiModel_add')")
    public R save(@RequestBody AiModelEntity aiModel) {
        return aiModelService.saveModel(aiModel);
    }

    /**
     * 修改模型配置
     *
     * @param aiModel 模型配置
     * @return R
     */
    @Operation(summary = "修改模型配置", description = "修改模型配置")
    @SysLog("修改模型配置")
    @PutMapping
    @PreAuthorize("@pms.hasPermission('knowledge_aiModel_edit')")
    public R updateById(@RequestBody AiModelEntity aiModel) {
        return aiModelService.updateModel(aiModel);
    }

    /**
     * 通过id删除模型配置
     *
     * @param ids id列表
     * @return R
     */
    @Operation(summary = "通过id删除模型配置", description = "通过id删除模型配置")
    @SysLog("通过id删除模型配置")
    @DeleteMapping
    @PreAuthorize("@pms.hasPermission('knowledge_aiModel_del')")
    public R removeById(@RequestBody Long[] ids) {
        return aiModelService.removeModel(CollUtil.toList(ids));
    }

    /**
     * 导出excel 表格
     *
     * @param aiModel 查询条件
     * @param ids     导出指定ID
     * @return excel 文件流
     */
    @ResponseExcel
    @GetMapping("/export")
    @PreAuthorize("@pms.hasPermission('knowledge_aiModel_export')")
    public List<AiModelEntity> export(AiModelEntity aiModel, Long[] ids) {
        return aiModelService
                .list(Wrappers.lambdaQuery(aiModel).in(ArrayUtil.isNotEmpty(ids), AiModelEntity::getId, ids));
    }

}
