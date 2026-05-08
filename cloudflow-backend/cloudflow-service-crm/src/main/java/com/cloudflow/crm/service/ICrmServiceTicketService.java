package com.cloudflow.crm.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.crm.domain.CrmServiceTicket;

public interface ICrmServiceTicketService extends IService<CrmServiceTicket> {

    PageResult<CrmServiceTicket> queryPage(CrmServiceTicket query, PageQuery pageQuery);

    boolean createTicket(CrmServiceTicket ticket);

    boolean updateTicket(CrmServiceTicket ticket);

    boolean resolveTicket(Long ticketId, String solution);

    boolean closeTicket(Long ticketId);
}
