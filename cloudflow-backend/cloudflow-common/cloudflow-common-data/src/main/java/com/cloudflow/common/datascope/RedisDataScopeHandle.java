package com.cloudflow.common.datascope;

import com.cloudflow.common.core.context.UserContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 基于 Redis 缓存的数据权限处理器
 * 
 * 直接从 UserContext 读取登录时已计算好的 dsType 和 dsDeptIds，
 * 不依赖任何 auth 模块的 Mapper，所有微服务都可以使用。
 * 
 * 数据权限类型说明：
 *   0 = 全部数据权限（不过滤）
 *   1 = 自定义部门权限（按 dsDeptIds 过滤）
 *   2 = 本级及下级部门（按 dsDeptIds 过滤，登录时已递归计算）
 *   3 = 本级部门（按 dsDeptIds 过滤，仅当前部门）
 *   4 = 仅本人（按 username 过滤）
 * 
 * @author CloudFlow
 * @date 2026-02-18
 */
@Slf4j
@Component
public class RedisDataScopeHandle implements DataScopeHandle {

    @Override
    public Boolean calcScope(DataScope dataScope) {
        try {
            Long userId = UserContext.getUserId();
            String username = UserContext.getUserName();

            // 未登录用户跳过过滤（网关白名单接口等场景）
            if (userId == null || username == null) {
                log.warn("用户未登录，跳过数据权限校验");
                return true;
            }

            // 业务代码已显式设置了过滤规则，优先使用业务规则
            if (dataScope.getUsername() != null && !dataScope.getUsername().trim().isEmpty()) {
                return false;
            }
            if (dataScope.getDeptList() != null && !dataScope.getDeptList().isEmpty()) {
                return false;
            }

            // 从 UserContext 读取登录时计算好的数据权限信息
            Integer dsType = UserContext.getDsType();
            List<Long> dsDeptIds = UserContext.getDsDeptIds();

            // 未配置数据权限类型，默认仅本人
            if (dsType == null) {
                log.warn("用户{}未配置数据权限类型，默认仅本人权限", username);
                dataScope.setUsername(username);
                return false;
            }

            // 根据权限类型填充 DataScope
            DataScopeTypeEnum scopeType = DataScopeTypeEnum.getByType(dsType);
            if (scopeType == null) {
                log.warn("未知的数据权限类型: {}，默认仅本人权限", dsType);
                dataScope.setUsername(username);
                return false;
            }

            switch (scopeType) {
                case ALL:
                    // 全部数据权限，不需要过滤
                    log.debug("用户{}拥有全部数据权限", username);
                    return true;

                case CUSTOM:
                case OWN_CHILD_LEVEL:
                case OWN_LEVEL:
                    // 这三种类型都通过部门ID列表过滤，登录时已计算好
                    if (dsDeptIds != null && !dsDeptIds.isEmpty()) {
                        dataScope.getDeptList().addAll(dsDeptIds);
                        log.debug("用户{}数据权限类型={}，部门列表={}", username, scopeType, dsDeptIds);
                    } else {
                        // 部门列表为空，降级为仅本人
                        log.warn("用户{}数据权限类型={}但部门列表为空，降级为仅本人", username, scopeType);
                        dataScope.setUsername(username);
                    }
                    return false;

                case SELF_LEVEL:
                    // 仅本人数据
                    dataScope.setUsername(username);
                    log.debug("用户{}仅本人数据权限", username);
                    return false;

                default:
                    log.warn("未处理的数据权限类型: {}", scopeType);
                    dataScope.setUsername(username);
                    return false;
            }

        } catch (Exception e) {
            log.error("计算数据权限范围时发生错误，降级为仅本人权限", e);
            String username = UserContext.getUserName();
            if (username != null) {
                dataScope.setUsername(username);
            }
            return false;
        }
    }
}
