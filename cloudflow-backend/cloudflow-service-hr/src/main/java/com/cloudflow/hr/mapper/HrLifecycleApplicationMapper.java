package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.HrLifecycleApplication;
import com.cloudflow.hr.domain.entity.HrEmployee;

public interface HrLifecycleApplicationMapper extends BaseMapper<HrLifecycleApplication> {
    HrLifecycleApplication lockForUpdate(@org.apache.ibatis.annotations.Param("tenantId") Long tenantId,
                                         @org.apache.ibatis.annotations.Param("id") Long id);
    HrEmployee lockEmployee(@org.apache.ibatis.annotations.Param("tenantId") Long tenantId,
                            @org.apache.ibatis.annotations.Param("id") Long id);
}
