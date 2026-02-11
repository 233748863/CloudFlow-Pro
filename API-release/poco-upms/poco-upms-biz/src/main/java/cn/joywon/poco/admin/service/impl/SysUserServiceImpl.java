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

package cn.joywon.poco.admin.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.lang.Assert;
import cn.hutool.core.util.ArrayUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.admin.api.constant.UserStateEnum;
import cn.joywon.poco.admin.api.dto.RegisterUserDTO;
import cn.joywon.poco.admin.api.dto.UserDTO;
import cn.joywon.poco.admin.api.dto.UserInfo;
import cn.joywon.poco.admin.api.entity.*;
import cn.joywon.poco.admin.api.vo.UserExcelVO;
import cn.joywon.poco.admin.api.vo.UserNameVO;
import cn.joywon.poco.admin.api.vo.UserVO;
import cn.joywon.poco.admin.mapper.SysUserMapper;
import cn.joywon.poco.admin.mapper.SysUserPostMapper;
import cn.joywon.poco.admin.mapper.SysUserRoleMapper;
import cn.joywon.poco.admin.service.*;
import cn.joywon.poco.common.audit.annotation.Audit;
import cn.joywon.poco.common.core.constant.CacheConstants;
import cn.joywon.poco.common.core.constant.CommonConstants;
import cn.joywon.poco.common.core.constant.enums.LoginTypeEnum;
import cn.joywon.poco.common.core.exception.CheckedException;
import cn.joywon.poco.common.core.exception.ErrorCodes;
import cn.joywon.poco.common.core.util.MsgUtils;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.data.datascope.DataScope;
import cn.joywon.poco.common.data.resolver.ParamResolver;
import cn.joywon.poco.common.data.tenant.TenantBroker;
import cn.joywon.poco.common.data.tenant.TenantContextHolder;
import cn.joywon.poco.common.excel.vo.ErrorMessage;
import cn.joywon.poco.common.security.service.PocoUser;
import cn.joywon.poco.common.security.util.SecurityUtils;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cloud.context.config.annotation.RefreshScope;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.BindingResult;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * @author poco
 * @date 2017/10/31
 */
@Slf4j
@Service
@RefreshScope
@AllArgsConstructor
public class SysUserServiceImpl extends ServiceImpl<SysUserMapper, SysUser> implements SysUserService {

    @Value("${mini.app-id}")
    private String appId;

    @Value("${mini.app-secret}")
    private String appSecret;

    @Value("${mini.grant-type}")
    private String grantType;

    @Value("${mini.code-2-session-url}")
    private String code2SessionUrl;

    // 商家入驻绑定码缓存键
    private static final String MERCHANT_BIND_CODE_KEY = "merchant:bind:code";

    private RestTemplate restTemplate;

    private RedisTemplate<String, Object> redisTemplate;

    private static final PasswordEncoder ENCODER = new BCryptPasswordEncoder();

    private final SysMenuService sysMenuService;

    private final SysRoleService sysRoleService;

    private final SysPostService sysPostService;

    private final SysDeptService sysDeptService;

    private final SysUserRoleMapper sysUserRoleMapper;

    private final SysUserPostMapper sysUserPostMapper;

    private final CacheManager cacheManager;
    private final SysUserMapper sysUserMapper;

    /**
     * 保存用户信息
     *
     * @param userDto DTO 对象
     * @return success/fail
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Boolean saveUser(UserDTO userDto) {
        SysUser sysUser = new SysUser();
        BeanUtils.copyProperties(userDto, sysUser);
        sysUser.setLockFlag(
                StrUtil.isBlank(userDto.getLockFlag()) ? UserStateEnum.NORMAL.getCode() : userDto.getLockFlag());
        sysUser.setCreateBy(userDto.getUsername());
        sysUser.setUpdateBy(userDto.getUsername());
        sysUser.setPassword(ENCODER.encode(userDto.getPassword()));
        sysUser.setPasswordModifyTime(LocalDateTime.now());
        baseMapper.insert(sysUser);
        // 保存用户岗位信息
        Optional.ofNullable(userDto.getPost()).ifPresent(posts -> {
            posts.stream().map(postId -> {
                SysUserPost userPost = new SysUserPost();
                userPost.setUserId(sysUser.getUserId());
                userPost.setPostId(postId);
                return userPost;
            }).forEach(sysUserPostMapper::insert);
        });

        // 如果角色为空，赋默认角色
        if (CollUtil.isEmpty(userDto.getRole())) {
            // 获取默认角色编码
            String defaultRole = ParamResolver.getStr("USER_DEFAULT_ROLE");
            // 默认角色
            SysRole sysRole = sysRoleService
                    .getOne(Wrappers.<SysRole>lambdaQuery().eq(SysRole::getRoleCode, defaultRole));
            userDto.setRole(Collections.singletonList(sysRole.getRoleId()));
        }

        // 插入用户角色关系表
        userDto.getRole().stream().map(roleId -> {
            SysUserRole userRole = new SysUserRole();
            userRole.setUserId(sysUser.getUserId());
            userRole.setRoleId(roleId);
            return userRole;
        }).forEach(sysUserRoleMapper::insert);
        return Boolean.TRUE;
    }

    /**
     * 商家用户创建参数
     *
     * @param dto 用户创建参数
     * @return 操作结果
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createMerchantUser(UserDTO dto) {
        /* step-1 创建商家部门 */
        Long deptId = sysDeptService.addDeptForMerchant(dto.getUsername(), dto.getUserId());
        Assert.notNull(deptId, () -> new RuntimeException("创建商家过程失败: 商家部门创建失败"));

        /* step-2 创建商家用户 */
        SysUser user = BeanUtil.copyProperties(dto, SysUser.class);
        user.setPassword(ENCODER.encode("123456"));
        user.setDeptId(deptId);
        user.setUserId(null);
        boolean result = save(user);
        Assert.isTrue(result, () -> new RuntimeException("创建商家过程失败: 商家账号创建失败"));
        Long userId = user.getUserId();

        /* step-3 绑定账号岗位 */
        sysPostService.bindMerchantPost(userId);

        /* step-4 绑定账号角色 */
        sysRoleService.bindMerchantRole(userId);

        return deptId;
    }

    /**
     * 通过查用户的全部信息
     *
     * @param sysUser 用户
     * @return
     */
    @Override
    public UserInfo findUserInfo(SysUser sysUser) {
        UserInfo userInfo = new UserInfo();
        userInfo.setSysUser(sysUser);
        // 设置角色列表 （ID）
        List<Long> roleIds = sysRoleService.findRolesByUserId(sysUser.getUserId())
                .stream()
                .map(SysRole::getRoleId)
                .collect(Collectors.toList());
        userInfo.setRoles(ArrayUtil.toArray(roleIds, Long.class));

        // 设置权限列表（menu.permission）
        Set<String> permissions = new HashSet<>();
        roleIds.forEach(roleId -> {
            List<String> permissionList = sysMenuService.findMenuByRoleId(roleId)
                    .stream()
                    .filter(menu -> StrUtil.isNotEmpty(menu.getPermission()))
                    .map(SysMenu::getPermission)
                    .collect(Collectors.toList());
            permissions.addAll(permissionList);
        });
        userInfo.setPermissions(ArrayUtil.toArray(permissions, String.class));
        return userInfo;
    }

    /**
     * 分页查询用户信息（含有角色信息）
     *
     * @param page    分页对象
     * @param userDTO 参数列表
     * @return
     */
    @Override
    public IPage getUsersWithRolePage(Page page, UserDTO userDTO) {
        return baseMapper.getUserVosPage(page, userDTO, DataScope.of());
    }

    /**
     * 通过ID查询用户信息
     *
     * @param id 用户ID
     * @return 用户信息
     */
    @Override
    public UserVO selectUserVoById(Long id) {
        return baseMapper.getUserVoById(id);
    }

    /**
     * 删除用户
     *
     * @param ids 用户ID 列表
     * @return Boolean
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Boolean deleteUserByIds(Long[] ids) {
        // 删除 spring cache
        List<SysUser> userList = baseMapper.selectByIds(CollUtil.toList(ids));
        Cache cache = cacheManager.getCache(CacheConstants.USER_DETAILS);
        for (SysUser sysUser : userList) {
            cache.evict(sysUser.getUsername());
        }

        sysUserRoleMapper.delete(Wrappers.<SysUserRole>lambdaQuery().in(SysUserRole::getUserId, CollUtil.toList(ids)));
        this.removeBatchByIds(CollUtil.toList(ids));
        return Boolean.TRUE;
    }

    @Override
    @CacheEvict(value = CacheConstants.USER_DETAILS, key = "#userDto.username")
    public R<Boolean> updateUserInfo(UserDTO userDto) {
        Long userId = SecurityUtils.getUser().getId();
        SysUser sysUser = new SysUser();
        sysUser.setPhone(userDto.getPhone());
        sysUser.setUserId(userId);
        sysUser.setAvatar(userDto.getAvatar());
        sysUser.setNickname(userDto.getNickname());
        sysUser.setName(userDto.getName());
        sysUser.setEmail(userDto.getEmail());
        return R.ok(this.updateById(sysUser));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "用户更新", spel = "@sysUserMapper.selectById(#userDto.userId)")
    @CacheEvict(value = CacheConstants.USER_DETAILS, key = "#userDto.username")
    public Boolean updateUser(UserDTO userDto) {
        // 更新用户表信息
        SysUser sysUser = new SysUser();
        BeanUtils.copyProperties(userDto, sysUser);
        sysUser.setUpdateTime(LocalDateTime.now());

        if (StrUtil.isNotBlank(userDto.getPassword())) {
            sysUser.setPassword(ENCODER.encode(userDto.getPassword()));
        }

        this.updateById(sysUser);

        // 更新用户角色表
        if (userDto.getRole() != null) {
            sysUserRoleMapper
                    .delete(Wrappers.<SysUserRole>lambdaQuery().eq(SysUserRole::getUserId, userDto.getUserId()));
            userDto.getRole().stream().map(roleId -> {
                SysUserRole userRole = new SysUserRole();
                userRole.setUserId(sysUser.getUserId());
                userRole.setRoleId(roleId);
                return userRole;
            }).forEach(SysUserRole::insert);
        }

        // 更新用户岗位表
        if (userDto.getPost() != null) {
            sysUserPostMapper
                    .delete(Wrappers.<SysUserPost>lambdaQuery().eq(SysUserPost::getUserId, userDto.getUserId()));
            userDto.getPost().stream().map(postId -> {
                SysUserPost userPost = new SysUserPost();
                userPost.setUserId(sysUser.getUserId());
                userPost.setPostId(postId);
                return userPost;
            }).forEach(SysUserPost::insert);
        }

        return Boolean.TRUE;
    }

    /**
     * 查询上级部门的用户信息
     *
     * @param username 用户名
     * @return R
     */
    @Override
    public List<SysUser> listAncestorUsers(String username) {
        SysUser sysUser = this.getOne(Wrappers.<SysUser>query().lambda().eq(SysUser::getUsername, username));

        SysDept sysDept = sysDeptService.getById(sysUser.getDeptId());
        if (sysDept == null) {
            return null;
        }

        Long parentId = sysDept.getParentId();
        return this.list(Wrappers.<SysUser>query().lambda().eq(SysUser::getDeptId, parentId));
    }

    /**
     * 查询全部的用户
     *
     * @param userDTO 查询条件
     * @param ids     ids 用户列表
     * @return list
     */
    @Override
    public List<UserExcelVO> listUser(UserDTO userDTO, Long[] ids) {
        // 根据数据权限查询全部的用户信息
        List<UserVO> voList = baseMapper.selectVoListByScope(userDTO, ids, DataScope.of());
        // 转换成execl 对象输出
        List<UserExcelVO> userExcelVOList = voList.stream().map(userVO -> {
            UserExcelVO excelVO = new UserExcelVO();
            BeanUtils.copyProperties(userVO, excelVO);
            String roleNameList = userVO.getRoleList()
                    .stream()
                    .map(SysRole::getRoleName)
                    .collect(Collectors.joining(StrUtil.COMMA));
            excelVO.setRoleNameList(roleNameList);
            String postNameList = userVO.getPostList()
                    .stream()
                    .map(SysPost::getPostName)
                    .collect(Collectors.joining(StrUtil.COMMA));
            excelVO.setPostNameList(postNameList);
            return excelVO;
        }).collect(Collectors.toList());
        return userExcelVOList;
    }

    /**
     * excel 导入用户, 插入正确的 错误的提示行号
     *
     * @param excelVOList   excel 列表数据
     * @param bindingResult 错误数据
     * @return ok fail
     */
    @Override
    public R importUser(List<UserExcelVO> excelVOList, BindingResult bindingResult) {
        // 通用校验获取失败的数据
        List<ErrorMessage> errorMessageList = (List<ErrorMessage>) bindingResult.getTarget();
        List<SysDept> deptList = sysDeptService.list();
        List<SysRole> roleList = sysRoleService.list();
        List<SysPost> postList = sysPostService.list();

        // 执行数据插入操作 组装 UserDto
        for (UserExcelVO excel : excelVOList) {
            // 个性化校验逻辑
            List<SysUser> userList = this.list();

            Set<String> errorMsg = new HashSet<>();
            // 校验用户名是否存在
            boolean exsitUserName = userList.stream()
                    .anyMatch(sysUser -> excel.getUsername().equals(sysUser.getUsername()));

            if (exsitUserName) {
                errorMsg.add(MsgUtils.getMessage(ErrorCodes.SYS_USER_USERNAME_EXISTING, excel.getUsername()));
            }

            // 判断输入的部门名称列表是否合法
            Optional<SysDept> deptOptional = deptList.stream()
                    .filter(dept -> excel.getDeptName().equals(dept.getName()))
                    .findFirst();
            if (!deptOptional.isPresent()) {
                errorMsg.add(MsgUtils.getMessage(ErrorCodes.SYS_DEPT_DEPTNAME_INEXISTENCE, excel.getDeptName()));
            }

            // 判断输入的角色名称列表是否合法
            List<String> roleNameList = StrUtil.split(excel.getRoleNameList(), StrUtil.COMMA);
            List<SysRole> roleCollList = roleList.stream()
                    .filter(role -> roleNameList.stream().anyMatch(name -> role.getRoleName().equals(name)))
                    .collect(Collectors.toList());

            if (roleCollList.size() != roleNameList.size()) {
                errorMsg.add(MsgUtils.getMessage(ErrorCodes.SYS_ROLE_ROLENAME_INEXISTENCE, excel.getRoleNameList()));
            }

            // 判断输入的部门名称列表是否合法
            List<String> postNameList = StrUtil.split(excel.getPostNameList(), StrUtil.COMMA);
            List<SysPost> postCollList = postList.stream()
                    .filter(post -> postNameList.stream().anyMatch(name -> post.getPostName().equals(name)))
                    .collect(Collectors.toList());

            if (postCollList.size() != postNameList.size()) {
                errorMsg.add(MsgUtils.getMessage(ErrorCodes.SYS_POST_POSTNAME_INEXISTENCE, excel.getPostNameList()));
            }

            // 数据合法情况
            if (CollUtil.isEmpty(errorMsg)) {
                insertExcelUser(excel, deptOptional, roleCollList, postCollList);
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

    /**
     * 插入excel User
     */
    private void insertExcelUser(UserExcelVO excel, Optional<SysDept> deptOptional, List<SysRole> roleCollList,
                                 List<SysPost> postCollList) {
        UserDTO userDTO = new UserDTO();
        userDTO.setUsername(excel.getUsername());
        userDTO.setPhone(excel.getPhone());
        userDTO.setNickname(excel.getNickname());
        userDTO.setName(excel.getName());
        userDTO.setEmail(excel.getEmail());
        userDTO.setLockFlag(excel.getLockFlag());
        // 批量导入初始密码为手机号
        userDTO.setPasswordModifyTime(LocalDateTime.now());
        userDTO.setPassword(userDTO.getPhone());
        // 根据部门名称查询部门ID
        userDTO.setDeptId(deptOptional.get().getDeptId());
        // 插入岗位名称
        List<Long> postIdList = postCollList.stream().map(SysPost::getPostId).collect(Collectors.toList());
        userDTO.setPost(postIdList);
        // 根据角色名称查询角色ID
        List<Long> roleIdList = roleCollList.stream().map(SysRole::getRoleId).collect(Collectors.toList());
        userDTO.setRole(roleIdList);
        // 插入用户
        this.saveUser(userDTO);
    }

    /**
     * 注册用户 赋予用户默认角色
     *
     * @param userDto 用户信息
     * @return success/false
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<Boolean> registerUser(RegisterUserDTO userDto) {
        // 判断用户名是否存在
        boolean usernameExists = this.exists(Wrappers.<SysUser>lambdaQuery()
                .eq(SysUser::getUsername, userDto.getUsername()));
        if (usernameExists) {
            String message = MsgUtils.getMessage(ErrorCodes.SYS_USER_USERNAME_EXISTING, userDto.getUsername());
            return R.failed(message);
        }

        // 判断手机号是否存在
        boolean phoneExists = this.exists(Wrappers.<SysUser>lambdaQuery()
                .eq(SysUser::getPhone, userDto.getPhone()));
        if (phoneExists) {
            String message = MsgUtils.getMessage(ErrorCodes.SYS_USER_PHONE_EXISTING, userDto.getPhone());
            return R.failed(message);
        }

        // 单独的用户避免越权
        UserDTO user = new UserDTO();
        BeanUtils.copyProperties(userDto, user);
        return R.ok(saveUser(user));
    }

    /**
     * 锁定用户
     *
     * @param username 用户名
     * @return
     */
    @Override
    @CacheEvict(value = CacheConstants.USER_DETAILS, key = "#username")
    public R<Boolean> lockUser(String username) {
        SysUser sysUser = baseMapper.selectOne(Wrappers.<SysUser>lambdaQuery().eq(SysUser::getUsername, username));

        if (Objects.nonNull(sysUser)) {
            sysUser.setLockFlag(UserStateEnum.LOCK.getCode());
            baseMapper.updateById(sysUser);
        }
        return R.ok();
    }

    @Override
    @CacheEvict(value = CacheConstants.USER_DETAILS, key = "#userDto.username")
    public R changePassword(UserDTO userDto) {
        SysUser user = baseMapper.selectById(SecurityUtils.getUser().getId());
        if (StrUtil.isEmpty(userDto.getPassword())) {
            return R.failed("原密码不能为空");
        }

        if (!ENCODER.matches(userDto.getPassword(), user.getPassword())) {
            log.info("原密码错误，修改个人信息失败:{}", userDto.getUsername());
            return R.failed(MsgUtils.getMessage(ErrorCodes.SYS_USER_UPDATE_PASSWORDERROR));
        }

        if (StrUtil.isEmpty(userDto.getNewpassword1())) {
            return R.failed("新密码不能为空");
        }
        String password = ENCODER.encode(userDto.getNewpassword1());

        this.update(Wrappers.<SysUser>lambdaUpdate()
                .set(SysUser::getPassword, password)
                .set(SysUser::getPasswordModifyTime, LocalDateTime.now())
                .eq(SysUser::getUserId, user.getUserId()));
        return R.ok();
    }

    @Override
    public R unbinding(String type) {
        PocoUser user = SecurityUtils.getUser();
        LambdaUpdateWrapper<SysUser> wrapper = null;

        // 微信开放平台 （普通用户扫码登录）
        if (type.equals(LoginTypeEnum.WECHAT.getType())) {
            wrapper = Wrappers.<SysUser>lambdaUpdate()
                    .set(SysUser::getWxOpenid, null)
                    .eq(SysUser::getUserId, user.getId());
            // 码云登录 （方便申请）
        } else if (type.equals(LoginTypeEnum.GITEE.getType())) {
            wrapper = Wrappers.<SysUser>lambdaUpdate()
                    .set(SysUser::getGiteeLogin, null)
                    .eq(SysUser::getUserId, user.getId());
            // 企业微信登录
        } else if (type.equals(LoginTypeEnum.WEIXIN_CP.getType())) {
            wrapper = Wrappers.<SysUser>lambdaUpdate()
                    .set(SysUser::getWxCpUserid, null)
                    .eq(SysUser::getUserId, user.getId());
            // 钉钉登录
        } else if (type.equals(LoginTypeEnum.DINGTALK.getType())) {
            wrapper = Wrappers.<SysUser>lambdaUpdate()
                    .set(SysUser::getWxDingUserid, null)
                    .eq(SysUser::getUserId, user.getId());
        }

        if (Objects.isNull(wrapper)) {
            return R.failed("解绑账号类型不存在");
        }
        this.update(wrapper);
        return R.ok();
    }

    @Override
    public R checkPassword(String username, String password) {
        SysUser condition = new SysUser();
        condition.setUsername(username);
        SysUser sysUser = this.getOne(new QueryWrapper<>(condition));

        if (!ENCODER.matches(password, sysUser.getPassword())) {
            log.info("原密码错误");
            return R.failed("密码输入错误");
        } else {
            return R.ok();
        }
    }

    /**
     * 重置用户密码
     *
     * @param userDto 用户信息
     * @return
     */
    @Override
    @CacheEvict(value = CacheConstants.USER_DETAILS, key = "#userDto.username")
    public R<Boolean> resetUserPassword(RegisterUserDTO userDto) {
        // 校验密码
        R checkedPassword = checkPassword(userDto.getUsername(), userDto.getPassword());
        if (!checkedPassword.isOk()) {
            return checkedPassword;
        }

        // 新密码校验
        if (StrUtil.equals(userDto.getPassword(), userDto.getNewpassword1())) {
            return R.failed("新旧密码不能相同");
        }

        // 重置密码
        String password = ENCODER.encode(userDto.getNewpassword1());
        this.update(Wrappers.<SysUser>lambdaUpdate()
                .set(SysUser::getPassword, password)
                .set(SysUser::getPasswordModifyTime, LocalDateTime.now())
                .set(SysUser::getPasswordExpireFlag, CommonConstants.STATUS_NORMAL)
                .eq(SysUser::getUsername, userDto.getUsername()));
        return R.ok();
    }

    @Override
    public List<Long> listUserIdByRoleIds(List<Long> roleIdList) {
        return sysUserRoleMapper.selectList(Wrappers.<SysUserRole>lambdaQuery().in(SysUserRole::getRoleId, roleIdList))
                .stream()
                .map(SysUserRole::getUserId)
                .collect(Collectors.toList());
    }

    /**
     * 根据部门ID列表获取用户ID列表接口
     *
     * @param deptIdList 部门ID列表
     * @return List<Long> 返回结果对象，包含根据部门ID列表获取到的用户ID列表信息
     */
    @Override
    public List<SysUser> listUserIdByDeptIds(List<Long> deptIdList) {
        return baseMapper.selectList(Wrappers.<SysUser>lambdaQuery().in(SysUser::getDeptId, deptIdList));
    }

    /**
     * 商家绑定微信身份
     *
     * @return R 响应结果
     */
    @Override
    public R<?> bindMerchantWithWxJsCode(String userId, String jsCode) {
        /* step-1 检查商家账号绑定状态 */
        SysUser user = getById(userId);
        Assert.notNull(user, () -> {
            log.error("商家绑定微信身份信息出现异常, 无效的用户ID [{}]", user);
            throw new CheckedException("商家账号不存在");
        });
        Assert.isTrue(StrUtil.isBlank(user.getMiniOpenid()), () -> new CheckedException("商家已绑定微信账号, 如需换绑请联系管理员"));

        /* step-2 根据小程序用户jsCode获取用户openId */
        Map<String, String> paramsMap = Map.of(
                "appid", appId,
                "secret", appSecret,
                "js_code", jsCode,
                "grant_type", grantType);
        ResponseEntity<String> response = restTemplate.getForEntity(code2SessionUrl, String.class, paramsMap);
        Assert.isTrue(response.getStatusCode().is2xxSuccessful(), () -> new CheckedException("获取用户openId失败"));

        /* step-3 解析微信返回数据获得用户openId */
        JSONObject jsonData = JSONUtil.parseObj(response.getBody());
        String openId = jsonData.getStr("openid");
        Assert.notBlank(openId, () -> new CheckedException("无效的用户openId"));

        /* step-4 进行绑定 */
        user.setMiniOpenid(openId);
        boolean result = updateById(user);
        Assert.isTrue(result, () -> new RuntimeException("绑定失败, 请重试"));

        /* step-5 删除缓存中的绑定码 */
        redisTemplate.opsForHash().delete(MERCHANT_BIND_CODE_KEY, userId);

        return R.ok();
    }

    /**
     * 根据部门ID获取用户信息
     *
     * @param deptId 部门ID
     * @return 响应结果(用户信息)
     */
    @Override
    public R<SysUser> getUserByDeptId(Long deptId) {
        SysUser entity = lambdaQuery()
                .eq(SysUser::getDeptId, deptId)
                .orderByAsc(SysUser::getCreateTime)
                .last("LIMIT 1")
                .one();
        if (entity == null) {
            return R.failed("找不到用户");
        }

        SysUser user = new SysUser();
        user.setUserId(entity.getUserId());
        user.setDeptId(entity.getDeptId());
        user.setMiniOpenid(entity.getMiniOpenid());

        return R.ok(user);
    }

    /**
     * 根据用户ID列表获取用户名称列表接口
     *
     * @param userIds 用户ID列表
     * @return 查询结果(用户名称列表)
     */
    @Override
    public List<UserNameVO> getUserNames(List<Long> userIds) {
        return sysUserMapper.getUserNames(userIds);
    }

    @Override
    public SysUser getByMiniOpenid(String openId) {
        /* 使用TenantBroker绕过多租户过滤，查询所有租户的数据 */
        return TenantBroker.applyAs((Long) null, (tenantId) -> {
            TenantContextHolder.setTenantSkip();
            try {
                LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();
                wrapper.eq(SysUser::getMiniOpenid, openId);
                return baseMapper.selectOne(wrapper);
            } finally {
                TenantContextHolder.clear();
            }
        });
    }

    @Override
    public SysUser pickOne(String username) {
        /* 使用TenantBroker绕过多租户过滤，查询所有租户的数据 */
        return TenantBroker.applyAs((Long) null, (tenantId) -> {
            TenantContextHolder.setTenantSkip();
            try {
                LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();
                wrapper.eq(SysUser::getUsername, username);
                return baseMapper.selectOne(wrapper);
            } finally {
                TenantContextHolder.clear();
            }
        });
    }

}