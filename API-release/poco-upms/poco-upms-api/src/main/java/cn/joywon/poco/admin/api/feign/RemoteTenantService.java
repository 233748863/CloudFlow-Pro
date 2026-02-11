/*
 *
 *      Copyright (c) 2018-2025, poco All rights reserved.
 *
 *  Redistribution and use in source and binary forms, with or without
 *  modification, are permitted provided that the following conditions are met:
 *
 * Redistributions of source code must retain the above copyright notice,
 *  this list of conditions and the following disclaimer.
 *  Redistributions in binary form must reproduce the above copyright
 *  notice, this list of conditions and the following disclaimer in the
 *  documentation and/or other materials provided with the distribution.
 *  Neither the name of the pig4cloud.com developer nor the names of its
 *  contributors may be used to endorse or promote products derived from
 *  this software without specific prior written permission.
 *  Author: poco
 *
 */

package cn.joywon.poco.admin.api.feign;

import cn.joywon.poco.admin.api.entity.SysTenant;
import cn.joywon.poco.common.core.constant.ServiceNameConstants;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.feign.annotation.NoToken;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;

import java.util.List;

/**
 * @author poco
 * @date 2019/6/19
 * <p>
 * 租户接口
 */
@FeignClient(contextId = "remoteTenantService", value = ServiceNameConstants.UPMS_SERVICE)
public interface RemoteTenantService {

	/**
	 * 查询全部有效租户
	 * @return
	 */
	@NoToken
	@GetMapping("/tenant/list")
	R<List<SysTenant>> list();

}
