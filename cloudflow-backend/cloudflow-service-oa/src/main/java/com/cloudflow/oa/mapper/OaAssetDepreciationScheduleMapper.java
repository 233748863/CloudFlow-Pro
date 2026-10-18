package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaAssetDepreciationSchedule;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;

@Mapper
public interface OaAssetDepreciationScheduleMapper extends BaseMapper<OaAssetDepreciationSchedule> {
    OaAssetDepreciationSchedule selectForUpdate(@Param("id") Long id, @Param("tenantId") Long tenantId);

    // 每行租户和资产编号均由已校验且加锁的资产提供，SQL已显式限定归属，无需再次解析补列。
    @InterceptorIgnore(tenantLine = "true")
    int insertPlanned(@Param("tenantId") Long tenantId, @Param("assetId") Long assetId,
                      @Param("periodsJson") String periodsJson,
                      @Param("actor") String actor, @Param("createdAt") LocalDateTime createdAt);

    // 显式按租户、资产、期次版本和未过账状态更新；任一期未命中时由服务回滚整份计划。
    @InterceptorIgnore(tenantLine = "true")
    int updateUnposted(@Param("tenantId") Long tenantId, @Param("assetId") Long assetId,
                       @Param("periodsJson") String periodsJson,
                       @Param("actor") String actor, @Param("updatedAt") LocalDateTime updatedAt);
}
