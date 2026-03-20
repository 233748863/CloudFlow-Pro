package com.cloudflow.hr.config;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.common.datascope.DataScopeHandle;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * HR服务数据权限处理器
 * 实现基于部门的数据权限过滤
 * 
 * 数据权限类型：
 * - 0: 全部数据权限
 * - 1: 自定义数据权限（根据预计算的部门ID列表）
 * - 2: 本级及下级部门数据权限
 * - 3: 本级部门数据权限
 * - 4: 仅本人数据权限
 * 
 * @author CloudFlow
 */
@Component
public class HrDataScopeHandle implements DataScopeHandle {
    
    private static final Logger log = LoggerFactory.getLogger(HrDataScopeHandle.class);

    /**
     * 计算数据权限范围
     * 
     * @param dataScope 数据权限参数对象
     * @return true表示用户拥有全部数据权限，不需要过滤；false表示需要根据dataScope中的部门列表进行过滤
     */
    @Override
    public Boolean calcScope(DataScope dataScope) {
        // 从UserContext获取当前用户信息
        String username = UserContext.getUserName();
        Long deptId = UserContext.getDeptId();
        Integer dsType = UserContext.getDsType();
        List<Long> dsDeptIds = UserContext.getDsDeptIds();
        
        log.debug("计算数据权限范围 - 用户: {}, 部门ID: {}, 数据权限类型: {}, 可访问部门: {}", 
                username, deptId, dsType, dsDeptIds);
        
        // 如果没有登录用户信息，默认只能查看本人数据
        if (username == null || username.trim().isEmpty()) {
            log.warn("未获取到用户信息，默认只能查看本人数据");
            dataScope.setUsername(username);
            dataScope.setDeptList(new ArrayList<>());
            return false;
        }
        
        // 设置用户名（用于仅本人数据权限）
        dataScope.setUsername(username);
        
        // 如果数据权限类型为空，默认为仅本人数据权限
        if (dsType == null) {
            log.debug("数据权限类型为空，默认为仅本人数据权限");
            dataScope.setDeptList(new ArrayList<>());
            return false;
        }
        
        // 根据数据权限类型处理
        switch (dsType) {
            case 0:
                // 全部数据权限
                log.debug("用户拥有全部数据权限");
                return true;
                
            case 1:
                // 自定义数据权限（使用预计算的部门ID列表）
                if (dsDeptIds != null && !dsDeptIds.isEmpty()) {
                    log.debug("使用自定义数据权限，可访问部门: {}", dsDeptIds);
                    dataScope.setDeptList(dsDeptIds);
                    return false;
                } else {
                    log.warn("自定义数据权限但部门列表为空，默认只能查看本人数据");
                    dataScope.setDeptList(new ArrayList<>());
                    return false;
                }
                
            case 2:
                // 本级及下级部门数据权限
                if (deptId != null) {
                    log.debug("本级及下级部门数据权限，当前部门ID: {}", deptId);
                    // 注意：这里只设置当前部门ID，实际的下级部门查询需要在SQL中通过递归查询实现
                    // 或者在登录时预计算所有下级部门ID并存储到 dsDeptIds 中
                    List<Long> deptList = new ArrayList<>();
                    deptList.add(deptId);
                    dataScope.setDeptList(deptList);
                    return false;
                } else {
                    log.warn("本级及下级部门数据权限但部门ID为空，默认只能查看本人数据");
                    dataScope.setDeptList(new ArrayList<>());
                    return false;
                }
                
            case 3:
                // 本级部门数据权限
                if (deptId != null) {
                    log.debug("本级部门数据权限，当前部门ID: {}", deptId);
                    List<Long> deptList = new ArrayList<>();
                    deptList.add(deptId);
                    dataScope.setDeptList(deptList);
                    return false;
                } else {
                    log.warn("本级部门数据权限但部门ID为空，默认只能查看本人数据");
                    dataScope.setDeptList(new ArrayList<>());
                    return false;
                }
                
            case 4:
                // 仅本人数据权限
                log.debug("仅本人数据权限");
                dataScope.setDeptList(new ArrayList<>());
                return false;
                
            default:
                log.warn("未知的数据权限类型: {}，默认只能查看本人数据", dsType);
                dataScope.setDeptList(new ArrayList<>());
                return false;
        }
    }
}
