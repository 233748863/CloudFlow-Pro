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

package cn.joywon.poco.user.mapper;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import cn.joywon.poco.user.api.dto.AppUserDTO;
import cn.joywon.poco.user.api.entity.AppUser;
import cn.joywon.poco.user.api.vo.AppUserVO;
import cn.joywon.poco.common.data.datascope.PocoBaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * app用户表
 *
 * @author aeizzz
 * @date 2022-12-07 09:52:03
 */
@Mapper
public interface AppUserMapper extends PocoBaseMapper<AppUser> {

	IPage<AppUserVO> getUserVosPage(Page page, @Param("query") AppUserDTO appUserDTO);

	AppUserVO getUserVoById(Long userId);

}
