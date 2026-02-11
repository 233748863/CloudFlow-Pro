package cn.joywon.poco.knowledge.controller;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.io.IoUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import cn.joywon.poco.common.api.encrypt.annotation.NoEncrypt;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.knowledge.dto.AiFlowExecuteDTO;
import cn.joywon.poco.knowledge.entity.AiFlowEntity;
import cn.joywon.poco.knowledge.service.AiFlowService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.http.HttpHeaders;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.Charset;
import java.util.List;

/**
 * 大模型流程表
 *
 * @author poco
 * @date 2025-03-03 10:21:32
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/aiFlow")
@Tag(description = "aiFlow", name = "大模型流程表管理")
@SecurityRequirement(name = HttpHeaders.AUTHORIZATION)
public class AiFlowController {

    private final AiFlowService aiFlowService;

    /**
     * 分页查询
     *
     * @param page   分页对象
     * @param aiFlow 大模型流程表
     * @return
     */
    @Operation(summary = "分页查询", description = "分页查询")
    @GetMapping("/page")
    @PreAuthorize("@pms.hasPermission('knowledge_aiFlow_view')")
    public R getAiFlowPage(@ParameterObject Page page, @ParameterObject AiFlowEntity aiFlow) {
        LambdaQueryWrapper<AiFlowEntity> wrapper = Wrappers.<AiFlowEntity>lambdaQuery()
                .like(StrUtil.isNotBlank(aiFlow.getName()), AiFlowEntity::getName, aiFlow.getName())
                .orderByDesc(AiFlowEntity::getCreateTime);
        return R.ok(aiFlowService.page(page, wrapper));
    }


    /**
     * 通过id查询大模型流程表
     *
     * @param id id
     * @return R
     */
    @Operation(summary = "通过id查询", description = "通过id查询")
    @GetMapping("/{id}")
    @PreAuthorize("@pms.hasPermission('knowledge_aiFlow_view')")
    public R getById(@PathVariable("id") Long id) {
        return R.ok(aiFlowService.getById(id));
    }

    /**
     * 新增大模型流程表
     *
     * @param aiFlow 大模型流程表
     * @return R
     */
    @Operation(summary = "新增大模型流程表", description = "新增大模型流程表")
    @SysLog("新增大模型流程表")
    @PostMapping
    @PreAuthorize("@pms.hasPermission('knowledge_aiFlow_add')")
    public R save(@RequestBody AiFlowEntity aiFlow) {
        return R.ok(aiFlowService.save(aiFlow));
    }

    /**
     * 修改大模型流程表
     *
     * @param aiFlow 大模型流程表
     * @return R
     */
    @Operation(summary = "修改大模型流程表", description = "修改大模型流程表")
    @SysLog("修改大模型流程表")
    @PutMapping
    @PreAuthorize("@pms.hasPermission('knowledge_aiFlow_edit')")
    public R updateById(@RequestBody AiFlowEntity aiFlow) {
        return R.ok(aiFlowService.updateById(aiFlow));
    }

    /**
     * 通过id删除大模型流程表
     *
     * @param ids id列表
     * @return R
     */
    @Operation(summary = "通过id删除大模型流程表", description = "通过id删除大模型流程表")
    @SysLog("通过id删除大模型流程表")
    @DeleteMapping
    @PreAuthorize("@pms.hasPermission('knowledge_aiFlow_del')")
    public R removeById(@RequestBody Long[] ids) {
        return R.ok(aiFlowService.removeBatchByIds(CollUtil.toList(ids)));
    }


    /**
     * 执行
     *
     * @param executeDTO 执行 DTO
     * @return {@link R }
     */
    @Operation(summary = "执行流程", description = "执行流程")
    @PostMapping("/execute")
    @PreAuthorize("@pms.hasPermission('knowledge_aiFlow_view')")
    public R execute(@RequestBody AiFlowExecuteDTO executeDTO) {
        return aiFlowService.executeFlow(executeDTO);
    }

    @NoEncrypt
    @Operation(summary = "导出流程", description = "导出流程")
    @GetMapping("/export/{id}")
    @PreAuthorize("@pms.hasPermission('knowledge_aiFlow_del')")
    public void exportFlow(@PathVariable Long id, HttpServletResponse response) {
        aiFlowService.exportFlow(id, response);
    }


    @Operation(summary = "导出流程", description = "导出流程")
    @PostMapping("/copy/{id}")
    @PreAuthorize("@pms.hasPermission('knowledge_aiFlow_del')")
    public R copyFlow(@PathVariable Long id) {
        return aiFlowService.copyFlow(id);
    }

    /**
     * 导入流程
     *
     * @return {@link List }<{@link AiFlowEntity }>
     */
    @NoEncrypt
    @SneakyThrows
    @PostMapping("/import")
    @PreAuthorize("@pms.hasPermission('knowledge_aiFlow_del')")
    public R importFlow(@RequestPart("file") MultipartFile file) {
        String inputDsl = IoUtil.read(file.getInputStream(), Charset.defaultCharset());

        if (!JSONUtil.isJson(inputDsl)) {
            return R.failed("导入文件格式错误");
        }

        AiFlowEntity flowEntity = JSONUtil.toBean(inputDsl, AiFlowEntity.class);
        aiFlowService.save(flowEntity);
        return R.ok();
    }

}
