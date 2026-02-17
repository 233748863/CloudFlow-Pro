package com.cloudflow.auth.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysDept;
import com.cloudflow.auth.domain.SysRole;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.domain.SysUserRole;
import com.cloudflow.auth.mapper.SysDeptMapper;
import com.cloudflow.auth.mapper.SysRoleMapper;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.auth.mapper.SysUserRoleMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.common.datascope.DataScopeHandle;
import com.cloudflow.common.datascope.DataScopeTypeEnum;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.stream.Collectors;

/**
 * CloudFlow Auth模块数据权限处理器实现（已废弃）
 * 
 * 此实现依赖 auth 模块的 Mapper，仅在 auth 服务中可用。
 * 已被 {@link com.cloudflow.common.datascope.RedisDataScopeHandle} 替代，
 * 新实现从 UserContext 读取登录时预计算的权限信息，所有微服务通用。
 * 
 * @author CloudFlow
 * @date 2026-02-12
 * @deprecated 使用 RedisDataScopeHandle 替代
 */
@Slf4j
@Deprecated
// @Component  // 已废弃，由 RedisDataScopeHandle 替代
public class AuthDataScopeHandleImpl implements DataScopeHandle {
    
    @Autowired
    private ApplicationContext applicationContext;
    
    // 延迟获取Mapper,避免循环依赖
    private SysUserMapper sysUserMapper;
    private SysUserRoleMapper sysUserRoleMapper;
    private SysRoleMapper sysRoleMapper;
    private SysDeptMapper sysDeptMapper;
    
    private SysUserMapper getSysUserMapper() {
        if (sysUserMapper == null) {
            sysUserMapper = applicationContext.getBean(SysUserMapper.class);
        }
        return sysUserMapper;
    }
    
    private SysUserRoleMapper getSysUserRoleMapper() {
        if (sysUserRoleMapper == null) {
            sysUserRoleMapper = applicationContext.getBean(SysUserRoleMapper.class);
        }
        return sysUserRoleMapper;
    }
    
    private SysRoleMapper getSysRoleMapper() {
        if (sysRoleMapper == null) {
            sysRoleMapper = applicationContext.getBean(SysRoleMapper.class);
        }
        return sysRoleMapper;
    }
    
    private SysDeptMapper getSysDeptMapper() {
        if (sysDeptMapper == null) {
            sysDeptMapper = applicationContext.getBean(SysDeptMapper.class);
        }
        return sysDeptMapper;
    }

    @Override
    public Boolean calcScope(DataScope dataScope) {
        try {
            // 获取当前用户信息
            Long userId = UserContext.getUserId();
            String username = UserContext.getUserName();
            Long deptId = UserContext.getDeptId();
            
            // 如果用户未登录,跳过数据权限校验
            if (userId == null || username == null) {
                log.warn("用户未登录,跳过数据权限校验");
                return true;
            }
            
            // 业务代码里已经设置了规则,覆盖计算规则
            if (dataScope.getUsername() != null && !dataScope.getUsername().trim().isEmpty()) {
                return false;
            }
            if (dataScope.getDeptList() != null && !dataScope.getDeptList().isEmpty()) {
                return false;
            }
            
            // 获取用户的角色数据权限类型
            Integer dsType = getUserDataScopeType(userId);
            
            if (dsType == null) {
                log.warn("用户{}没有配置数据权限类型,默认仅本人权限", username);
                // 默认给予本人权限
                dataScope.setUsername(username);
                return false;
            }
            
            // 根据数据权限类型处理
            DataScopeTypeEnum scopeType = DataScopeTypeEnum.getByType(dsType);
            if (scopeType == null) {
                log.warn("未知的数据权限类型: {}", dsType);
                return false;
            }
            
            return processDataScope(dataScope, scopeType, userId, username, deptId);
            
        } catch (Exception e) {
            log.error("计算数据权限范围时发生错误", e);
            // 发生异常时,为安全起见,不给予任何权限
            return false;
        }
    }
    
    /**
     * 根据数据权限类型处理权限范围
     * 
     * @param dataScope 数据权限参数
     * @param scopeType 权限类型
     * @param userId 用户ID
     * @param username 用户名
     * @param deptId 部门ID
     * @return true表示全部权限,false表示需要过滤
     */
    private boolean processDataScope(DataScope dataScope, DataScopeTypeEnum scopeType, 
                                     Long userId, String username, Long deptId) {
        switch (scopeType) {
            case ALL:
                // 全部数据权限,不需要过滤
                log.debug("用户{}拥有全部数据权限", username);
                return true;
                
            case CUSTOM:
                // 自定义权限,需要从角色配置中获取部门ID列表
                handleCustomScope(dataScope, userId);
                return false;
                
            case OWN_CHILD_LEVEL:
                // 本级及下级权限
                handleOwnChildLevelScope(dataScope, deptId);
                return false;
                
            case OWN_LEVEL:
                // 本级权限
                handleOwnLevelScope(dataScope, deptId);
                return false;
                
            case SELF_LEVEL:
                // 本人权限
                handleSelfLevelScope(dataScope, username);
                return false;
                
            default:
                log.warn("未处理的数据权限类型: {}", scopeType);
                return false;
        }
    }
    
    /**
     * 处理自定义数据权限
     * 从角色的ds_scope字段解析部门ID列表
     * 
     * @param dataScope 数据权限参数
     * @param userId 用户ID
     */
    private void handleCustomScope(DataScope dataScope, Long userId) {
        String dsScope = getUserDsScope(userId);
        if (dsScope != null && !dsScope.trim().isEmpty()) {
            try {
                List<Long> deptIds = Arrays.stream(dsScope.split(","))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .map(Long::parseLong)
                    .collect(Collectors.toList());
                dataScope.getDeptList().addAll(deptIds);
                log.debug("用户{}自定义数据权限部门列表: {}", userId, deptIds);
            } catch (NumberFormatException e) {
                log.error("解析自定义数据权限部门ID失败: {}", dsScope, e);
            }
        } else {
            log.warn("用户{}配置了自定义数据权限,但未设置部门范围", userId);
        }
    }
    
    /**
     * 处理本级及下级数据权限
     * 查询当前部门及所有下级部门
     * 
     * @param dataScope 数据权限参数
     * @param deptId 当前用户部门ID
     */
    private void handleOwnChildLevelScope(DataScope dataScope, Long deptId) {
        if (deptId == null) {
            log.warn("用户部门ID为空,无法计算本级及下级权限");
            return;
        }
        
        // 添加本部门
        dataScope.getDeptList().add(deptId);
        
        // 查询所有下级部门
        List<Long> childDeptIds = getDescendantDeptIds(deptId);
        dataScope.getDeptList().addAll(childDeptIds);
        
        log.debug("本级及下级权限部门列表: {}", dataScope.getDeptList());
    }
    
    /**
     * 处理本级数据权限
     * 仅查看本部门数据
     * 
     * @param dataScope 数据权限参数
     * @param deptId 当前用户部门ID
     */
    private void handleOwnLevelScope(DataScope dataScope, Long deptId) {
        if (deptId == null) {
            log.warn("用户部门ID为空,无法计算本级权限");
            return;
        }
        
        dataScope.getDeptList().add(deptId);
        log.debug("本级权限部门: {}", deptId);
    }
    
    /**
     * 处理本人数据权限
     * 仅查看个人创建的数据
     * 
     * @param dataScope 数据权限参数
     * @param username 用户名
     */
    private void handleSelfLevelScope(DataScope dataScope, String username) {
        dataScope.setUsername(username);
        log.debug("本人权限用户: {}", username);
    }
    
    /**
     * 获取用户的数据权限类型
     * 如果用户有多个角色,取权限最大的(数值最小的)
     * 
     * @param userId 用户ID
     * @return 数据权限类型
     */
    private Integer getUserDataScopeType(Long userId) {
        try {
            // 查询用户角色关联
            LambdaQueryWrapper<SysUserRole> userRoleWrapper = new LambdaQueryWrapper<>();
            userRoleWrapper.eq(SysUserRole::getUserId, userId);
            List<SysUserRole> userRoles = getSysUserRoleMapper().selectList(userRoleWrapper);
            
            if (userRoles == null || userRoles.isEmpty()) {
                log.warn("用户{}没有分配角色", userId);
                return null;
            }
            
            // 获取角色ID列表
            List<Long> roleIds = userRoles.stream()
                .map(SysUserRole::getRoleId)
                .collect(Collectors.toList());
            
            // 查询角色信息
            List<SysRole> roles = getSysRoleMapper().selectBatchIds(roleIds);
            
            if (roles == null || roles.isEmpty()) {
                log.warn("用户{}的角色信息不存在", userId);
                return null;
            }
            
            // 如果用户有多个角色,取权限最大的(数值最小的)
            // 0=全部 < 1=自定义 < 2=本级及下级 < 3=本级 < 4=本人
            return roles.stream()
                .map(SysRole::getDsType)
                .filter(Objects::nonNull)
                .min(Integer::compareTo)
                .orElse(null);
                
        } catch (Exception e) {
            log.error("获取用户{}数据权限类型失败", userId, e);
            return null;
        }
    }
    
    /**
     * 获取用户角色的自定义权限范围
     * 如果用户有多个角色,合并所有角色的自定义权限范围
     * 
     * @param userId 用户ID
     * @return 部门ID列表字符串(逗号分隔)
     */
    private String getUserDsScope(Long userId) {
        try {
            // 查询用户角色关联
            LambdaQueryWrapper<SysUserRole> userRoleWrapper = new LambdaQueryWrapper<>();
            userRoleWrapper.eq(SysUserRole::getUserId, userId);
            List<SysUserRole> userRoles = getSysUserRoleMapper().selectList(userRoleWrapper);
            
            if (userRoles == null || userRoles.isEmpty()) {
                return null;
            }
            
            // 获取角色ID列表
            List<Long> roleIds = userRoles.stream()
                .map(SysUserRole::getRoleId)
                .collect(Collectors.toList());
            
            // 查询角色信息
            List<SysRole> roles = getSysRoleMapper().selectBatchIds(roleIds);
            
            if (roles == null || roles.isEmpty()) {
                return null;
            }
            
            // 合并所有角色的自定义权限范围
            return roles.stream()
                .map(SysRole::getDsScope)
                .filter(Objects::nonNull)
                .filter(s -> !s.trim().isEmpty())
                .collect(Collectors.joining(","));
                
        } catch (Exception e) {
            log.error("获取用户{}自定义权限范围失败", userId, e);
            return null;
        }
    }
    
    /**
     * 获取指定部门的所有下级部门ID列表
     * 通过ancestors字段快速查询所有下级部门
     * 
     * @param deptId 部门ID
     * @return 下级部门ID列表
     */
    private List<Long> getDescendantDeptIds(Long deptId) {
        try {
            // 查询所有部门
            List<SysDept> allDepts = getSysDeptMapper().selectList(null);
            
            if (allDepts == null || allDepts.isEmpty()) {
                return new ArrayList<>();
            }
            
            // 过滤出所有下级部门
            // ancestors字段格式: "0,100,101" 表示祖先部门ID链
            return allDepts.stream()
                .filter(dept -> dept.getAncestors() != null && 
                               (dept.getAncestors().contains("," + deptId + ",") ||
                                dept.getAncestors().endsWith("," + deptId)))
                .map(SysDept::getDeptId)
                .collect(Collectors.toList());
                
        } catch (Exception e) {
            log.error("获取部门{}的下级部门失败", deptId, e);
            return new ArrayList<>();
        }
    }
}
