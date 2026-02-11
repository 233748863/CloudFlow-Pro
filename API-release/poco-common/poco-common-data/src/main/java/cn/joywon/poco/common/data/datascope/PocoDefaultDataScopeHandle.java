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

package cn.joywon.poco.common.data.datascope;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import cn.joywon.poco.admin.api.entity.SysDept;
import cn.joywon.poco.admin.api.entity.SysRole;
import cn.joywon.poco.admin.api.feign.RemoteDataScopeService;
import cn.joywon.poco.common.core.constant.SecurityConstants;
import cn.joywon.poco.common.core.constant.enums.UserTypeEnum;
import cn.joywon.poco.common.core.util.RetOps;
import cn.joywon.poco.common.security.service.PocoUser;
import cn.joywon.poco.common.security.util.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.GrantedAuthority;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * @author poco
 * @date 2019-09-07
 * <p>
 * 默认data scope 判断处理器
 */

/**
 * @author poco
 * @date 2019-09-07
 * <p>
 * 默认data scope 判断处理器
 */
@RequiredArgsConstructor
public class PocoDefaultDataScopeHandle implements DataScopeHandle {

    private final RemoteDataScopeService dataScopeService;

    @Override
    public Boolean calcScope(DataScope dataScope) {
        // 获取当前用户信息
        PocoUser user = SecurityUtils.getUser();
        
        // 如果用户未登录（匿名访问），跳过数据权限校验
        if (user == null) {
            return true;
        }
        
        // 对于TOC客户端，不进行数据权限校验
        if (UserTypeEnum.TOC.getStatus().equals(user.getUserType())) {
            return true;
        }

        // 业务代码里的规则，覆盖计算规则
        if (StrUtil.isNotBlank(dataScope.getUsername()) || CollUtil.isNotEmpty(dataScope.getDeptList())) {
            return false;
        }

        // 获取用户角色ID列表
        List<String> roleIdList = user.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .filter(authority -> authority.startsWith(SecurityConstants.ROLE))
                .map(authority -> authority.split(StrUtil.UNDERLINE)[1])
                .collect(Collectors.toList());
        if (CollUtil.isEmpty(roleIdList)) {
            return false;
        }

        // 获取角色列表
        List<SysRole> roleList = RetOps.of(dataScopeService.getRoleList(roleIdList))
                .getData()
                .orElseGet(Collections::emptyList);
        if (CollUtil.isEmpty(roleList)) {
            return false;
        }

        // 处理数据权限
        return processDataScope(user, dataScope, roleList);
    }


    /**
     * 处理数据权限
     */
    private boolean processDataScope(PocoUser user, DataScope dataScope, List<SysRole> roleList) {
        List<Long> deptList = dataScope.getDeptList();

        for (SysRole role : roleList) {
            Integer dsType = role.getDsType();

            // 处理不同数据权限类型
            switch (Objects.requireNonNull(DataScopeTypeEnum.getByType(dsType))) {
                case ALL:
                    return true;
                case CUSTOM:
                    handleCustomScope(role, deptList);
                    break;
                case OWN_CHILD_LEVEL:
                    handleOwnChildLevelScope(user, deptList);
                    break;
                case OWN_LEVEL:
                    handleOwnLevelScope(user, deptList);
                    break;
                case SELF_LEVEL:
                    handleSelfLevelScope(user, dataScope);
                    break;
                default:
                    break;
            }
        }

        return false;
    }

    /**
     * 处理自定义数据权限
     */
    private void handleCustomScope(SysRole role, List<Long> deptList) {
        if (StrUtil.isNotBlank(role.getDsScope())) {
            deptList.addAll(Arrays.stream(role.getDsScope().split(StrUtil.COMMA))
                    .map(Long::parseLong)
                    .collect(Collectors.toList()));
        }
    }

    /**
     * 处理本级及下级数据权限
     */
    private void handleOwnChildLevelScope(PocoUser user, List<Long> deptList) {
        List<Long> descendantDeptIds = RetOps.of(dataScopeService.getDescendantList(user.getDeptId()))
                .getData()
                .orElseGet(Collections::emptyList)
                .stream()
                .map(SysDept::getDeptId)
                .collect(Collectors.toList());
        deptList.addAll(descendantDeptIds);
    }

    /**
     * 处理本级数据权限
     */
    private void handleOwnLevelScope(PocoUser user, List<Long> deptList) {
        deptList.add(user.getDeptId());
    }

    /**
     * 处理个人数据权限
     */
    private void handleSelfLevelScope(PocoUser user, DataScope dataScope) {
        dataScope.setUsername(user.getUsername());
    }
}
