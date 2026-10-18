package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.crm.domain.CrmServiceTicket;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmServiceTicketMapper extends BaseMapper<CrmServiceTicket> {

    CrmServiceTicket lockById(@Param("id") Long id);

    java.util.List<CrmServiceTicket> selectSlaReportTickets(@Param("query") com.cloudflow.crm.domain.dto.CrmSlaReportQuery query,
            @Param("dataScope") DataScope dataScope);

    Page<CrmServiceTicket> selectPageByDataScope(Page<CrmServiceTicket> page,
                                                 @Param("query") CrmServiceTicket query,
                                                 @Param("dataScope") DataScope dataScope);

    CrmServiceTicket selectByIdWithDataScope(@Param("ticketId") Long ticketId,
                                             @Param("dataScope") DataScope dataScope);
}
