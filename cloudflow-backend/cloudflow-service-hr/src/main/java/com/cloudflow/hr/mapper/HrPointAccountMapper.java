package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.HrPointAccount;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

public interface HrPointAccountMapper extends BaseMapper<HrPointAccount> {

    /**
     * 行级条件扣减：仅当 available_points 充足时返回 1，否则 0。
     */
    @Update("UPDATE hr_point_account SET available_points = available_points - #{points}, "
            + "total_spent = total_spent + #{points}, update_time = NOW() "
            + "WHERE id = #{accountId} AND tenant_id = #{tenantId} AND available_points >= #{points} AND deleted = 0")
    int debit(@Param("accountId") Long accountId,
              @Param("tenantId") Long tenantId,
              @Param("points") Integer points);

    @Update("UPDATE hr_point_account SET available_points = available_points + #{points}, "
            + "total_earned = total_earned + #{points}, update_time = NOW() "
            + "WHERE id = #{accountId} AND tenant_id = #{tenantId} AND deleted = 0")
    int credit(@Param("accountId") Long accountId,
               @Param("tenantId") Long tenantId,
               @Param("points") Integer points);

    @Update("UPDATE hr_point_account SET available_points = available_points - #{points}, "
            + "frozen_points = frozen_points + #{points}, update_time = NOW() "
            + "WHERE id = #{accountId} AND tenant_id = #{tenantId} AND available_points >= #{points} AND deleted = 0")
    int freeze(@Param("accountId") Long accountId,
               @Param("tenantId") Long tenantId,
               @Param("points") Integer points);

    @Update("UPDATE hr_point_account SET available_points = available_points + #{points}, "
            + "frozen_points = frozen_points - #{points}, update_time = NOW() "
            + "WHERE id = #{accountId} AND tenant_id = #{tenantId} AND frozen_points >= #{points} AND deleted = 0")
    int unfreeze(@Param("accountId") Long accountId,
                 @Param("tenantId") Long tenantId,
                 @Param("points") Integer points);
}
