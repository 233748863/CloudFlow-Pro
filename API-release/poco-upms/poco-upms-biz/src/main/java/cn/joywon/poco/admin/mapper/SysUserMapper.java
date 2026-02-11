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

package cn.joywon.poco.admin.mapper;

import cn.joywon.poco.admin.api.dto.UserDTO;
import cn.joywon.poco.admin.api.entity.SysUser;
import cn.joywon.poco.admin.api.vo.UserNameVO;
import cn.joywon.poco.admin.api.vo.UserVO;
import cn.joywon.poco.common.data.datascope.DataScope;
import cn.joywon.poco.common.data.datascope.PocoBaseMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * <p>
 * 用户表 Mapper 接口
 * </p>
 *
 * @author poco
 * @since 2017-10-29
 */
@Mapper
public interface SysUserMapper extends PocoBaseMapper<SysUser> {

	/**
	 * 通过用户名查询用户信息（含有角色信息）
	 * @param username 用户名
	 * @return userVo
	 */
	UserVO getUserVoByUsername(String username);

	/**
	 * 分页查询用户信息（含角色）
	 * @param page 分页
	 * @param userDTO 查询参数
	 * @param dataScope
	 * @return list
	 */
	IPage<UserVO> getUserVosPage(Page page, @Param("query") UserDTO userDTO, DataScope dataScope);

	/**
	 * 通过ID查询用户信息
	 * @param id 用户ID
	 * @return userVo
	 */
	UserVO getUserVoById(Long id);

	/**
	 * 查询用户列表
	 * @param userDTO 查询条件
	 * @param dataScope 数据权限声明
	 * @return
	 */
	List<UserVO> selectVoListByScope(@Param("query") UserDTO userDTO, @Param("ids") Long[] ids, DataScope dataScope);

	/**
	 * 根据用户ID列表获取用户名称列表接口
	 *
	 * @param userIds 用户ID列表
	 * @return 用户名称列表
	 */
    List<UserNameVO> getUserNames(@Param("userIds") List<Long> userIds);

}
