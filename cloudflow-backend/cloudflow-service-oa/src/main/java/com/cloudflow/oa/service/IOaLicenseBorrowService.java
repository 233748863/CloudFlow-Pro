package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.oa.domain.OaBorrowReminderLog;
import com.cloudflow.oa.domain.OaLicenseBorrow;
import com.cloudflow.oa.domain.OaLicenseHandoverLog;

import java.util.List;

/**
 * 证照借用服务。
 */
public interface IOaLicenseBorrowService extends IService<OaLicenseBorrow> {

    PageResult<OaLicenseBorrow> queryPage(OaLicenseBorrow query, PageQuery pageQuery);

    PageResult<OaLicenseBorrow> queryOverduePage(PageQuery pageQuery);

    OaLicenseBorrow getBorrowInfo(Long id);

    List<OaLicenseHandoverLog> listHandoverLogs(Long borrowId);

    List<OaBorrowReminderLog> listReminderLogs(Long borrowId);

    String generateBorrowNo();

    boolean createBorrow(OaLicenseBorrow borrow);

    boolean updateBorrow(OaLicenseBorrow borrow);

    boolean removeBorrows(List<Long> ids);

    boolean submitBorrow(Long id);

    boolean cancelBorrow(Long id);

    boolean confirmBorrow(Long id, String remark);

    boolean confirmReturn(Long id, String remark);

    boolean remind(Long id, String remark);

    int scanAndRemindOverdue();
}
