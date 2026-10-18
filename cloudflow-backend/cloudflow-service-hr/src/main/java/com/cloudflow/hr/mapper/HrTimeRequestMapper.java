package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.HrTimeRequest;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface HrTimeRequestMapper extends BaseMapper<HrTimeRequest> {
    List<HrTimeRequest> selectApprovedOverlapping(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId,
                                                @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);
}
