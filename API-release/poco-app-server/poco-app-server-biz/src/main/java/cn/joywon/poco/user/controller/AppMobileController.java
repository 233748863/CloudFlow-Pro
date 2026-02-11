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

import cn.joywon.poco.user.service.AppMobileService;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.security.annotation.Inner;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AllArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * @author poco
 * @date 2018/11/14
 * <p>
 * 手机验证码
 */
@RestController
@AllArgsConstructor
@RequestMapping("/appmobile")
@Tag(description = "mobile", name = "手机管理模块")
@SecurityRequirement(name = HttpHeaders.AUTHORIZATION)
public class AppMobileController {

	private final AppMobileService appMobileService;

	@Inner(value = false)
	@GetMapping("/{mobile}")
	public R sendSmsCode(@PathVariable String mobile) {
		return appMobileService.sendSmsCode(mobile);
	}

}
