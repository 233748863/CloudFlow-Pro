package cn.joywon.poco.knowledge.controller;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.ArrayUtil;
import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import cn.joywon.poco.common.core.constant.enums.YesNoEnum;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.excel.annotation.ResponseExcel;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.knowledge.entity.AiMcpConfigEntity;
import cn.joywon.poco.knowledge.service.AiMcpConfigService;
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
 * MCP配置表
 *
 * @author poco
 * @date 2025-03-22 13:36:32
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/aiMcpConfig")
@Tag(description = "aiMcpConfig", name = "MCP配置表管理")
@SecurityRequirement(name = HttpHeaders.AUTHORIZATION)
public class AiMcpConfigController {

    private final AiMcpConfigService aiMcpConfigService;

    /**
     * 分页查询
     *
     * @param page        分页对象
     * @param aiMcpConfig MCP配置表
     * @return
     */
    @Operation(summary = "分页查询", description = "分页查询")
    @GetMapping("/page")
    @PreAuthorize("@pms.hasPermission('knowledge_aiMcpConfig_view')")
    public R getAiMcpConfigPage(@ParameterObject Page page, @ParameterObject AiMcpConfigEntity aiMcpConfig) {
        LambdaQueryWrapper<AiMcpConfigEntity> wrapper = Wrappers.lambdaQuery();
        wrapper.like(StrUtil.isNotBlank(aiMcpConfig.getName()), AiMcpConfigEntity::getName, aiMcpConfig.getName());
        wrapper.eq(StrUtil.isNotBlank(aiMcpConfig.getMcpType()), AiMcpConfigEntity::getMcpType, aiMcpConfig.getMcpType());
        wrapper.eq(StrUtil.isNotBlank(aiMcpConfig.getMcpEnabled()), AiMcpConfigEntity::getMcpEnabled, aiMcpConfig.getMcpEnabled());
        return R.ok(aiMcpConfigService.page(page, wrapper));
    }


    /**
     * 通过id查询MCP配置表
     *
     * @param mcpId id
     * @return R
     */
    @Operation(summary = "通过id查询", description = "通过id查询")
    @GetMapping("/{mcpId}")
    @PreAuthorize("@pms.hasPermission('knowledge_aiMcpConfig_view')")
    public R getById(@PathVariable("mcpId") Long mcpId) {
        return R.ok(aiMcpConfigService.getById(mcpId));
    }

    /**
     * 新增MCP配置表
     *
     * @param aiMcpConfig MCP配置表
     * @return R
     */
    @Operation(summary = "新增MCP配置表", description = "新增MCP配置表")
    @SysLog("新增MCP配置表")
    @PostMapping
    @PreAuthorize("@pms.hasPermission('knowledge_aiMcpConfig_add')")
    public R save(@RequestBody AiMcpConfigEntity aiMcpConfig) {
        return R.ok(aiMcpConfigService.saveOrUpdateMcp(aiMcpConfig));
    }

    /**
     * 修改MCP配置表
     *
     * @param aiMcpConfig MCP配置表
     * @return R
     */
    @Operation(summary = "修改MCP配置表", description = "修改MCP配置表")
    @SysLog("修改MCP配置表")
    @PutMapping
    @PreAuthorize("@pms.hasPermission('knowledge_aiMcpConfig_edit')")
    public R updateById(@RequestBody AiMcpConfigEntity aiMcpConfig) {
        return R.ok(aiMcpConfigService.saveOrUpdateMcp(aiMcpConfig));
    }

    /**
     * 通过id删除MCP配置表
     *
     * @param ids mcpId列表
     * @return R
     */
    @Operation(summary = "通过id删除MCP配置表", description = "通过id删除MCP配置表")
    @SysLog("通过id删除MCP配置表")
    @DeleteMapping
    @PreAuthorize("@pms.hasPermission('knowledge_aiMcpConfig_del')")
    public R removeById(@RequestBody Long[] ids) {
        return R.ok(aiMcpConfigService.removeBatchByIds(CollUtil.toList(ids)));
    }


    /**
     * 导出excel 表格
     *
     * @param aiMcpConfig 查询条件
     * @param ids         导出指定ID
     * @return excel 文件流
     */
    @ResponseExcel
    @GetMapping("/export")
    @PreAuthorize("@pms.hasPermission('knowledge_aiMcpConfig_export')")
    public List<AiMcpConfigEntity> export(AiMcpConfigEntity aiMcpConfig, Long[] ids) {
        return aiMcpConfigService.list(Wrappers.lambdaQuery(aiMcpConfig).in(ArrayUtil.isNotEmpty(ids), AiMcpConfigEntity::getMcpId, ids));
    }

    /**
     * 查询列表
     *
     * @return {@link R }
     */
    @Operation(summary = "查询列表", description = "查询列表")
    @GetMapping("/list")
    @PreAuthorize("@pms.hasPermission('knowledge_aiMcpConfig_view')")
    public R list() {
        return R.ok(aiMcpConfigService.list(Wrappers.<AiMcpConfigEntity>lambdaQuery()
                .eq(AiMcpConfigEntity::getMcpEnabled, YesNoEnum.YES.getCode())));
    }
}
