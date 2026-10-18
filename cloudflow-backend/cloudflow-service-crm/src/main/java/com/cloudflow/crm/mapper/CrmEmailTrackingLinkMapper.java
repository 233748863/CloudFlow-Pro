package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.crm.domain.CrmEmailTrackingLink;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmEmailTrackingLinkMapper extends BaseMapper<CrmEmailTrackingLink> {
    @InterceptorIgnore(tenantLine = "true")
    CrmEmailTrackingLink selectByTokenHash(@Param("tokenHash") String tokenHash);

    CrmEmailTrackingLink selectForUpdate(@Param("tenantId") Long tenantId, @Param("linkId") Long linkId);
}
