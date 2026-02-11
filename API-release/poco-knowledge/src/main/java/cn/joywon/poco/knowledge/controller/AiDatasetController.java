package cn.joywon.poco.knowledge.controller;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.ArrayUtil;
import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.excel.annotation.ResponseExcel;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.common.security.annotation.HasPermission;
import cn.joywon.poco.common.security.annotation.Inner;
import cn.joywon.poco.knowledge.dto.AiDatasetVerifyDTO;
import cn.joywon.poco.knowledge.entity.AiDatasetEntity;
import cn.joywon.poco.knowledge.service.AiDatasetService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

/**
 * 知识库
 *
 * @author pig
 * @date 2024-03-14 13:39:21
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/aiDataset")
@Tag(description = "aiDataset", name = "知识库管理")
@SecurityRequirement(name = HttpHeaders.AUTHORIZATION)
public class AiDatasetController {

    private final AiDatasetService aiDatasetService;

    /**
     * List查询
     *
     * @return LIST
     */
    @Operation(summary = "批量查询", description = "批量查询")
    @GetMapping("/list")
    @HasPermission("knowledge_aiDataset_view")
    public R getAiDatasetPage() {
        return R.ok(aiDatasetService
                .list(Wrappers.<AiDatasetEntity>lambdaQuery().orderByDesc(AiDatasetEntity::getSortOrder)));
    }

    /**
     * 分页查询
     *
     * @param page      分页对象
     * @param aiDataset 知识库
     * @return
     */
    @Operation(summary = "分页查询", description = "分页查询")
    @GetMapping("/page")
    @HasPermission("knowledge_aiDataset_view")
    public R getAiDatasetPage(@ParameterObject Page page, @ParameterObject AiDatasetEntity aiDataset) {
        return R.ok(aiDatasetService.getAiDatasetPage(page));
    }

    /**
     * 通过id查询知识库
     *
     * @param dataset 查询条件
     * @return R
     */
    @Operation(summary = "通过id查询", description = "通过id查询")
    @GetMapping("/details")
    @HasPermission("knowledge_aiDataset_view")
    public R details(@ParameterObject AiDatasetEntity dataset) {
        return R.ok(aiDatasetService.getOne(Wrappers.<AiDatasetEntity>lambdaQuery()
                .eq(Objects.nonNull(dataset.getId()), AiDatasetEntity::getId, dataset.getId())
                .eq(StrUtil.isNotBlank(dataset.getName()), AiDatasetEntity::getName, dataset.getName()), false));
    }

    /**
     * 新增知识库
     *
     * @param aiDataset 知识库
     * @return R
     */
    @Operation(summary = "新增知识库", description = "新增知识库")
    @SysLog("新增知识库")
    @PostMapping
    @HasPermission("knowledge_aiDataset_add")
    public R save(@RequestBody AiDatasetEntity aiDataset) {
        return aiDatasetService.saveDataset(aiDataset);
    }

    /**
     * 修改知识库
     *
     * @param aiDataset 知识库
     * @return R
     */
    @Operation(summary = "修改知识库", description = "修改知识库")
    @SysLog("修改知识库")
    @PutMapping
    @HasPermission("knowledge_aiDataset_edit")
    public R updateById(@RequestBody AiDatasetEntity aiDataset) {
        return R.ok(aiDatasetService.updateById(aiDataset));
    }

    /**
     * 通过id删除知识库
     *
     * @param ids id列表
     * @return R
     */
    @Operation(summary = "通过id删除知识库", description = "通过id删除知识库")
    @SysLog("通过id删除知识库")
    @DeleteMapping
    @HasPermission("knowledge_aiDataset_del")
    public R removeById(@RequestBody Long[] ids) {
        return R.ok(aiDatasetService.removeBatchByIds(CollUtil.toList(ids)));
    }

    /**
     * 导出excel 表格
     *
     * @param aiDataset 查询条件
     * @param ids       导出指定ID
     * @return excel 文件流
     */
    @ResponseExcel
    @GetMapping("/export")
    @HasPermission("knowledge_aiDataset_export")
    public List<AiDatasetEntity> export(AiDatasetEntity aiDataset, Long[] ids) {
        return aiDatasetService
                .list(Wrappers.lambdaQuery(aiDataset).in(ArrayUtil.isNotEmpty(ids), AiDatasetEntity::getId, ids));
    }

    /**
     * 通过id查询知识库
     *
     * @param datasetId 数据集 ID
     * @return {@link R }
     */
    @Inner(value = false)
    @GetMapping("/info")
    public R info(@RequestParam(required = false) Long datasetId) {
        return aiDatasetService.getDatasetById(datasetId);
    }

    /**
     * 验证密码
     *
     * @param aiDatasetVerifyDTO 请求
     * @return true false
     */
    @Inner(value = false)
    @PostMapping("/verify")
    public R verify(@RequestBody AiDatasetVerifyDTO aiDatasetVerifyDTO) {
        Optional<AiDatasetEntity> opt = aiDatasetService.getOptById(aiDatasetVerifyDTO.getDatasetId());
        if (opt.isEmpty()) {
            return R.failed();
        }

        if (aiDatasetVerifyDTO.getToken().equals(opt.get().getPublicPassword())) {
            return R.ok(true);
        }

        return R.failed();
    }

}
