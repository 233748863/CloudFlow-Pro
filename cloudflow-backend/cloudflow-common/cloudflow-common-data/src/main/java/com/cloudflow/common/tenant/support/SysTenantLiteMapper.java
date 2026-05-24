package com.cloudflow.common.tenant.support;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;

/**
 * sys_tenant 精简视图 Mapper。
 * <p>
 * 仅服务平台级跨租户调度场景。sys_tenant 在 ignore-tables 列表中，
 * MP 不会自动追加租户条件，因此即便在租户上下文中调用也能拿到全量。
 * </p>
 *
 * @author CloudFlow
 */
@Mapper
public interface SysTenantLiteMapper extends BaseMapper<SysTenantLite> {
}
