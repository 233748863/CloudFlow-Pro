package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.ProbationConfirmation;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDate;
import java.util.List;

/**
 * 转正申请Mapper接口
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Mapper
public interface ProbationConfirmationMapper extends BaseMapper<ProbationConfirmation> {

    /**
     * 查询即将到期的试用期员工（用于转正提醒）
     *
     * @param tenantId 租户ID
     * @param startDate 开始日期
     * @param endDate 结束日期
     * @return 转正申请列表
     */
    List<ProbationConfirmation> selectExpiringProbations(@Param("tenantId") Long tenantId,
                                                          @Param("startDate") LocalDate startDate,
                                                          @Param("endDate") LocalDate endDate);
}
