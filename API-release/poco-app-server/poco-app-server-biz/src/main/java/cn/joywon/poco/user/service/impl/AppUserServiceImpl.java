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
package cn.joywon.poco.user.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.date.DateTime;
import cn.hutool.core.util.ArrayUtil;
import cn.hutool.core.util.StrUtil;
import cn.joywon.poco.common.core.constant.CacheConstants;
import cn.joywon.poco.common.core.constant.CommonConstants;
import cn.joywon.poco.common.core.constant.enums.LoginTypeEnum;
import cn.joywon.poco.common.core.constant.enums.UserTypeEnum;
import cn.joywon.poco.common.core.exception.ErrorCodes;
import cn.joywon.poco.common.core.util.MsgUtils;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.excel.vo.ErrorMessage;
import cn.joywon.poco.common.security.service.PocoUser;
import cn.joywon.poco.common.security.util.SecurityUtils;
import cn.joywon.poco.merchant.MemberModule.dto.UserSyncDTO;
import cn.joywon.poco.merchant.MemberModule.fegin.UserFeignClient;
import cn.joywon.poco.user.api.dto.AppUserDTO;
import cn.joywon.poco.user.api.dto.AppUserInfo;
import cn.joywon.poco.user.api.entity.AppRole;
import cn.joywon.poco.user.api.entity.AppUser;
import cn.joywon.poco.user.api.entity.AppUserRole;
import cn.joywon.poco.user.api.vo.AppUserExcelVO;
import cn.joywon.poco.user.api.vo.AppUserVO;
import cn.joywon.poco.user.mapper.AppUserMapper;
import cn.joywon.poco.user.service.AppRoleService;
import cn.joywon.poco.user.service.AppUserRoleService;
import cn.joywon.poco.user.service.AppUserService;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.toolkit.StringPool;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.validation.BindingResult;
import org.springframework.web.multipart.MultipartFile;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * app用户表
 *
 * @author aeizzz
 * @date 2022-12-07 09:52:03
 */
@Service
@AllArgsConstructor
@Slf4j
public class AppUserServiceImpl extends ServiceImpl<AppUserMapper, AppUser> implements AppUserService {

    private static final PasswordEncoder ENCODER = new BCryptPasswordEncoder();

    private final UserFeignClient userFeignClient;

    private final AppUserRoleService appUserRoleService;

    private final StringRedisTemplate redisTemplate;

    private final AppRoleService appRoleService;

    private final CacheManager cacheManager;

    /**
     * 更新用户
     *
     * @param userDTO
     * @return
     */
    @Override
    @CacheEvict(value = CacheConstants.USER_DETAILS_MINI, key = "#userDTO.userId")
    public Boolean updateUser(AppUserDTO userDTO) {
        AppUser appUser = new AppUser();
        BeanUtils.copyProperties(userDTO, appUser);
        if (StrUtil.isNotBlank(userDTO.getPassword())) {
            appUser.setPassword(ENCODER.encode(userDTO.getPassword()));
        }
        this.updateById(appUser);

        appUserRoleService.remove(Wrappers.<AppUserRole>lambdaQuery().eq(AppUserRole::getUserId, appUser.getUserId()));
        userDTO.getRole().forEach(roleId -> {
            AppUserRole appUserRole = new AppUserRole();
            appUserRole.setRoleId(roleId);
            appUserRole.setUserId(userDTO.getUserId());
            appUserRole.insert();
        });

        return Boolean.TRUE;
    }

    /**
     * 新增用户
     *
     * @param userDTO
     * @return
     */
    @Override
    public Boolean saveUser(AppUserDTO userDTO) {
        AppUser appUser = new AppUser();
        BeanUtils.copyProperties(userDTO, appUser);
        appUser.setDelFlag(CommonConstants.STATUS_NORMAL);
        appUser.setPassword(ENCODER.encode(userDTO.getPassword()));
        baseMapper.insert(appUser);

        // 如果角色为空，赋默认角色
        if (CollUtil.isNotEmpty(userDTO.getRole())) {
            List<AppUserRole> userRoleList = userDTO.getRole().stream().map(roleId -> {
                AppUserRole userRole = new AppUserRole();
                userRole.setUserId(appUser.getUserId());
                userRole.setRoleId(roleId);
                return userRole;
            }).collect(Collectors.toList());
            appUserRoleService.saveBatch(userRoleList);
        }
        return Boolean.TRUE;
    }

    /**
     * 查询全部的用户
     *
     * @param appUser
     * @return
     */
    @Override
    public List<AppUserExcelVO> listUser(AppUserDTO appUser) {
        List<AppUser> appUsers = baseMapper.selectList(null);
        List<AppUserExcelVO> appUserExcelVOS = appUsers.stream().map(item -> {
            AppUserExcelVO appUserExcelVO = new AppUserExcelVO();
            BeanUtils.copyProperties(item, appUserExcelVO);
            return appUserExcelVO;
        }).collect(Collectors.toList());
        return appUserExcelVOS;
    }

    @Override
    public IPage getUsersWithRolePage(Page page, AppUserDTO appUserDTO) {
        return baseMapper.getUserVosPage(page, appUserDTO);
    }

    @Override
    public AppUserInfo findUserInfo(AppUser user) {
        AppUserInfo info = new AppUserInfo();
        info.setAppUser(user);
        // 设置角色列表 （ID）
        List<Long> roleIds = appRoleService.findRolesByUserId(user.getUserId()).stream().map(AppRole::getRoleId).collect(Collectors.toList());
        info.setRoles(ArrayUtil.toArray(roleIds, Long.class));

        // 设置权限列表（menu.permission）
        Set<String> permissions = new HashSet<>();
        info.setPermissions(ArrayUtil.toArray(permissions, String.class));
        return info;
    }

    @Override
    @CacheEvict(value = CacheConstants.USER_DETAILS_MINI, key = "#userDto.userId")
    public R updateUserInfo(AppUserDTO userDto) {
        // C端客户修改手机号需要判断验证码是否正确
        PocoUser user = SecurityUtils.getUser();
        if (UserTypeEnum.TOC.getStatus().equals(user.getUserType()) && StrUtil.isNotBlank(userDto.getPhone())) {
            String key = CacheConstants.DEFAULT_CODE_KEY + LoginTypeEnum.APPSMS.getType() + StringPool.AT + userDto.getPhone();
            String codeObj = redisTemplate.opsForValue().get(key);

            if (!userDto.getMobileCode().equals(codeObj)) {
                return R.failed("验证码错误");
            }
        }

        // 更新密码
        if (StrUtil.isNotBlank(userDto.getPassword())) {
            userDto.setPassword(ENCODER.encode(userDto.getPassword()));
        }

        userDto.setLastModifiedTime(DateTime.now().toLocalDateTime());
        AppUser appUser = baseMapper.selectById(userDto.getUserId());
        BeanUtils.copyProperties(userDto, appUser);

        // 同步商家联盟模块
        UserSyncDTO userSyncDto = BeanUtil.copyProperties(appUser, UserSyncDTO.class);
        log.info("同步用户修改信息至商家联盟模块: {}", userSyncDto);
        userFeignClient.updateUser(userSyncDto);

        return R.ok(this.updateById(appUser));
    }

    @Override
    public AppUserVO selectUserVoById(Long userId) {
        return baseMapper.getUserVoById(userId);
    }

    /**
     * 删除user用户同时删除user-role关系表
     *
     * @param ids userIds
     */
    @Override
    public Boolean deleteAppUserByIds(Long[] ids) {
        Cache cache = cacheManager.getCache(CacheConstants.USER_DETAILS_MINI);
        for (AppUser appUser : baseMapper.selectByIds(CollUtil.toList(ids))) {
            cache.evict(appUser.getUsername());
        }
        // 删除用户关联表
        this.appUserRoleService.remove(Wrappers.<AppUserRole>lambdaQuery().in(AppUserRole::getUserId, CollUtil.toList(ids)));

        this.removeBatchByIds(CollUtil.toList(ids));

        userFeignClient.deleteUser(ids);

        return Boolean.TRUE;

    }

    @Override
    public R registerAppUser(AppUserDTO appUser) {
        List<AppUser> appUserList = baseMapper.selectList(Wrappers.<AppUser>lambdaQuery().eq(AppUser::getPhone, appUser.getPhone()));

        if (CollUtil.isNotEmpty(appUserList)) {
            return R.failed("手机号已注册，请使用验证码直接登录");
        }

        String key = CacheConstants.DEFAULT_CODE_KEY + LoginTypeEnum.APPSMS.getType() + StringPool.AT + appUser.getPhone();
        String codeObj = redisTemplate.opsForValue().get(key);

        if (!appUser.getMobileCode().equals(codeObj)) {
            return R.failed("验证码错误");
        }

        AppUser app = new AppUser();
        BeanUtils.copyProperties(appUser, app);
        appUser.setUsername(app.getPhone());
        appUser.setDelFlag(CommonConstants.STATUS_NORMAL);
        appUser.setPassword(ENCODER.encode(appUser.getPassword()));
        baseMapper.insert(appUser);
        return null;
    }

    @Override
    public R uploadAvatar(MultipartFile file, String dir, Long groupId, String type) {
        return null;
    }

    /**
     * @param excelVOList
     * @param bindingResult
     * @return
     */
    @Override
    public R importUser(List<AppUserExcelVO> excelVOList, BindingResult bindingResult) {
        // 通用校验获取失败的数据
        List<ErrorMessage> errorMessageList = (List<ErrorMessage>) bindingResult.getTarget();

        // 执行数据插入操作 组装 UserDto
        for (AppUserExcelVO excel : excelVOList) {
            // 个性化校验逻辑
            List<AppUser> userList = this.list();
            List<AppRole> roleList = appRoleService.list();

            Set<String> errorMsg = new HashSet<>();
            // 校验用户名是否存在
            boolean exsitUserName = userList.stream().anyMatch(sysUser -> excel.getUsername().equals(sysUser.getUsername()));

            if (exsitUserName) {
                errorMsg.add(MsgUtils.getMessage(ErrorCodes.SYS_USER_USERNAME_EXISTING, excel.getUsername()));
            }

            // 判断输入的角色名称列表是否合法
            List<String> roleNameList = StrUtil.split(excel.getRoleNameList(), StrUtil.COMMA);
            List<AppRole> roleCollList = roleList.stream().filter(role -> roleNameList.stream().anyMatch(name -> role.getRoleName().equals(name))).collect(Collectors.toList());

            if (roleCollList.size() != roleNameList.size()) {
                errorMsg.add(MsgUtils.getMessage(ErrorCodes.SYS_ROLE_ROLENAME_INEXISTENCE, excel.getRoleNameList()));
            }
            // 数据合法情况
            if (CollUtil.isEmpty(errorMsg)) {
                insertExcelUser(excel, roleCollList);
            } else {
                // 数据不合法情况
                errorMessageList.add(new ErrorMessage(excel.getLineNum(), errorMsg));
            }

        }

        if (CollUtil.isNotEmpty(errorMessageList)) {
            return R.failed(errorMessageList);
        }
        return R.ok(null, MsgUtils.getMessage(ErrorCodes.SYS_USER_IMPORT_SUCCEED));

    }

    private void insertExcelUser(AppUserExcelVO excel, List<AppRole> roleCollList) {
        AppUserDTO userDTO = new AppUserDTO();
        userDTO.setUsername(excel.getUsername());
        userDTO.setPhone(excel.getPhone());
        userDTO.setNickname(excel.getNickname());
        userDTO.setName(excel.getName());
        userDTO.setEmail(excel.getEmail());
        // 批量导入初始密码为手机号
        userDTO.setPassword(userDTO.getPhone());
        // 根据角色名称查询角色ID
        List<Long> roleIdList = roleCollList.stream().map(AppRole::getRoleId).collect(Collectors.toList());
        userDTO.setRole(roleIdList);
        // 插入用户
        this.saveUser(userDTO);
    }

}
