package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.PortalFileVO;
import com.cloudflow.common.core.domain.PortalTicketVO;
import com.cloudflow.common.security.portal.PortalIdentity;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmServiceTicket;
import java.util.List;
import lombok.Data;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmPortalTicketMapper {
    boolean activeIdentity(@Param("identity") PortalIdentity identity);
    Long lockActiveIdentity(@Param("identity") PortalIdentity identity);
    CrmCustomer customer(@Param("identity") PortalIdentity identity);
    Page<PortalTicketVO> page(Page<PortalTicketVO> page, @Param("identity") PortalIdentity identity,
            @Param("keyword") String keyword, @Param("status") String status);
    PortalTicketVO detail(@Param("identity") PortalIdentity identity, @Param("ticketId") Long ticketId);
    CrmServiceTicket byNumber(@Param("tenantId") Long tenantId, @Param("number") String number);
    List<PortalFileVO> files(@Param("tenantId") Long tenantId, @Param("ticketId") Long ticketId);
    Upload lockUpload(@Param("tenantId") Long tenantId, @Param("fileId") Long fileId);
    int bindFile(@Param("identity") PortalIdentity identity, @Param("ticketId") Long ticketId, @Param("fileId") Long fileId);
    Page<Handler> handlers(Page<Handler> page, @Param("tenantId") Long tenantId, @Param("keyword") String keyword);
    Handler handler(@Param("tenantId") Long tenantId, @Param("userId") Long userId);
    boolean dispatcher(@Param("tenantId") Long tenantId, @Param("userId") Long userId);
    boolean publisher(@Param("tenantId") Long tenantId, @Param("userId") Long userId);

    @Data
    class Upload {
        private Long fileId;
        private Long portalOwnerId;
        private String bizType;
        private String accessType;
        private Integer deleted;
    }

    @Data
    class Handler {
        private Long userId;
        private String name;
        private String department;
    }
}
