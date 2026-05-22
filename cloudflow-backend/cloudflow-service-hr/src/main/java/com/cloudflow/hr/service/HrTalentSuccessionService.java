package com.cloudflow.hr.service;

import java.util.Map;

/**
 * HR 继任计划业务接口。
 *
 * <p>关键岗位继任计划 + 继任人提名管理，发布走工作流审批，回调里向继任人发 ESS 站内信。
 */
public interface HrTalentSuccessionService {

    Long createPlan(Map<String, Object> payload);

    void updatePlan(Long planId, Map<String, Object> payload);

    Map<String, Object> pagePlans(Map<String, Object> query);

    Map<String, Object> getPlan(Long planId);

    Long addSuccessor(Long planId, Map<String, Object> payload);

    void removeSuccessor(Long successorId);

    String publish(Long planId);
}
