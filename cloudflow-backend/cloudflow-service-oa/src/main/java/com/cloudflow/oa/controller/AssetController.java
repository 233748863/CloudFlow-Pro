package com.cloudflow.oa.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.SysAsset;
import com.cloudflow.oa.service.IAssetService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;

@RestController
@RequestMapping("/asset")
public class AssetController {

    @Autowired
    private IAssetService assetService;

    /**
     * 获取资产列表
     */
    @GetMapping("/list")
    public R list() {
        return R.ok(assetService.list());
    }

    /**
     * 新增资产
     */
    @PostMapping
    public R add(@RequestBody SysAsset asset) {
        return R.ok(assetService.save(asset));
    }

    /**
     * 生成二维码
     */
    @GetMapping("/{id}/qrcode")
    public void getQrCode(@PathVariable("id") Long id, HttpServletResponse response) throws IOException {
        response.setContentType("image/png");
        assetService.generateQrCode(id, response.getOutputStream());
    }
}
