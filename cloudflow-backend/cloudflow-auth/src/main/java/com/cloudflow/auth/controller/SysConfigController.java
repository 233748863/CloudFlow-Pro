package com.cloudflow.auth.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.auth.domain.SysConfig;
import com.cloudflow.auth.service.ISysConfigService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Arrays;
import java.time.LocalDateTime;
import com.fasterxml.jackson.annotation.JsonFormat;

/**
 * 系统参数配置控制器
 *
 * @author CloudFlow
 */
@RestController
@RequestMapping("/system/config")
@RequiredArgsConstructor
public class SysConfigController {

    private final ISysConfigService configService;

    /**
     * 分页查询参数配置列表
     */
    @GetMapping("/list")
    public R<Page<SysConfig>> list(
            @RequestParam(required = false) String configName,
            @RequestParam(required = false) String configKey,
            @RequestParam(required = false) String configType,
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize) {
        LambdaQueryWrapper<SysConfig> wrapper = new LambdaQueryWrapper<>();
        wrapper.like(configName != null, SysConfig::getConfigName, configName)
                .like(configKey != null, SysConfig::getConfigKey, configKey)
                .eq(configType != null, SysConfig::getConfigType, configType)
                .orderByAsc(SysConfig::getConfigId);
        Page<SysConfig> page = configService.page(new Page<>(pageNum, pageSize), wrapper);
        return R.ok(page);
    }

    /**
     * 根据 ID 获取参数配置详情
     */
    @GetMapping("/{configId}")
    public R<SysConfig> getInfo(@PathVariable Long configId) {
        return R.ok(configService.getById(configId));
    }

    /**
     * 根据参数键名查询参数值
     */
    @GetMapping("/configKey/{configKey}")
    public R<String> getConfigKey(@PathVariable String configKey) {
        return R.ok(configService.selectConfigByKey(configKey));
    }

    /**
     * 新增参数配置
     */
    @PostMapping
    public R<Void> add(@RequestBody SysConfig config) {
        if (!configService.checkConfigKeyUnique(config)) {
            return R.fail("新增参数'" + config.getConfigName() + "'失败，参数键名已存在");
        }
        config.setCreateTime(LocalDateTime.now());
        configService.save(config);
        return R.ok();
    }

    /**
     * 修改参数配置
     */
    @PutMapping
    public R<Void> edit(@RequestBody SysConfig config) {
        if (!configService.checkConfigKeyUnique(config)) {
            return R.fail("修改参数'" + config.getConfigName() + "'失败，参数键名已存在");
        }
        config.setUpdateTime(LocalDateTime.now());
        configService.updateById(config);
        return R.ok();
    }

    /**
     * 删除参数配置（支持批量）
     * 系统内置参数（configType=Y）不允许删除
     */
    @DeleteMapping("/{configIds}")
    public R<Void> remove(@PathVariable Long[] configIds) {
        for (Long configId : configIds) {
            SysConfig config = configService.getById(configId);
            if (config != null && "Y".equals(config.getConfigType())) {
                return R.fail("内置参数'" + config.getConfigKey() + "'不允许删除");
            }
        }
        configService.removeByIds(Arrays.asList(configIds));
        return R.ok();
    }
}
