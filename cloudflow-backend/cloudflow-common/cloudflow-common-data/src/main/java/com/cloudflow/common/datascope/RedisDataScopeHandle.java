package com.cloudflow.common.datascope;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.context.UserDataScopeSnapshot;
import com.cloudflow.common.redis.core.UserDataScopeStore;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 基于 Redis 缓存的数据权限处理器
 * 
 * 每次计算时优先从 Redis 中的 user:datascope:{tenantId}:{userId} 快照读取，
 * 角色/部门变更后无需重新登录即可生效；若 Redis 不可用或未命中，再回退到 UserContext。
 * 
 * 数据权限类型说明：
 *   0 = 全部数据权限（不过滤）
 *   1 = 自定义部门权限（按 dsDeptIds 过滤）
 *   2 = 本级及下级部门（按 dsDeptIds 过滤，登录时已递归计算）
 *   3 = 本级部门（按 dsDeptIds 过滤，仅当前部门）
 *   4 = 仅本人（按 userId 过滤）
 * 
 * @author CloudFlow
 * @date 2026-02-18
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RedisDataScopeHandle implements DataScopeHandle {

    private final UserDataScopeStore userDataScopeStore;

    @Override
    public Boolean calcScope(DataScope dataScope) {
        try {
            Long userId = UserContext.getUserId();

            // 未登录业务查询默认拒绝，公开接口必须显式使用 DataScopeUtils.skip()。
            if (userId == null) {
                log.warn("用户未登录，数据权限默认拒绝");
                return false;
            }

            // 业务代码已显式设置了过滤规则，优先使用业务规则
            if (dataScope.getUserId() != null) {
                return false;
            }
            if (dataScope.getDeptList() != null && !dataScope.getDeptList().isEmpty()) {
                return false;
            }

            UserDataScopeSnapshot snapshot = loadSnapshot(userId);
            Integer dsType = snapshot != null && snapshot.getDsType() != null
                    ? snapshot.getDsType()
                    : UserContext.getDsType();
            List<Long> dsDeptIds = snapshot != null && snapshot.getDsDeptIds() != null
                    ? snapshot.getDsDeptIds()
                    : UserContext.getDsDeptIds();

            // 未配置数据权限类型，默认仅本人
            if (dsType == null) {
                log.warn("用户{}未配置数据权限类型，默认仅本人权限", userId);
                dataScope.setUserId(userId);
                return false;
            }

            // 根据权限类型填充 DataScope
            DataScopeTypeEnum scopeType = DataScopeTypeEnum.getByType(dsType);
            if (scopeType == null) {
                log.warn("未知的数据权限类型: {}，默认仅本人权限", dsType);
                dataScope.setUserId(userId);
                return false;
            }

            switch (scopeType) {
                case ALL:
                    // 全部数据权限，不需要过滤
                    log.debug("用户{}拥有全部数据权限", userId);
                    return true;

                case CUSTOM:
                case OWN_CHILD_LEVEL:
                case OWN_LEVEL:
                    if (dataScope.isUserOnly()) {
                        dataScope.setUserId(userId);
                        log.debug("用户{}数据权限类型={}，按用户字段过滤", userId, scopeType);
                        return false;
                    }
                    // 这三种类型都通过部门ID列表过滤，登录时已计算好
                    if (dsDeptIds != null && !dsDeptIds.isEmpty()) {
                        dataScope.getDeptList().addAll(dsDeptIds);
                        log.debug("用户{}数据权限类型={}，部门列表={}", userId, scopeType, dsDeptIds);
                    } else {
                        // 部门列表为空，降级为仅本人
                        log.warn("用户{}数据权限类型={}但部门列表为空，降级为仅本人", userId, scopeType);
                        dataScope.setUserId(userId);
                    }
                    return false;

                case SELF_LEVEL:
                    // 仅本人数据
                    dataScope.setUserId(userId);
                    log.debug("用户{}仅本人数据权限", userId);
                    return false;

                default:
                    log.warn("未处理的数据权限类型: {}", scopeType);
                    dataScope.setUserId(userId);
                    return false;
            }

        } catch (Exception e) {
            log.error("计算数据权限范围时发生错误，降级为仅本人权限", e);
            Long userId = UserContext.getUserId();
            if (userId != null) {
                dataScope.setUserId(userId);
            }
            return false;
        }
    }

    private UserDataScopeSnapshot loadSnapshot(Long userId) {
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null || userId == null) {
            return null;
        }
        try {
            return userDataScopeStore.get(tenantId, userId);
        } catch (Exception e) {
            log.warn("读取 Redis 数据权限快照失败, tenantId={}, userId={}", tenantId, userId, e);
            return null;
        }
    }
}
