package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.OaAssetCategory;
import com.cloudflow.oa.domain.SysAsset;
import com.cloudflow.oa.domain.SysAssetLog;
import com.cloudflow.oa.domain.vo.DynamicMapVO;
import com.cloudflow.oa.mapper.SysAssetLogMapper;
import com.cloudflow.oa.service.IAssetService;
import com.cloudflow.oa.service.impl.OaAssetRegistryService;
import com.cloudflow.oa.service.impl.OaRecordSupport;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/asset")
@RequiredArgsConstructor
public class AssetController {
    private final IAssetService assetService;
    private final OaAssetRegistryService registry;
    private final SysAssetLogMapper assetLogMapper;

    @GetMapping("/list") @SaCheckPermission("oa:asset:list")
    public R<PageResult<SysAsset>> list(SysAsset query, PageQuery page) { return R.ok(registry.list(query, page)); }

    @GetMapping("/{id}") @SaCheckPermission("oa:asset:list")
    public R<SysAsset> getById(@PathVariable Long id) { return R.ok(registry.detail(id)); }

    @PostMapping @SaCheckPermission("oa:asset:add") @SysLog("新增资产") @RepeatSubmit
    public R<Long> add(@Valid @RequestBody SysAsset asset) { asset.setAssetId(null); return R.ok(registry.saveAsset(asset)); }

    @PutMapping @SaCheckPermission("oa:asset:edit") @SysLog("编辑资产") @RepeatSubmit
    public R<Long> update(@Valid @RequestBody SysAsset asset) { OaRecordSupport.require(asset.getAssetId(), "资产ID不能为空"); return R.ok(registry.saveAsset(asset)); }

    @DeleteMapping("/{id}") @SaCheckPermission("oa:asset:remove") @SysLog("删除资产")
    public R<Void> delete(@PathVariable Long id) { registry.removeAsset(id); return R.ok(); }

    @PostMapping("/{id}/borrow") @SaCheckPermission("oa:asset:borrow") @SysLog("资产领用") @RepeatSubmit
    public R<Void> borrow(@PathVariable Long id, @RequestParam Long userId) { assetService.borrowAsset(id,userId); return R.ok(); }

    @PostMapping("/{id}/return") @SaCheckPermission("oa:asset:return") @SysLog("资产归还") @RepeatSubmit
    public R<Void> returnAsset(@PathVariable Long id) { assetService.returnAsset(id); return R.ok(); }

    @PostMapping("/{id}/repair") @SaCheckPermission("oa:asset:edit") @SysLog("资产送修") @RepeatSubmit
    public R<Void> repair(@PathVariable Long id, @RequestParam(required=false) String remark) { assetService.repairAsset(id,remark); return R.ok(); }

    @PostMapping("/{id}/scrap") @SaCheckPermission("oa:asset:edit") @SysLog("资产报废") @RepeatSubmit
    public R<Void> scrap(@PathVariable Long id, @RequestParam(required=false) String remark) { assetService.scrapAsset(id,remark); return R.ok(); }

    @GetMapping("/{id}/logs") @SaCheckPermission("oa:asset:list")
    public R<List<SysAssetLog>> getLogs(@PathVariable Long id) {
        registry.detail(id);
        return R.ok(assetLogMapper.selectList(new LambdaQueryWrapper<SysAssetLog>().eq(SysAssetLog::getTenantId,OaRecordSupport.tenantId()).eq(SysAssetLog::getRefId,id).eq(SysAssetLog::getRefType,"1").orderByDesc(SysAssetLog::getCreateTime)));
    }

    @GetMapping("/statistics") @SaCheckPermission("oa:asset:list")
    public R<DynamicMapVO> statistics() { return R.ok(assetService.getStatistics()); }

    @GetMapping("/categories") @SaCheckPermission("oa:asset:list")
    public R<List<OaAssetCategory>> categories() { return R.ok(assetService.getAllCategories()); }

    @GetMapping("/{id}/qrcode") @SaCheckPermission("oa:asset:list")
    public void getQrCode(@PathVariable Long id, HttpServletResponse response) throws IOException { response.setContentType("image/png"); assetService.generateQrCode(id,response.getOutputStream()); }
}

