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
import cn.joywon.poco.knowledge.dto.AiDocumentDTO;
import cn.joywon.poco.knowledge.dto.ChatMessageDTO;
import cn.joywon.poco.knowledge.entity.AiDocumentEntity;
import cn.joywon.poco.knowledge.service.AiDocumentService;
import cn.joywon.poco.knowledge.support.constant.SourceTypeEnums;
import cn.joywon.poco.knowledge.support.handler.source.FileSourceTypeHandler;
import cn.joywon.poco.knowledge.support.handler.source.UploadSourceTypeHandler;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.beans.BeanUtils;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Objects;

/**
 * 知识文档
 *
 * @author pig
 * @date 2024-03-14 13:38:59
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/aiDocument")
@Tag(description = "aiDocument", name = "知识文档管理")
@SecurityRequirement(name = HttpHeaders.AUTHORIZATION)
public class AiDocumentController {

    private final List<FileSourceTypeHandler> sourceTypeHandlerList;

    private final UploadSourceTypeHandler uploadSourceTypeHandler;

    private final AiDocumentService aiDocumentService;

    /**
     * 分页查询
     *
     * @param page       分页对象
     * @param aiDocument 知识文档
     * @return
     */
    @Operation(summary = "分页查询", description = "分页查询")
    @GetMapping("/page")
    @HasPermission("knowledge_aiDocument_view")
    public R getAiDocumentPage(@ParameterObject Page page, @ParameterObject AiDocumentEntity aiDocument) {
        LambdaQueryWrapper<AiDocumentEntity> wrapper = Wrappers.lambdaQuery();
        wrapper.eq(Objects.nonNull(aiDocument.getDatasetId()), AiDocumentEntity::getDatasetId,
                aiDocument.getDatasetId());
        wrapper.eq(Objects.nonNull(aiDocument.getSummaryStatus()), AiDocumentEntity::getSummaryStatus,
                aiDocument.getSummaryStatus());
        wrapper.eq(Objects.nonNull(aiDocument.getSliceStatus()), AiDocumentEntity::getSliceStatus,
                aiDocument.getSliceStatus());
        wrapper.eq(Objects.nonNull(aiDocument.getSourceType()), AiDocumentEntity::getSourceType,
                aiDocument.getSourceType());
        wrapper.like(StrUtil.isNotBlank(aiDocument.getName()), AiDocumentEntity::getName, aiDocument.getName());
        wrapper.orderByDesc(AiDocumentEntity::getCreateTime);
        return R.ok(aiDocumentService.getDocumentPage(page, aiDocument));
    }

    /**
     * 通过id查询知识文档
     *
     * @param id id
     * @return R
     */
    @Operation(summary = "通过id查询", description = "通过id查询")
    @GetMapping("/{id}")
    @HasPermission("knowledge_aiDocument_view")
    public R getById(@PathVariable("id") Long id) {
        return R.ok(aiDocumentService.getById(id));
    }

    /**
     * 新增知识文档
     *
     * @param aiDocumentDTO 知识文档
     * @return R
     */
    @Operation(summary = "新增知识文档", description = "新增知识文档")
    @SysLog("新增知识文档")
    @PostMapping
    @HasPermission("knowledge_aiDocument_add")
    public R save(@RequestBody AiDocumentDTO aiDocumentDTO) {
        // 上传文件类型
        if (SourceTypeEnums.UPLOAD.getType().equals(aiDocumentDTO.getSourceType())) {
            List<AiDocumentEntity> files = aiDocumentDTO.getFiles();
            for (AiDocumentEntity file : files) {
                AiDocumentDTO single = new AiDocumentDTO();
                BeanUtils.copyProperties(aiDocumentDTO, single);
                single.setFiles(List.of(file));
                aiDocumentService.save(uploadSourceTypeHandler, single);
            }
            return R.ok();
        }

        sourceTypeHandlerList.stream()
                .filter(handler -> handler.supports(aiDocumentDTO.getSourceType()))
                .findFirst()
                .ifPresent(handler -> aiDocumentService.save(handler, aiDocumentDTO));
        return R.ok();
    }

    /**
     * 修改知识文档
     *
     * @param aiDocument 知识文档
     * @return R
     */
    @Operation(summary = "修改知识文档", description = "修改知识文档")
    @SysLog("修改知识文档")
    @PutMapping
    @HasPermission("knowledge_aiDocument_edit")
    public R updateById(@RequestBody AiDocumentEntity aiDocument) {
        return R.ok(aiDocumentService.updateById(aiDocument));
    }

    /**
     * 通过id删除知识文档
     *
     * @param ids id列表
     * @return R
     */
    @Operation(summary = "通过id删除知识文档", description = "通过id删除知识文档")
    @SysLog("通过id删除知识文档")
    @DeleteMapping
    @HasPermission("knowledge_aiDocument_del")
    public R removeById(@RequestBody Long[] ids) {
        return R.ok(aiDocumentService.removeDocumentAndSliceBatchByIds(CollUtil.toList(ids)));
    }

    /**
     * 导出excel 表格
     *
     * @param aiDocument 查询条件
     * @param ids        导出指定ID
     * @return excel 文件流
     */
    @ResponseExcel
    @GetMapping("/export")
    @HasPermission("knowledge_aiDocument_export")
    public List<AiDocumentEntity> export(AiDocumentEntity aiDocument, Long[] ids) {
        return aiDocumentService
                .list(Wrappers.lambdaQuery(aiDocument).in(ArrayUtil.isNotEmpty(ids), AiDocumentEntity::getId, ids));
    }

    /**
     * 重新切片文档
     *
     * @param aiDocument 知识文档
     * @return R
     */
    @Operation(summary = "重新切片文档", description = "重新切片文档")
    @SysLog("重新切片文档")
    @PostMapping("/retry/slice")
    @HasPermission("knowledge_aiDocument_del")
    public R retry(@RequestBody AiDocumentDTO aiDocument) {
        aiDocumentService.retryDocument(aiDocument);
        return R.ok();
    }

    /**
     * 更新工单
     *
     * @param aiDocument 知识文档
     * @return R
     */
    @Operation(summary = "更新工单", description = "更新工单")
    @SysLog("更新工单")
    @PostMapping("/retry/issue")
    @HasPermission("knowledge_aiDocument_del")
    public R retryIssue(@RequestBody AiDocumentDTO aiDocument) {
        aiDocumentService.retryIssue(aiDocument);
        return R.ok();
    }


    /**
     * 文档向量化
     *
     * @param fileDTO 文件 DTO
     * @return {@link R }
     */
    @SneakyThrows
    @PostMapping("/embed")
    @HasPermission("knowledge_aiDocument_view")
    public R embedDocument(@RequestBody ChatMessageDTO.FileDTO fileDTO) {
        return aiDocumentService.embedDocument(fileDTO.getName());
    }
}
