package com.cloudflow.common.tenant.support;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.tenant.TenantBroker;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;
import java.util.function.Consumer;

/**
 * 跨租户调度辅助工具。
 * <p>
 * 用于"平台级"定时任务遍历所有活跃租户（status=0 且未过期），
 * 并以每个 tenantId 为上下文调用业务回调。封装：
 * </p>
 * <ul>
 *   <li>{@link #listActiveTenantIds()} —— 返回活跃租户 ID 列表（自动跳过 MP 租户过滤）。</li>
 *   <li>{@link #forEachActiveTenant(Consumer)} —— 遍历活跃租户并以 {@link TenantBroker#runAs} 切换上下文执行回调，单租户异常不影响其它租户。</li>
 * </ul>
 *
 * @author CloudFlow
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TenantIterator {

    private final SysTenantLiteMapper sysTenantLiteMapper;

    /**
     * 查询全部活跃租户 ID。
     * <p>调用方一般不直接使用，推荐用 {@link #forEachActiveTenant(Consumer)} 一次性遍历。</p>
     */
    public List<Long> listActiveTenantIds() {
        return TenantBroker.applyWithoutTenant(v -> {
            LambdaQueryWrapper<SysTenantLite> wrapper = new LambdaQueryWrapper<SysTenantLite>()
                    .select(SysTenantLite::getTenantId)
                    .eq(SysTenantLite::getStatus, "0")
                    .and(w -> w.isNull(SysTenantLite::getExpireTime)
                            .or().gt(SysTenantLite::getExpireTime, LocalDateTime.now()));
            return sysTenantLiteMapper.selectList(wrapper)
                    .stream()
                    .map(SysTenantLite::getTenantId)
                    .toList();
        });
    }

    /**
     * 以每个活跃租户为上下文执行回调。
     * <p>单个租户处理异常会被吞掉并记日志，确保其他租户继续执行。</p>
     */
    public void forEachActiveTenant(Consumer<Long> consumer) {
        List<Long> tenantIds = listActiveTenantIds();
        for (Long tenantId : tenantIds) {
            try {
                TenantBroker.runAs(tenantId, tid -> consumer.accept(tid));
            } catch (Exception e) {
                log.error("[TenantIterator] 处理租户失败, tenantId={}, error={}", tenantId, e.getMessage(), e);
            }
        }
    }
}
