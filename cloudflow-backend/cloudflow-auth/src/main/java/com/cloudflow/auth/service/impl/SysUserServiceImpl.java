package com.cloudflow.auth.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.domain.SysDept;
import com.cloudflow.auth.domain.SysRole;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.domain.SysUserRole;
import com.cloudflow.auth.domain.SysUserPost;
import com.cloudflow.auth.domain.dto.UserInfo;
import com.cloudflow.auth.mapper.SysDeptMapper;
import com.cloudflow.auth.mapper.SysRoleMapper;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.auth.mapper.SysUserPostMapper;
import com.cloudflow.auth.mapper.SysUserRoleMapper;
import com.cloudflow.auth.service.ForcePasswordChangeService;
import com.cloudflow.auth.service.InitialPasswordService;
import com.cloudflow.auth.service.ISysMenuService;
import com.cloudflow.auth.service.ISysUserService;
import com.cloudflow.auth.service.PasswordService;
import com.cloudflow.auth.service.PasswordPolicyService;
import com.cloudflow.auth.service.RoleMutexService;
import com.cloudflow.auth.service.UserSessionRevoker;
import com.cloudflow.auth.service.UserDataScopeService;
import com.cloudflow.auth.service.ISysTenantService;
import com.cloudflow.common.core.constant.CacheConstants;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.event.PasswordResetByAdminEvent;
import com.cloudflow.common.core.event.UserDisabledEvent;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.annotation.HighRiskAction;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.exception.ErrorCodeConstants;
import com.cloudflow.common.core.security.UserDeletionGuardRegistry;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.core.utils.IpUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.time.LocalDateTime;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import com.cloudflow.common.redis.lock.DistributedLock;

/**
 * 用户服务实现
 * 参考 Poco 的缓存架构：
 * - findUserInfo: 按 username 缓存用户信息（含角色+权限）
 * - 用户增删改时自动清除缓存（@CacheEvict）
 */
@Service
public class SysUserServiceImpl implements ISysUserService {

    private static final Logger log = LoggerFactory.getLogger(SysUserServiceImpl.class);

    @Autowired
    private SysUserMapper sysUserMapper;

    @Autowired
    private SysUserRoleMapper sysUserRoleMapper;

    @Autowired
    private SysUserPostMapper sysUserPostMapper;

    @Autowired
    private SysRoleMapper sysRoleMapper;

    @Autowired
    private SysDeptMapper sysDeptMapper;

    @Autowired
    private ISysMenuService sysMenuService;

    @Autowired
    private ISysTenantService tenantService;

    @Autowired
    private PasswordService passwordService;

    @Autowired
    private PasswordPolicyService passwordPolicyService;

    @Autowired
    private InitialPasswordService initialPasswordService;

    @Autowired
    private UserSessionRevoker userSessionRevoker;

    @Autowired
    private UserDeletionGuardRegistry userDeletionGuardRegistry;

    @Autowired
    private UserDataScopeService userDataScopeService;

    @Autowired
    private RoleMutexService roleMutexService;

    @Autowired
    private OutboxPublisher outboxPublisher;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private StringRedisTemplate stringRedisTemplate;

    // ==================== 带缓存的核心方法（参考 Poco） ====================

    @Override
    public UserInfo findUserInfo(String username) {
        return findUserInfo(username, UserContext.getTenantId());
    }

    @Override
    @DistributedLock(key = "'cache:userinfo:' + #tenantId + ':' + #username", waitMs = 500, leaseMs = 10000)
    @Cacheable(value = CacheConstants.USER_DETAILS, key = "#tenantId + ':' + #username", unless = "#result == null")
    public UserInfo findUserInfo(String username, Long tenantId) {
        String nullKey = userInfoNullKey(username, tenantId);
        if (Boolean.TRUE.equals(stringRedisTemplate.hasKey(nullKey))) {
            return null;
        }
        // 查询用户
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysUser::getUserName, username);
        wrapper.eq(tenantId != null, SysUser::getTenantId, tenantId);
        SysUser user = sysUserMapper.selectOne(wrapper);
        if (user == null) {
            stringRedisTemplate.opsForValue().set(nullKey, "1", 30, TimeUnit.SECONDS);
            return null;
        }

        // 查询角色
        List<SysRole> roles = selectRolesByUserId(user.getUserId());
        Set<String> roleKeys = new HashSet<>();
        List<Long> roleIds = new ArrayList<>();
        for (SysRole role : roles) {
            roleKeys.add(role.getRoleKey());
            roleIds.add(role.getRoleId());
        }

        // 通过角色查询权限（利用菜单缓存）
        Set<String> permissions = new HashSet<>();
        for (Long roleId : roleIds) {
            List<String> permList = sysMenuService.findPermsByRoleId(roleId);
            for (String perm : permList) {
                if (StringUtils.hasText(perm)) {
                    for (String p : perm.trim().split(",")) {
                        if (StringUtils.hasText(p)) {
                            permissions.add(p.trim());
                        }
                    }
                }
            }
        }

        // 管理员拥有所有权限
        if (user.getUserId() != null && user.getUserId() == 1L) {
            permissions.add("*:*:*");
        }

        return new UserInfo(user, roleKeys, permissions);
    }

    private String userInfoNullKey(String username, Long tenantId) {
        return "cache:null:userinfo:" + (tenantId == null ? "global" : tenantId) + ":" + username;
    }

    @Override
    @CacheEvict(value = CacheConstants.USER_DETAILS, allEntries = true)
    public void evictUserInfoCache(String username) {
        // 仅清除缓存,方法体为空
    }

    // ==================== 原有方法（增加缓存失效） ====================

    @Override
    @CacheEvict(value = CacheConstants.USER_DETAILS, key = "#tenantId + ':' + #username")
    public void evictUserInfoCache(String username, Long tenantId) {
        // Cache eviction only.
    }

    @Override
    public List<SysUser> selectUserList(SysUser user) {
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();

        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            wrapper.eq(SysUser::getTenantId, tenantId);
        }

        if (user.getDeptId() != null && user.getDeptId() > 0) {
            wrapper.eq(SysUser::getDeptId, user.getDeptId());
        }
        if (StringUtils.hasText(user.getUserName())) {
            wrapper.like(SysUser::getUserName, user.getUserName());
        }
        if (StringUtils.hasText(user.getPhonenumber())) {
            wrapper.like(SysUser::getPhonenumber, user.getPhonenumber());
        }
        if (StringUtils.hasText(user.getStatus())) {
            wrapper.eq(SysUser::getStatus, user.getStatus());
        }

        List<SysUser> users = sysUserMapper.selectList(wrapper);

        for (SysUser u : users) {
            List<SysRole> roles = selectRolesByUserId(u.getUserId());
            if (!roles.isEmpty()) {
                u.setRole(roles.get(0).getRoleName());
                u.setRoleIds(roles.stream().map(SysRole::getRoleId).toArray(Long[]::new));
            }
            if (u.getDeptId() != null && u.getDeptId() > 0) {
                SysDept dept = sysDeptMapper.selectById(u.getDeptId());
                if (dept != null) {
                    u.setDeptName(dept.getDeptName());
                }
            }
        }

        return users;
    }

    @Override
    public SysUser selectUserById(Long userId) {
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysUser::getUserId, userId);

        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            wrapper.eq(SysUser::getTenantId, tenantId);
        }

        SysUser user = sysUserMapper.selectOne(wrapper);
        if (user != null) {
            List<SysRole> roles = selectRolesByUserId(userId);
            if (!roles.isEmpty()) {
                user.setRole(roles.get(0).getRoleKey());
                user.setRoleIds(roles.stream().map(SysRole::getRoleId).toArray(Long[]::new));
            }
        }
        return user;
    }

    @Override
    public SysUser selectUserByUserName(String userName) {
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysUser::getUserName, userName);

        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            wrapper.eq(SysUser::getTenantId, tenantId);
        }

        return sysUserMapper.selectOne(wrapper);
    }

    private List<SysRole> selectRolesByUserId(Long userId) {
        LambdaQueryWrapper<SysUserRole> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysUserRole::getUserId, userId);
        List<SysUserRole> urs = sysUserRoleMapper.selectList(wrapper);
        if (urs.isEmpty()) return new ArrayList<>();

        List<Long> roleIds = urs.stream().map(SysUserRole::getRoleId).collect(Collectors.toList());
        return sysRoleMapper.selectBatchIds(roleIds);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int insertUser(SysUser user) {
        user.setCreateTime(LocalDateTime.now());

        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            user.setTenantId(tenantId);
        }

        // 新增用户前先检查租户配额，避免超额写入后再回滚造成脏数据
        Long targetTenantId = user.getTenantId();
        if (targetTenantId != null && tenantService.isUserLimitReached(targetTenantId)) {
            throw new IllegalStateException("当前租户用户数已达上限，无法新增用户");
        }
        roleMutexService.assertNoConflict(user.getRoleIds(), targetTenantId);

        boolean forcePasswordChange = false;
        if (StringUtils.hasText(user.getPassword())) {
            passwordPolicyService.validateOrThrow(user.getPassword(), user);
            user.setPassword(passwordService.encodePassword(user.getPassword()));
        } else {
            user.setPassword(passwordService.encodePassword(initialPasswordService.requireInitialPassword(targetTenantId)));
            forcePasswordChange = true;
        }
        user.setPwdResetRequired(forcePasswordChange ? ForcePasswordChangeService.REQUIRED : ForcePasswordChangeService.NOT_REQUIRED);

        int result = sysUserMapper.insert(user);

        if (result > 0) {
            SysRole defaultRole = sysRoleMapper.selectPage(new Page<>(1, 1, false),
                new LambdaQueryWrapper<SysRole>()
                    .eq(SysRole::getRoleKey, "common")
                    .eq(targetTenantId != null, SysRole::getTenantId, targetTenantId))
                    .getRecords().stream().findFirst().orElse(null);

            if (defaultRole != null) {
                SysUserRole userRole = new SysUserRole();
                userRole.setUserId(user.getUserId());
                userRole.setRoleId(defaultRole.getRoleId());
                userRole.setTenantId(targetTenantId);
                sysUserRoleMapper.insert(userRole);
            }

            insertUserRole(user);
            insertUserPost(user);
        }

        return result;
    }

    @Override
    @HighRiskAction
    @Audit(name = "更新用户", spel = "#user", oldVal = "@sysUserServiceImpl.selectUserAuditSnapshot(#user.userId)", diff = true, highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    @CacheEvict(value = CacheConstants.USER_DETAILS, allEntries = true)
    public int updateUser(SysUser user) {
        SysUser persisted = sysUserMapper.selectById(user.getUserId());
        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            LambdaQueryWrapper<SysUser> checkWrapper = new LambdaQueryWrapper<>();
            checkWrapper.eq(SysUser::getUserId, user.getUserId())
                       .eq(SysUser::getTenantId, tenantId);
            if (sysUserMapper.selectCount(checkWrapper) == 0) {
                throw new RuntimeException("无权修改此用户");
            }
        }

        if (StringUtils.hasText(user.getPassword())) {
            SysUser passwordContext = persisted != null ? persisted : user;
            passwordPolicyService.validateOrThrow(user.getPassword(), passwordContext);
            user.setPassword(passwordService.encodePassword(user.getPassword()));
        } else {
            user.setPassword(null);
        }
        roleMutexService.assertNoConflict(user.getRoleIds(), persisted != null ? persisted.getTenantId() : UserContext.getTenantId());

        int rows = sysUserMapper.updateById(user);

        LambdaQueryWrapper<SysUserRole> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysUserRole::getUserId, user.getUserId());
        sysUserRoleMapper.delete(wrapper);

        insertUserRole(user);
        replaceUserPostIfSpecified(user);

        // 同时清除用户菜单树缓存
        sysMenuService.evictUserMenuCache(user.getUserId());
        userDataScopeService.refresh(user.getUserId());
        publishUserDisabledEventIfNeeded(persisted, user);
        revokeSessionIfNeeded(persisted, user);

        return rows;
    }

    private void insertUserRole(SysUser user) {
        Long[] roleIds = user.getRoleIds();
        if (roleIds != null && roleIds.length > 0) {
            Long tenantId = user.getTenantId() != null ? user.getTenantId() : UserContext.getTenantId();
            for (Long roleId : roleIds) {
                SysUserRole ur = new SysUserRole();
                ur.setUserId(user.getUserId());
                ur.setRoleId(roleId);
                ur.setTenantId(tenantId);
                sysUserRoleMapper.insert(ur);
            }
        }
    }

    private void replaceUserPostIfSpecified(SysUser user) {
        if (user.getPostIds() == null) {
            return;
        }
        LambdaQueryWrapper<SysUserPost> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysUserPost::getUserId, user.getUserId());
        sysUserPostMapper.delete(wrapper);
        insertUserPost(user);
    }

    private void insertUserPost(SysUser user) {
        Long[] postIds = user.getPostIds();
        if (postIds == null || postIds.length == 0) {
            return;
        }

        Long tenantId = user.getTenantId() != null ? user.getTenantId() : UserContext.getTenantId();
        for (Long postId : postIds) {
            if (postId == null) {
                continue;
            }
            SysUserPost userPost = new SysUserPost();
            userPost.setUserId(user.getUserId());
            userPost.setPostId(postId);
            userPost.setTenantId(tenantId);
            sysUserPostMapper.insert(userPost);
        }
    }

    @Override
    @HighRiskAction
    @Audit(name = "删除用户", highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public int deleteUserByIds(Long[] userIds) {
        Long tenantId = UserContext.getTenantId();

        for (Long userId : userIds) {
            // 先查出用户名用于清除缓存
            SysUser existingUser = sysUserMapper.selectById(userId);
            if (existingUser != null) {
                assertDeletionAllowed(userId);
                evictUserInfoCache(existingUser.getUserName(), existingUser.getTenantId());
                sysMenuService.evictUserMenuCache(userId);
                userSessionRevoker.revokeByUserId(userId);
                userDataScopeService.clear(existingUser.getTenantId(), userId);
            }

            LambdaQueryWrapper<SysUser> userWrapper = new LambdaQueryWrapper<>();
            userWrapper.eq(SysUser::getUserId, userId);
            if (tenantId != null) {
                userWrapper.eq(SysUser::getTenantId, tenantId);
            }
            sysUserMapper.delete(userWrapper);

            LambdaQueryWrapper<SysUserRole> roleWrapper = new LambdaQueryWrapper<>();
            roleWrapper.eq(SysUserRole::getUserId, userId);
            sysUserRoleMapper.delete(roleWrapper);

            LambdaQueryWrapper<SysUserPost> postWrapper = new LambdaQueryWrapper<>();
            postWrapper.eq(SysUserPost::getUserId, userId);
            sysUserPostMapper.delete(postWrapper);
        }
        return userIds.length;
    }

    public SysUser selectUserAuditSnapshot(Long userId) {
        return selectUserById(userId);
    }

    private void assertDeletionAllowed(Long userId) {
        List<String> blockingRefs = userDeletionGuardRegistry.findBlockingReferences(userId);
        if (!blockingRefs.isEmpty()) {
            throw new ServiceException("用户仍存在业务关联，禁止删除: " + String.join("; ", blockingRefs),
                    ErrorCodeConstants.CONCURRENT_MODIFICATION);
        }
    }

    private void revokeSessionIfNeeded(SysUser persisted, SysUser incoming) {
        if (persisted == null || incoming == null) {
            return;
        }
        boolean disabledNow = "1".equals(incoming.getStatus()) && !"1".equals(persisted.getStatus());
        boolean roleChanged = incoming.getRoleIds() != null;
        if (disabledNow || roleChanged) {
            userSessionRevoker.revokeByUserId(incoming.getUserId());
        }
    }

    private void publishUserDisabledEventIfNeeded(SysUser persisted, SysUser incoming) {
        if (persisted == null || incoming == null || incoming.getUserId() == null) {
            return;
        }
        if (!"1".equals(incoming.getStatus()) || "1".equals(persisted.getStatus())) {
            return;
        }

        UserDisabledEvent event = new UserDisabledEvent();
        event.setUserId(incoming.getUserId());
        event.setUserName(StringUtils.hasText(incoming.getNickName()) ? incoming.getNickName() : incoming.getUserName());
        event.setDeptId(incoming.getDeptId() != null ? incoming.getDeptId() : persisted.getDeptId());
        event.setDisabledAt(LocalDateTime.now());

        try {
            BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                    .eventType("USER_DISABLED")
                    .sourceModule("cloudflow-auth")
                    .sourceId(incoming.getUserId())
                    .tenantId(incoming.getTenantId() != null ? incoming.getTenantId() : persisted.getTenantId())
                    .payload(objectMapper.writeValueAsString(event))
                    .build();
            outboxPublisher.publish(envelope);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("用户停用事件序列化失败", e);
        }
    }

    @Override
    @HighRiskAction
    @Audit(name = "重置用户密码", highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public int resetPwd(Long userId, String password) {
        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            LambdaQueryWrapper<SysUser> checkWrapper = new LambdaQueryWrapper<>();
            checkWrapper.eq(SysUser::getUserId, userId)
                       .eq(SysUser::getTenantId, tenantId);
            if (sysUserMapper.selectCount(checkWrapper) == 0) {
                throw new RuntimeException("无权重置此用户密码");
            }
        }

        // 清除用户缓存
        SysUser existingUser = sysUserMapper.selectById(userId);
        if (existingUser != null) {
            evictUserInfoCache(existingUser.getUserName(), existingUser.getTenantId());
        }

        SysUser user = new SysUser();
        user.setUserId(userId);
        user.setPassword(passwordService.encodePassword(password));
        user.setPwdResetRequired(ForcePasswordChangeService.REQUIRED);
        int rows = sysUserMapper.updateById(user);
        if (rows > 0 && existingUser != null) {
            publishPasswordResetEvent(existingUser);
        }
        return rows;
    }

    @Override
    public String checkUserNameUnique(SysUser user) {
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysUser::getUserName, user.getUserName());

        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            wrapper.eq(SysUser::getTenantId, tenantId);
        }

        SysUser info = sysUserMapper.selectOne(wrapper);
        if (info != null && !info.getUserId().equals(user.getUserId())) {
            return "1";
        }
        return "0";
    }

    @Override
    public String checkPhoneUnique(SysUser user) {
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysUser::getPhonenumber, user.getPhonenumber());

        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            wrapper.eq(SysUser::getTenantId, tenantId);
        }

        SysUser info = sysUserMapper.selectOne(wrapper);
        if (info != null && !info.getUserId().equals(user.getUserId())) {
            return "1";
        }
        return "0";
    }

    @Override
    public String checkEmailUnique(SysUser user) {
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysUser::getEmail, user.getEmail());

        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            wrapper.eq(SysUser::getTenantId, tenantId);
        }

        SysUser info = sysUserMapper.selectOne(wrapper);
        if (info != null && !info.getUserId().equals(user.getUserId())) {
            return "1";
        }
        return "0";
    }

    @Override
    public String selectUserRoleGroup(String userName) {
        return "";
    }

    @Override
    public List<SysUser> selectUserByIds(List<Long> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return new ArrayList<>();
        }
        
        return sysUserMapper.selectBatchIds(userIds);
    }

    private void publishPasswordResetEvent(SysUser user) {
        if (user == null || user.getUserId() == null) {
            return;
        }
        try {
            PasswordResetByAdminEvent event = new PasswordResetByAdminEvent();
            event.setUserId(user.getUserId());
            event.setUserName(user.getUserName());
            event.setTenantId(user.getTenantId());
            event.setOperatorId(UserContext.getUserId());
            event.setOperatorName(StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system");
            event.setOperatorIp(resolveClientIp());
            event.setResetAt(LocalDateTime.now());

            BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                    .eventType("PASSWORD_RESET_BY_ADMIN")
                    .sourceModule("cloudflow-auth")
                    .sourceId(user.getUserId())
                    .tenantId(user.getTenantId())
                    .payload(objectMapper.writeValueAsString(event))
                    .build();
            outboxPublisher.publish(envelope);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("密码重置事件序列化失败", e);
        }
    }

    private String resolveClientIp() {
        ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attributes != null && attributes.getRequest() != null) {
            return IpUtils.getIpAddr(attributes.getRequest());
        }
        return "unknown";
    }

}
