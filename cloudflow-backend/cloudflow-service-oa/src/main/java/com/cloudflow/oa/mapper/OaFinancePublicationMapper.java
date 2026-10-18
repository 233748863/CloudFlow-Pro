package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.PortalFinanceState;
import com.cloudflow.common.core.domain.PortalFinanceVO;
import com.cloudflow.common.core.domain.PortalFinanceAttachment;
import com.cloudflow.common.security.portal.PortalIdentity;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaFinancePublicationMapper {
    PortalFinanceState state(@Param("tenantId") Long tenantId, @Param("id") Long id, @Param("locked") boolean locked);
    boolean activeIdentity(@Param("identity") PortalIdentity identity);
    Page<PortalFinanceVO> opened(Page<PortalFinanceVO> page, @Param("identity") PortalIdentity identity, @Param("keyword") String keyword);
    PortalFinanceState portalDetail(@Param("identity") PortalIdentity identity, @Param("id") Long id);
    List<PortalFinanceAttachment> availableFiles(@Param("tenantId") Long tenantId, @Param("id") Long id, @Param("uploader") String uploader,
            @Param("selected") List<Long> selected, @Param("locked") boolean locked);
    List<PortalFinanceAttachment> publicFiles(@Param("identity") PortalIdentity identity, @Param("id") Long id);
    int publish(@Param("tenantId") Long tenantId, @Param("id") Long id, @Param("version") Integer version,
            @Param("userId") Long userId, @Param("userName") String userName, @Param("files") String files);
    int withdraw(@Param("tenantId") Long tenantId, @Param("id") Long id, @Param("version") Integer version, @Param("userName") String userName);
}
