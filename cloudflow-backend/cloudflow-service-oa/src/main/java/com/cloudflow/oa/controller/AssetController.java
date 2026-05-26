package com.cloudflow.oa.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.SysAsset;
import com.cloudflow.oa.domain.SysAssetLog;
import com.cloudflow.oa.domain.vo.DynamicMapVO;
import com.cloudflow.oa.mapper.SysAssetLogMapper;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.service.IAssetService;
import org.springframework.beans.factory.annotation.Autowired;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 固定资产管理控制器
 */
@RestController
@RequestMapping("/asset")
public class AssetController {

    @Autowired
    private IAssetService assetService;

    @Autowired
    private SysAssetLogMapper assetLogMapper;

    /**
     * 分页查询资产列表（支持条件筛选）
     */
    @GetMapping("/list")
    @SaCheckPermission("oa:asset:list")
    public R list(
            @RequestParam(value = "pageNum", defaultValue = "1") Integer pageNum,
            @RequestParam(value = "pageSize", defaultValue = "10") Integer pageSize,
            @RequestParam(value = "name", required = false) String name,
            @RequestParam(value = "assetCode", required = false) String assetCode,
            @RequestParam(value = "category", required = false) String category,
            @RequestParam(value = "status", required = false) String status) {

        LambdaQueryWrapper<SysAsset> wrapper = new LambdaQueryWrapper<>();
        // 按名称模糊搜索
        if (StringUtils.hasText(name)) {
            wrapper.like(SysAsset::getName, name);
        }
        // 按资产编码模糊搜索
        if (StringUtils.hasText(assetCode)) {
            wrapper.like(SysAsset::getAssetCode, assetCode);
        }
        // 按分类精确筛选
        if (StringUtils.hasText(category)) {
            wrapper.eq(SysAsset::getCategory, category);
        }
        // 按状态精确筛选
        if (StringUtils.hasText(status)) {
            wrapper.eq(SysAsset::getStatus, status);
        }
        wrapper.orderByDesc(SysAsset::getCreateTime);

        IPage<SysAsset> page = assetService.page(new Page<>(pageNum, pageSize), wrapper);
        return R.ok(page);
    }

    /**
     * 获取资产详情
     */
    @GetMapping("/{id}")
    @SaCheckPermission("oa:asset:list")
    public R getById(@PathVariable("id") Long id) {
        SysAsset asset = assetService.getById(id);
        if (asset == null) {
            return R.fail("资产不存在");
        }
        return R.ok(asset);
    }

    /**
     * 新增资产 - 仅管理员
     */
    @SysLog("新增资产")
    @PostMapping
    @SaCheckPermission("oa:asset:add")
    public R add(@RequestBody SysAsset asset) {
        return R.ok(assetService.save(asset));
    }

    /**
     * 编辑资产 - 仅管理员
     */
    @SysLog("编辑资产")
    @PutMapping
    @SaCheckPermission("oa:asset:edit")
    public R update(@RequestBody SysAsset asset) {
        if (asset.getAssetId() == null) {
            return R.fail("资产ID不能为空");
        }
        return R.ok(assetService.updateById(asset));
    }

    /**
     * 删除资产 - 仅管理员
     */
    @SysLog("删除资产")
    @DeleteMapping("/{id}")
    @SaCheckPermission("oa:asset:remove")
    public R delete(@PathVariable("id") Long id) {
        SysAsset asset = assetService.getById(id);
        if (asset == null) {
            return R.fail("资产不存在");
        }
        // 在用状态不允许删除
        if ("2".equals(asset.getStatus())) {
            return R.fail("在用资产不能删除，请先归还");
        }
        return R.ok(assetService.removeById(id));
    }

    /**
     * 资产领用
     */
    @SysLog("资产领用")
    @PostMapping("/{id}/borrow")
    @SaCheckPermission("oa:asset:borrow")
    public R borrow(@PathVariable("id") Long id, @RequestParam("userId") Long userId) {
        assetService.borrowAsset(id, userId);
        return R.ok("领用成功");
    }

    /**
     * 资产归还
     */
    @SysLog("资产归还")
    @PostMapping("/{id}/return")
    @SaCheckPermission("oa:asset:return")
    public R returnAsset(@PathVariable("id") Long id) {
        assetService.returnAsset(id);
        return R.ok("归还成功");
    }

    /**
     * 资产送修
     */
    @SysLog("资产送修")
    @PostMapping("/{id}/repair")
    @SaCheckPermission("oa:asset:repair")
    public R repair(@PathVariable("id") Long id, @RequestParam(value = "remark", required = false) String remark) {
        assetService.repairAsset(id, remark);
        return R.ok("已送修");
    }

    /**
     * 资产报废 - 仅管理员
     */
    @SysLog("资产报废")
    @PostMapping("/{id}/scrap")
    @SaCheckPermission("oa:asset:scrap")
    public R scrap(@PathVariable("id") Long id, @RequestParam(value = "remark", required = false) String remark) {
        assetService.scrapAsset(id, remark);
        return R.ok("已报废");
    }

    /**
     * 获取资产变动日志
     */
    @GetMapping("/{id}/logs")
    @SaCheckPermission("oa:asset:list")
    public R getLogs(@PathVariable("id") Long id) {
        LambdaQueryWrapper<SysAssetLog> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysAssetLog::getRefId, id)
               .eq(SysAssetLog::getRefType, "1")
               .orderByDesc(SysAssetLog::getCreateTime);
        List<SysAssetLog> logs = assetLogMapper.selectList(wrapper);
        return R.ok(logs);
    }

    /**
     * 资产统计（按状态和分类统计）
     */
    @GetMapping("/statistics")
    @SaCheckPermission("oa:asset:list")
    public R<DynamicMapVO> statistics() {
        return R.ok(assetService.getStatistics());
    }

    /**
     * 获取所有分类列表（用于筛选下拉）
     */
    @GetMapping("/categories")
    @SaCheckPermission("oa:asset:list")
    public R categories() {
        List<String> categories = assetService.getAllCategories();
        return R.ok(categories);
    }

    /**
     * 生成二维码
     */
    @GetMapping("/{id}/qrcode")
    @SaCheckPermission("oa:asset:list")
    public void getQrCode(@PathVariable("id") Long id, HttpServletResponse response) throws IOException {
        response.setContentType("image/png");
        assetService.generateQrCode(id, response.getOutputStream());
    }
}

