package com.cloudflow.crm.service;

public interface ICrmNotificationService {

    /** 扫描跟进逾期的客户，发布OA通知。 */
    int dispatchFollowUpOverdue();

    /** 扫描即将/已到期回款，发布OA通知。 */
    int dispatchReceivableDue();

    /** 扫描商机停滞 N 天，发布OA通知。 */
    int dispatchStalledOpportunity();

    /** 扫描工单SLA即将到期/已超时，发布OA通知。 */
    int dispatchTicketSlaDue();

    /** 三合一执行一次扫描。 */
    int dispatchAll();
}
