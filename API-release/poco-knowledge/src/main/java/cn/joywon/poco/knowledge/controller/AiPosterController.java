package cn.joywon.poco.knowledge.controller;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.ArrayUtil;
import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.excel.annotation.ResponseExcel;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.common.security.annotation.HasPermission;
import cn.joywon.poco.knowledge.dto.AiMessageResultDTO;
import cn.joywon.poco.knowledge.dto.AiPosterDTO;
import cn.joywon.poco.knowledge.entity.AiPosterEntity;
import cn.joywon.poco.knowledge.service.AiPosterService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.http.HttpHeaders;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;

import java.util.List;

/**
 * AI海报模板表
 *
 * @author poco
 * @date 2025-04-04 14:25:49
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/aiPoster")
@Tag(description = "aiPoster", name = "AI海报模板表管理")
@SecurityRequirement(name = HttpHeaders.AUTHORIZATION)
public class AiPosterController {

    private final AiPosterService aiPosterService;

    /**
     * 分页查询
     *
     * @param page     分页对象
     * @param aiPoster AI海报模板表
     * @return
     */
    @Operation(summary = "分页查询", description = "分页查询")
    @GetMapping("/list")
    public R getAiPosterPage(@ParameterObject AiPosterEntity aiPoster) {
        return R.ok(aiPosterService.list(Wrappers.<AiPosterEntity>lambdaQuery().like(StrUtil.isNotBlank(aiPoster.getTemplateName())
                , AiPosterEntity::getTemplateName, aiPoster.getTemplateName())));
    }


    /**
     * 通过id查询AI海报模板表
     *
     * @param id id
     * @return R
     */
    @Operation(summary = "通过id查询", description = "通过id查询")
    @GetMapping("/{id}")
    @PreAuthorize("@pms.hasPermission('knowledge_aiPoster_view')")
    public R getById(@PathVariable("id") Long id) {
        return R.ok(aiPosterService.getById(id));
    }

    /**
     * 新增AI海报模板表
     *
     * @param aiPoster AI海报模板表
     * @return R
     */
    @Operation(summary = "新增AI海报模板表", description = "新增AI海报模板表")
    @SysLog("新增AI海报模板表")
    @PostMapping
    @PreAuthorize("@pms.hasPermission('knowledge_aiPoster_add')")
    public R save(@RequestBody AiPosterEntity aiPoster) {
        return R.ok(aiPosterService.save(aiPoster));
    }

    /**
     * 修改AI海报模板表
     *
     * @param aiPoster AI海报模板表
     * @return R
     */
    @Operation(summary = "修改AI海报模板表", description = "修改AI海报模板表")
    @SysLog("修改AI海报模板表")
    @PutMapping
    @PreAuthorize("@pms.hasPermission('knowledge_aiPoster_edit')")
    public R updateById(@RequestBody AiPosterEntity aiPoster) {
        return R.ok(aiPosterService.updateById(aiPoster));
    }

    /**
     * 通过id删除AI海报模板表
     *
     * @param ids id列表
     * @return R
     */
    @Operation(summary = "通过id删除AI海报模板表", description = "通过id删除AI海报模板表")
    @SysLog("通过id删除AI海报模板表")
    @DeleteMapping
    @PreAuthorize("@pms.hasPermission('knowledge_aiPoster_del')")
    public R removeById(@RequestBody Long[] ids) {
        return R.ok(aiPosterService.removeBatchByIds(CollUtil.toList(ids)));
    }


    /**
     * 导出excel 表格
     *
     * @param aiPoster 查询条件
     * @param ids      导出指定ID
     * @return excel 文件流
     */
    @ResponseExcel
    @GetMapping("/export")
    @PreAuthorize("@pms.hasPermission('knowledge_aiPoster_export')")
    public List<AiPosterEntity> export(AiPosterEntity aiPoster, Long[] ids) {
        return aiPosterService.list(Wrappers.lambdaQuery(aiPoster).in(ArrayUtil.isNotEmpty(ids), AiPosterEntity::getId, ids));
    }


    /**
     * 生成
     *
     * @param posterDTO 海报 DTO
     * @return {@link R }
     */
    @Operation(summary = "生成海报", description = "AI生成海报")
    @SysLog("生成海报")
    @PostMapping("/generate")
    @HasPermission("knowledge_ocr_add")
    public Flux<AiMessageResultDTO> generate(@RequestBody AiPosterDTO posterDTO) {
        return aiPosterService.generatePoster(posterDTO);
    }
}
