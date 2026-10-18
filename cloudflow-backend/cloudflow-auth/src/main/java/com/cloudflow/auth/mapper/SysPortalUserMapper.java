package com.cloudflow.auth.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.auth.domain.SysPortalUser;
import com.cloudflow.auth.portal.PortalDeliveryView;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface SysPortalUserMapper extends BaseMapper<SysPortalUser> {
    SysPortalUser lockAccount(@Param("tenantId") Long tenantId, @Param("account") String account);

    SysPortalUser lockContact(@Param("tenantId") Long tenantId, @Param("contactId") Long contactId);

    SysPortalUser lockId(@Param("tenantId") Long tenantId, @Param("portalUserId") Long portalUserId);

    SysPortalUser lockActivation(@Param("tenantId") Long tenantId, @Param("activationHash") String activationHash);

    int writeState(@Param("user") SysPortalUser user);

    PortalDeliveryView latestDelivery(@Param("tenantId") Long tenantId, @Param("portalUserId") Long portalUserId);
}
