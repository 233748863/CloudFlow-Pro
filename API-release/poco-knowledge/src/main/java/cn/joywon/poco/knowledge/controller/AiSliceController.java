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
import cn.joywon.poco.knowledge.entity.AiDocumentEntity;
import cn.joywon.poco.knowledge.entity.AiSliceEntity;
import cn.joywon.poco.knowledge.service.AiDocumentService;
import cn.joywon.poco.knowledge.service.AiSliceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Objects;

/**
 * 知识切片
 *
 * @author pig
 * @date 2024-03-14 13:39:40
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/aiSlice")
@Tag(description = "aiSlice", name = "知识切片管理")
@SecurityRequirement(name = HttpHeaders.AUTHORIZATION)
public class AiSliceController {

    private final AiSliceService aiSliceService;

    private final AiDocumentService documentService;

    /**
     * 分页查询
     *
     * @param page    分页对象
     * @param aiSlice 知识切片
     * @return
     */
    @Operation(summary = "分页查询", description = "分页查询")
    @GetMapping("/page")
    @HasPermission("knowledge_aiSlice_view")
    public R getAiSlicePage(@ParameterObject Page page, @ParameterObject AiSliceEntity aiSlice,
                            @ParameterObject Long datasetId) {
        LambdaQueryWrapper<AiSliceEntity> wrapper = Wrappers.lambdaQuery();
        wrapper.eq(Objects.nonNull(aiSlice.getDocumentId()), AiSliceEntity::getDocumentId, aiSlice.getDocumentId());
        wrapper.like(StrUtil.isNotBlank(aiSlice.getName()), AiSliceEntity::getName, aiSlice.getName());
        wrapper.like(StrUtil.isNotBlank(aiSlice.getSliceStatus()), AiSliceEntity::getSliceStatus,
                aiSlice.getSliceStatus());
        wrapper.like(StrUtil.isNotBlank(aiSlice.getContent()), AiSliceEntity::getContent, aiSlice.getContent());
        wrapper.orderByDesc(AiSliceEntity::getHitCount);

        if (Objects.nonNull(datasetId)) {
            List<Long> list = documentService
                    .list(Wrappers.<AiDocumentEntity>lambdaQuery().eq(AiDocumentEntity::getDatasetId, datasetId))
                    .stream()
                    .map(AiDocumentEntity::getId)
                    .toList();
            wrapper.in(CollUtil.isNotEmpty(list), AiSliceEntity::getDocumentId, list);
        }

        return R.ok(aiSliceService.page(page, wrapper));
    }

    /**
     * 通过id查询知识切片
     *
     * @param id id
     * @return R
     */
    @Operation(summary = "通过id查询", description = "通过id查询")
    @GetMapping("/{id}")
    @HasPermission("knowledge_aiSlice_view")
    public R getById(@PathVariable("id") Long id) {
        return R.ok(aiSliceService.getById(id));
    }

    /**
     * 新增知识切片
     *
     * @param aiSlice 知识切片
     * @return R
     */
    @Operation(summary = "新增知识切片", description = "新增知识切片")
    @SysLog("新增知识切片")
    @PostMapping
    @HasPermission("knowledge_aiSlice_add")
    public R save(@RequestBody AiSliceEntity aiSlice) {
        return R.ok(aiSliceService.save(aiSlice));
    }

    /**
     * 修改知识切片
     *
     * @param aiSlice 知识切片
     * @return R
     */
    @Operation(summary = "修改知识切片", description = "修改知识切片")
    @SysLog("修改知识切片")
    @PutMapping
    @HasPermission("knowledge_aiSlice_edit")
    public R updateById(@RequestBody AiSliceEntity aiSlice) {
        return R.ok(aiSliceService.updateSlice(aiSlice));
    }

    /**
     * 通过id删除知识切片
     *
     * @param ids id列表
     * @return R
     */
    @Operation(summary = "通过id删除知识切片", description = "通过id删除知识切片")
    @SysLog("通过id删除知识切片")
    @DeleteMapping
    @HasPermission("knowledge_aiSlice_del")
    public R removeById(@RequestBody Long[] ids) {
        return R.ok(aiSliceService.removeSliceAndEbeddingById(CollUtil.toList(ids)));
    }

    /**
     * 导出excel 表格
     *
     * @param aiSlice 查询条件
     * @param ids     导出指定ID
     * @return excel 文件流
     */
    @ResponseExcel
    @GetMapping("/export")
    @HasPermission("knowledge_aiSlice_export")
    public List<AiSliceEntity> export(AiSliceEntity aiSlice, Long[] ids) {
        return aiSliceService
                .list(Wrappers.lambdaQuery(aiSlice).in(ArrayUtil.isNotEmpty(ids), AiSliceEntity::getId, ids));
    }

}
