/*
 *    Copyright (c) 2018-2025, poco All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * Redistributions of source code must retain the above copyright notice,
 * this list of conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright
 * notice, this list of conditions and the following disclaimer in the
 * documentation and/or other materials provided with the distribution.
 * Neither the name of the pig4cloud.com developer nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 * Author: poco
 */

package cn.joywon.poco.user.controller;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.security.util.SecurityUtils;
import cn.joywon.poco.user.api.dto.AppUserAddressDTO;
import cn.joywon.poco.user.api.vo.AppUserAddressVO;
import cn.joywon.poco.user.service.AppUserAddressService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.*;

@Slf4j
@RestController
@RequiredArgsConstructor
@RequestMapping("/address")
@Tag(description = "address", name = "收货地址管理")
@SecurityRequirement(name = HttpHeaders.AUTHORIZATION)
public class AppAddressController {

    private final AppUserAddressService addressService;

    @Operation(summary = "收货地址列表", description = "收货地址列表")
    @GetMapping(value = "/list")
    public R list() {
        return R.ok(addressService.listAddress(SecurityUtils.getUser().getId()));
    }

    @Operation(summary = "添加收货地址", description = "添加收货地址")
    @PostMapping(value = "/add")
    public R add(@Valid @RequestBody AppUserAddressDTO input) {
        input.setUserId(SecurityUtils.getUser().getId());
        addressService.add(input);
        return R.ok();
    }

    @Operation(summary = "修改收货地址", description = "修改收货地址")
    @PutMapping(value = "/edit")
    public R edit(@Valid @RequestBody AppUserAddressDTO input) {
        input.setUserId(SecurityUtils.getUser().getId());
        addressService.edit(input);
        return R.ok();
    }

    @Operation(summary = "设置默认收货地址", description = "设置默认收货地址")
    @PutMapping(value = "/setDefault")
    public R setDefault(@Valid @RequestBody AppUserAddressDTO input) {
        addressService.setDefault(input, SecurityUtils.getUser().getId());
        return R.ok();
    }

    @Operation(summary = "获取默认收货地址", description = "获取默认收货地址")
    @GetMapping(value = "/getDefault")
    public R<AppUserAddressVO> getDefault() {
        return R.ok(addressService.getDefault(SecurityUtils.getUser().getId()));
    }

    @Operation(summary = "删除收货地址", description = "删除收货地址")
    @DeleteMapping(value = "/delete/{id}")
    public R delete(@PathVariable("id") Long id) {
        addressService.removeAddress(id, SecurityUtils.getUser().getId());
        return R.ok();
    }
}
