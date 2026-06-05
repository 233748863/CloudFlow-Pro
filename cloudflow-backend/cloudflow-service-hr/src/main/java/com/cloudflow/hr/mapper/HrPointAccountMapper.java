package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.HrPointAccount;
import org.apache.ibatis.annotations.Param;

public interface HrPointAccountMapper extends BaseMapper<HrPointAccount> {

    /**
     * 行级条件扣减：仅当 available_points 充足时返回 1，否则 0。
     */
    int debit(@Param("accountId") Long accountId,
              @Param("tenantId") Long tenantId,
              @Param("points") Integer points);

    int credit(@Param("accountId") Long accountId,
               @Param("tenantId") Long tenantId,
               @Param("points") Integer points);

    int freeze(@Param("accountId") Long accountId,
               @Param("tenantId") Long tenantId,
               @Param("points") Integer points);

    int unfreeze(@Param("accountId") Long accountId,
                 @Param("tenantId") Long tenantId,
                 @Param("points") Integer points);
}
