package com.cloudflow.crm.service;

import com.cloudflow.crm.domain.CrmHandoverTask;

import java.util.List;

/**
 * CRM 交接待办服务（针对员工离职场景）。
 */
public interface CrmHandoverTaskService {

    /**
     * 根据员工离职事件生成交接待办。
     *
     * @param fromOwnerUserId 原负责人 userId
     * @param fromOwnerName   姓名快照
     * @param fromDeptId      原部门
     * @param eventId         Redis Stream 消息 ID，用于幂等去重
     * @return 生成的任务数量
     */
    int generateForEmployeeLeft(Long fromOwnerUserId, String fromOwnerName, Long fromDeptId, String eventId);

    List<CrmHandoverTask> listPending(Long fromOwnerId);

    int reassign(Long handoverId, Long toOwnerUserId, String toOwnerName, String remark);

    int close(Long handoverId, String remark);
}
