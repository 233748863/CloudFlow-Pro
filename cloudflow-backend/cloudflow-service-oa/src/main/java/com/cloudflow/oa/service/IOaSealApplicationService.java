package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.oa.domain.OaBorrowReminderLog;
import com.cloudflow.oa.domain.OaSealApplication;
import com.cloudflow.oa.domain.OaSealHandoverLog;

import java.util.List;

/**
 * 用印申请服务。
 */
public interface IOaSealApplicationService extends IService<OaSealApplication> {

    PageResult<OaSealApplication> queryPage(OaSealApplication query, PageQuery pageQuery);

    PageResult<OaSealApplication> queryOverduePage(PageQuery pageQuery);

    OaSealApplication getApplicationInfo(Long id);

    List<OaSealHandoverLog> listHandoverLogs(Long applicationId);

    List<OaBorrowReminderLog> listReminderLogs(Long applicationId);

    String generateApplicationNo();

    boolean createApplication(OaSealApplication application);

    boolean updateApplication(OaSealApplication application);

    boolean removeApplications(List<Long> ids);

    boolean submitApplication(Long id);

    boolean cancelApplication(Long id);

    boolean confirmBorrow(Long id, String remark);

    boolean confirmBorrow(Long id, String remark, String attachmentUrl);

    boolean confirmReturn(Long id, String remark);

    boolean confirmReturn(Long id, String remark, String attachmentUrl);

    boolean remind(Long id, String remark);

    int scanAndRemindOverdue();
}
