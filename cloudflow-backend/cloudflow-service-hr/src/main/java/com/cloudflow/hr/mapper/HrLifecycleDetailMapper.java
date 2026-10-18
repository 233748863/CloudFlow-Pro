package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.HrLifecycleDetail;
import org.apache.ibatis.annotations.Param;

public interface HrLifecycleDetailMapper extends BaseMapper<HrLifecycleDetail> {
    HrLifecycleDetail selectOnboardingDetail(@Param("tenantId") Long tenantId,
                                            @Param("applicationId") Long applicationId);
}
