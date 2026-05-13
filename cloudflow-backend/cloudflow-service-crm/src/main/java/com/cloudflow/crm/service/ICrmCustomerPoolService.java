package com.cloudflow.crm.service;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmCustomerPoolLog;
import com.cloudflow.crm.domain.dto.CrmCustomerAssignDTO;

public interface ICrmCustomerPoolService {

    /** 查询公海池（分页）。 */
    PageResult<CrmCustomer> queryPool(CrmCustomer query, PageQuery pageQuery);

    /** 将客户从负责人处释放到公海。 */
    boolean releaseToPool(Long customerId, String reason);

    /** 从公海中抢单。 */
    boolean claimFromPool(Long customerId, String reason);

    /** 管理员将公海客户指派给某个负责人。 */
    boolean assignFromPool(CrmCustomerAssignDTO assignDTO);

    /** 手动触发自动回收：扫描所有长时间未跟进的客户并自动回池。 */
    int triggerAutoRelease();

    /** 日志列表（指定客户）。 */
    PageResult<CrmCustomerPoolLog> listLogs(Long customerId, PageQuery pageQuery);
}
