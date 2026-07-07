package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.oa.constant.OaBusinessTypes;
import com.cloudflow.oa.domain.OaContract;
import com.cloudflow.oa.domain.OaBorrowReminderLog;
import com.cloudflow.oa.domain.OaSeal;
import com.cloudflow.oa.domain.OaSealApplication;
import com.cloudflow.oa.domain.OaSealHandoverLog;
import com.cloudflow.oa.domain.dto.InternalWorkflowStartDTO;
import com.cloudflow.oa.domain.dto.WorkflowProcessStartDTO;
import com.cloudflow.oa.event.SealApplicationSubmittedEvent;
import com.cloudflow.oa.mapper.OaContractMapper;
import com.cloudflow.oa.mapper.OaBorrowReminderLogMapper;
import com.cloudflow.oa.mapper.OaSealApplicationMapper;
import com.cloudflow.oa.mapper.OaSealHandoverLogMapper;
import com.cloudflow.oa.mapper.OaSealMapper;
import com.cloudflow.oa.service.IOaSealApplicationService;
import com.cloudflow.oa.service.IOaTraceEventService;
import com.cloudflow.oa.service.ISysNoticeService;
import com.cloudflow.oa.service.remote.RemoteWorkflowService;
import com.cloudflow.oa.util.OaAttachmentUrlUtils;
import com.cloudflow.oa.util.OaBorrowConstants;
import com.cloudflow.oa.util.OaContractConstants;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.redis.lock.DistributedLock;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 用印申请服务实现。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OaSealApplicationServiceImpl extends ServiceImpl<OaSealApplicationMapper, OaSealApplication>
        implements IOaSealApplicationService {

    private final OaSealMapper sealMapper;
    private final OaContractMapper contractMapper;
    private final OaSealHandoverLogMapper handoverLogMapper;
    private final OaBorrowReminderLogMapper reminderLogMapper;
    private final RemoteWorkflowService remoteWorkflowService;
    private final OaWorkflowFailureHelper workflowFailureHelper;
    private final IOaTraceEventService oaTraceEventService;
    private final ISysNoticeService sysNoticeService;
    private final OutboxPublisher outboxPublisher;
    private final ObjectMapper objectMapper;

    @Override
    public PageResult<OaSealApplication> queryPage(OaSealApplication query, PageQuery pageQuery) {
        Page<OaSealApplication> page = baseMapper.selectPageByDataScope(pageQuery.build(), query, DataScopeUtils.listScope());
        return PageResult.build(page);
    }

    @Override
    public PageResult<OaSealApplication> queryOverduePage(PageQuery pageQuery) {
        OaSealApplication query = new OaSealApplication();
        query.setStatus(OaBorrowConstants.STATUS_OVERDUE);
        return queryPage(query, pageQuery);
    }

    @Override
    public OaSealApplication getApplicationInfo(Long id) {
        return requireApplication(id);
    }

    @Override
    public List<OaSealHandoverLog> listHandoverLogs(Long applicationId) {
        return handoverLogMapper.selectList(new LambdaQueryWrapper<OaSealHandoverLog>()
                .eq(OaSealHandoverLog::getApplicationId, applicationId)
                .orderByDesc(OaSealHandoverLog::getActionTime));
    }

    @Override
    public List<OaBorrowReminderLog> listReminderLogs(Long applicationId) {
        return reminderLogMapper.selectList(new LambdaQueryWrapper<OaBorrowReminderLog>()
                .eq(OaBorrowReminderLog::getBusinessType, OaBorrowConstants.BUSINESS_TYPE_SEAL)
                .eq(OaBorrowReminderLog::getBusinessId, applicationId)
                .orderByDesc(OaBorrowReminderLog::getReminderTime));
    }

    @Override
    public String generateApplicationNo() {
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        Integer maxSeq = sealMapper.getTodayApplicationMaxSeq();
        int nextSeq = (maxSeq == null ? 0 : maxSeq) + 1;
        return String.format("YY%s%04d", today, nextSeq);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean createApplication(OaSealApplication application) {
        normalizeAndValidate(application);
        OaSeal seal = requireAvailableSeal(application.getSealId(), false);
        assertNoReservationConflict(null, application.getSealId(),
                resolveBorrowTime(application.getExpectedBorrowTime()), application.getExpectedReturnTime());
        LocalDateTime now = LocalDateTime.now();
        application.setTenantId(resolveTenantId());
        application.setApplicationNo(generateApplicationNo());
        application.setSealName(seal.getSealName());
        fillContractSnapshot(application);
        application.setUserId(UserContext.getUserId());
        application.setUserName(UserContext.getUserName());
        application.setDeptId(UserContext.getDeptId());
        application.setDeptName(UserContext.getDeptName());
        application.setStatus(OaBorrowConstants.STATUS_DRAFT);
        application.setDeleted(0);
        application.setCreateBy(UserContext.getUserName());
        application.setCreateTime(now);
        application.setUpdateBy(UserContext.getUserName());
        application.setUpdateTime(now);
        boolean saved = save(application);
        traceSeal(application, "SEAL_APPLICATION_CREATED", "用印申请创建", application.getApplicationNo());
        return saved;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "更新用印申请", highRisk = true)
    public boolean updateApplication(OaSealApplication application) {
        if (application == null || application.getId() == null) {
            throw new IllegalArgumentException("用印申请ID不能为空");
        }
        OaSealApplication persisted = requireApplication(application.getId());
        if (!OaBorrowConstants.STATUS_DRAFT.equals(persisted.getStatus())) {
            throw new IllegalArgumentException("只有草稿状态可以编辑");
        }
        normalizeAndValidate(application);
        OaSeal seal = requireAvailableSeal(application.getSealId(), false);
        assertNoReservationConflict(application.getId(), application.getSealId(),
                resolveBorrowTime(application.getExpectedBorrowTime()), application.getExpectedReturnTime());
        application.setApplicationNo(persisted.getApplicationNo());
        application.setSealName(seal.getSealName());
        fillContractSnapshot(application);
        application.setUserId(persisted.getUserId());
        application.setUserName(persisted.getUserName());
        application.setDeptId(persisted.getDeptId());
        application.setDeptName(persisted.getDeptName());
        application.setStatus(OaBorrowConstants.STATUS_DRAFT);
        application.setDeleted(0);
        application.setUpdateBy(UserContext.getUserName());
        application.setUpdateTime(LocalDateTime.now());
        boolean updated = updateById(application);
        traceSeal(application, "SEAL_APPLICATION_UPDATED", "用印申请更新", application.getApplicationNo());
        return updated;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "删除用印申请", highRisk = true)
    public boolean removeApplications(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return true;
        }
        for (Long id : ids) {
            OaSealApplication application = requireApplication(id);
            if (!OaBorrowConstants.STATUS_DRAFT.equals(application.getStatus())
                    && !OaBorrowConstants.STATUS_CANCELLED.equals(application.getStatus())
                    && !OaBorrowConstants.STATUS_REJECTED.equals(application.getStatus())) {
                throw new IllegalArgumentException("只有草稿、已取消或已驳回的用印申请可以删除");
            }
            OaSealApplication update = new OaSealApplication();
            update.setId(id);
            update.setDeleted(1);
            update.setUpdateBy(UserContext.getUserName());
            update.setUpdateTime(LocalDateTime.now());
            updateById(update);
            traceSeal(application, "SEAL_APPLICATION_DELETED", "用印申请删除", application.getApplicationNo());
        }
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    // M1-5: 防并发冲突
    @DistributedLock(key = "'seal:application:' + #id + ':submit'")
    public boolean submitApplication(Long id) {
        OaSealApplication application = requireApplication(id);
        if (!OaBorrowConstants.STATUS_DRAFT.equals(application.getStatus())) {
            throw new IllegalArgumentException("只有草稿状态可以提交");
        }
        requireAvailableSeal(application.getSealId(), false);
        assertNoReservationConflict(application.getId(), application.getSealId(),
                resolveBorrowTime(application.getExpectedBorrowTime()), application.getExpectedReturnTime());
        application.setStatus(OaBorrowConstants.STATUS_PENDING);
        compensateUserSnapshot(application);

        application.setUpdateBy(UserContext.getUserName());
        application.setUpdateTime(LocalDateTime.now());
        boolean updated = updateById(application);
        if (updated) {
            SealApplicationSubmittedEvent event = new SealApplicationSubmittedEvent();
            event.setApplicationId(application.getId());
            event.setApplicationNo(application.getApplicationNo());
            event.setUserId(application.getUserId());
            event.setUserName(application.getUserName());
            event.setSubmittedAt(LocalDateTime.now());
            publishSealApplicationSubmittedEvent(application, event);
        }
        updateLinkedContractStatus(application, OaContractConstants.CONTRACT_STATUS_SEALING);
        traceSeal(application, "SEAL_APPLICATION_SUBMITTED", "用印提交审批", application.getApplicationNo());
        return updated;
    }

    public void startSealApplicationWorkflow(OaSealApplication application) {
        try {
            InternalWorkflowStartDTO req = new InternalWorkflowStartDTO();
            req.setProcessDefKey("seal_application");
            req.setBusinessKey("SEAL_APPLICATION:" + application.getId());
            req.setStartUserId(application.getUserId());
            req.setStartUserName(application.getUserName());
            Map<String, Object> variables = new HashMap<>();
            variables.put("applicationId", application.getId());
            variables.put("applicationNo", application.getApplicationNo());
            variables.put("sealName", application.getSealName());
            variables.put("documentName", application.getDocumentName());
            variables.put("useScene", application.getUseScene());
            variables.put("copyCount", application.getCopyCount());
            variables.put("purpose", application.getPurpose());
            variables.put("userId", application.getUserId());
            variables.put("userName", application.getUserName());
            variables.put("deptName", application.getDeptName());
            variables.put("expectedReturnTime", formatDateTime(application.getExpectedReturnTime()));
            variables.put("contractId", application.getContractId());
            variables.put("contractNo", application.getContractNo());
            WorkflowCallbackConstants.applyCallbackMetadata(
                    variables,
                    OaBusinessTypes.SEAL_APPLICATION,
                    application.getId(),
                    application.getApplicationNo(),
                    "workflow:stream:approval-callback:oa"
            );
            req.setVariables(variables);
            R<?> result = remoteWorkflowService.startProcessInternal(req);
            if (result != null && result.getCode() == 200 && result.getData() != null) {
                String instanceId = extractInstanceId(result.getData());
                if (StringUtils.hasText(instanceId)) {
                    LambdaUpdateWrapper<OaSealApplication> wrapper = new LambdaUpdateWrapper<>();
                    wrapper.eq(OaSealApplication::getId, application.getId())
                            .and(w -> w.isNull(OaSealApplication::getInstanceId).or().eq(OaSealApplication::getInstanceId, ""))
                            .set(OaSealApplication::getInstanceId, instanceId)
                            .set(OaSealApplication::getUpdateBy, "event-consumer")
                            .set(OaSealApplication::getUpdateTime, LocalDateTime.now());
                    update(null, wrapper);
                }
            } else {
                log.warn("用印申请 {} 工作流启动返回异常: {}", application.getApplicationNo(), result != null ? result.getMsg() : "null");
            }
        } catch (Exception e) {
            log.error("用印申请 {} 启动工作流失败，但提交状态已更新", application.getApplicationNo(), e);
            workflowFailureHelper.handleWorkflowStartFailure(
                    OaBusinessTypes.SEAL_APPLICATION, application.getId(), application.getApplicationNo(),
                    application.getUserName(), application.getUserId(), e);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "取消用印申请", highRisk = true)
    public boolean cancelApplication(Long id) {
        OaSealApplication application = requireApplication(id);
        if (!OaBorrowConstants.STATUS_DRAFT.equals(application.getStatus())
                && !OaBorrowConstants.STATUS_PENDING.equals(application.getStatus())) {
            throw new IllegalArgumentException("只有草稿或审批中的用印申请可以取消");
        }
        application.setStatus(OaBorrowConstants.STATUS_CANCELLED);
        application.setUpdateBy(UserContext.getUserName());
        application.setUpdateTime(LocalDateTime.now());
        boolean updated = updateById(application);
        traceSeal(application, "SEAL_APPLICATION_CANCELLED", "用印申请取消", application.getApplicationNo());
        return updated;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean confirmBorrow(Long id, String remark) {
        return confirmBorrow(id, remark, null);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    // M1-5: 防并发冲突
    @DistributedLock(key = "'seal:' + #id + ':borrow'")
    public boolean confirmBorrow(Long id, String remark, String attachmentUrl) {
        OaSealApplication application = requireApplication(id);
        if (!OaBorrowConstants.STATUS_APPROVED.equals(application.getStatus())) {
            throw new IllegalArgumentException("只有审批通过的用印申请可以借出");
        }
        OaSeal seal = requireAvailableSeal(application.getSealId(), true);
        LocalDateTime now = LocalDateTime.now();
        application.setStatus(OaBorrowConstants.STATUS_BORROWED);
        application.setActualBorrowTime(now);
        application.setHandlerId(UserContext.getUserId());
        application.setHandlerName(UserContext.getUserName());
        application.setUpdateBy(UserContext.getUserName());
        application.setUpdateTime(now);
        updateById(application);

        seal.setStatus(OaBorrowConstants.RESOURCE_BORROWED);
        seal.setBorrowDueTime(application.getExpectedReturnTime());
        seal.setUpdateBy(UserContext.getUserName());
        seal.setUpdateTime(now);
        sealMapper.updateById(seal);

        insertHandoverLog(application, OaBorrowConstants.HANDOVER_BORROW, remark, attachmentUrl, now);
        updateLinkedContractStatus(application, OaContractConstants.CONTRACT_STATUS_SEALING);
        traceSeal(application, "SEAL_BORROWED", "印章借出", application.getSealName());
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean confirmReturn(Long id, String remark) {
        return confirmReturn(id, remark, null);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    // M1-5: 防并发冲突
    @DistributedLock(key = "'seal:' + #id + ':return'")
    public boolean confirmReturn(Long id, String remark, String attachmentUrl) {
        OaSealApplication application = requireApplication(id);
        if (!OaBorrowConstants.STATUS_BORROWED.equals(application.getStatus())
                && !OaBorrowConstants.STATUS_OVERDUE.equals(application.getStatus())) {
            throw new IllegalArgumentException("只有已借出或逾期的用印申请可以归还");
        }
        OaSeal seal = sealMapper.selectById(application.getSealId());
        LocalDateTime now = LocalDateTime.now();
        application.setStatus(OaBorrowConstants.STATUS_RETURNED);
        application.setActualReturnTime(now);
        application.setHandlerId(UserContext.getUserId());
        application.setHandlerName(UserContext.getUserName());
        application.setUpdateBy(UserContext.getUserName());
        application.setUpdateTime(now);
        updateById(application);

        if (seal != null && !Integer.valueOf(1).equals(seal.getDeleted())) {
            sealMapper.update(null, new LambdaUpdateWrapper<OaSeal>()
                    .eq(OaSeal::getSealId, seal.getSealId())
                    .set(OaSeal::getStatus, OaBorrowConstants.RESOURCE_AVAILABLE)
                    .set(OaSeal::getBorrowDueTime, null)
                    .set(OaSeal::getUpdateBy, UserContext.getUserName())
                    .set(OaSeal::getUpdateTime, now));
        }

        insertHandoverLog(application, OaBorrowConstants.HANDOVER_RETURN, remark, attachmentUrl, now);
        updateLinkedContractStatus(application, StringUtils.hasText(application.getAttachmentUrl())
                ? OaContractConstants.CONTRACT_STATUS_SEALED : OaContractConstants.CONTRACT_STATUS_SEALED);
        traceSeal(application, "SEAL_RETURNED", "印章归还", application.getSealName());
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean remind(Long id, String remark) {
        OaSealApplication application = requireApplication(id);
        if (!OaBorrowConstants.STATUS_BORROWED.equals(application.getStatus())
                && !OaBorrowConstants.STATUS_OVERDUE.equals(application.getStatus())) {
            throw new IllegalArgumentException("只有已借出或逾期的用印申请可以催还");
        }
        insertReminder(application, OaBorrowConstants.REMINDER_MANUAL,
                StringUtils.hasText(remark) ? remark : "请尽快归还借出的印章");
        traceSeal(application, "SEAL_RETURN_REMINDED", "用印催还", application.getSealName());
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int scanAndRemindOverdue() {
        LocalDateTime now = LocalDateTime.now();
        List<OaSealApplication> list = list(new LambdaQueryWrapper<OaSealApplication>()
                .eq(OaSealApplication::getStatus, OaBorrowConstants.STATUS_BORROWED)
                .eq(OaSealApplication::getDeleted, "0")
                .lt(OaSealApplication::getExpectedReturnTime, now));
        int handled = 0;
        for (OaSealApplication application : list) {
            Long existing = reminderLogMapper.selectCount(new LambdaQueryWrapper<OaBorrowReminderLog>()
                    .eq(OaBorrowReminderLog::getBusinessType, OaBorrowConstants.BUSINESS_TYPE_SEAL)
                    .eq(OaBorrowReminderLog::getBusinessId, application.getId())
                    .eq(OaBorrowReminderLog::getReminderType, OaBorrowConstants.REMINDER_AUTO));
            application.setStatus(OaBorrowConstants.STATUS_OVERDUE);
            application.setUpdateBy("overdue-scan");
            application.setUpdateTime(now);
            updateById(application);
            syncSealBorrowDueTime(application, now);
            if (existing == null || existing == 0) {
                insertReminder(application, OaBorrowConstants.REMINDER_AUTO,
                        "用印申请已超过预计归还时间，请尽快归还：" + application.getSealName());
            }
            traceSeal(application, "SEAL_RETURN_OVERDUE", "用印逾期", application.getSealName());
            handled++;
        }
        return handled;
    }

    private void syncSealBorrowDueTime(OaSealApplication application, LocalDateTime now) {
        OaSeal seal = sealMapper.selectById(application.getSealId());
        if (seal == null || Integer.valueOf(1).equals(seal.getDeleted())) {
            return;
        }
        seal.setStatus(OaBorrowConstants.RESOURCE_BORROWED);
        seal.setBorrowDueTime(application.getExpectedReturnTime());
        seal.setUpdateBy("overdue-scan");
        seal.setUpdateTime(now);
        sealMapper.updateById(seal);
    }

    private void normalizeAndValidate(OaSealApplication application) {
        if (application == null) {
            throw new IllegalArgumentException("用印申请不能为空");
        }
        if (application.getSealId() == null) {
            throw new IllegalArgumentException("请选择印章");
        }
        if (!StringUtils.hasText(application.getDocumentName())) {
            throw new IllegalArgumentException("用印文件名称不能为空");
        }
        if (!StringUtils.hasText(application.getPurpose())) {
            throw new IllegalArgumentException("用印用途不能为空");
        }
        if (application.getExpectedReturnTime() == null) {
            throw new IllegalArgumentException("预计归还时间不能为空");
        }
        application.setCopyCount(application.getCopyCount() == null || application.getCopyCount() <= 0 ? 1 : application.getCopyCount());
        application.setUseScene(StringUtils.hasText(application.getUseScene()) ? application.getUseScene() : "CONTRACT");
        application.setAttachmentUrl(OaAttachmentUrlUtils.normalizeMultiAttachmentUrls(application.getAttachmentUrl(), "用印申请附件"));
    }

    private void fillContractSnapshot(OaSealApplication application) {
        if (application.getContractId() == null) {
            return;
        }
        OaContract contract = contractMapper.selectById(application.getContractId());
        if (contract == null || !Integer.valueOf(0).equals(contract.getDeleted())) {
            throw new IllegalArgumentException("关联合同不存在");
        }
        application.setContractNo(contract.getContractNo());
        if (!StringUtils.hasText(application.getDocumentName())) {
            application.setDocumentName(contract.getContractName());
        }
    }

    private LocalDateTime resolveBorrowTime(LocalDateTime expectedBorrowTime) {
        return expectedBorrowTime == null ? LocalDateTime.now() : expectedBorrowTime;
    }

    private void assertNoReservationConflict(Long currentId, Long sealId, LocalDateTime expectedBorrowTime, LocalDateTime expectedReturnTime) {
        Long count = count(new LambdaQueryWrapper<OaSealApplication>()
                .ne(currentId != null, OaSealApplication::getId, currentId)
                .eq(OaSealApplication::getSealId, sealId)
                .eq(OaSealApplication::getDeleted, "0")
                .in(OaSealApplication::getStatus,
                        OaBorrowConstants.STATUS_PENDING,
                        OaBorrowConstants.STATUS_APPROVED,
                        OaBorrowConstants.STATUS_BORROWED,
                        OaBorrowConstants.STATUS_OVERDUE)
                .and(wrapper -> wrapper.isNull(OaSealApplication::getExpectedBorrowTime)
                        .or()
                        .lt(OaSealApplication::getExpectedBorrowTime, expectedReturnTime))
                .gt(OaSealApplication::getExpectedReturnTime, expectedBorrowTime));
        if (count != null && count > 0) {
            throw new IllegalArgumentException("所选印章在预计借用时间段内已有占用");
        }
    }

    private OaSealApplication requireApplication(Long id) {
        OaSealApplication application = getById(id);
        if (application == null || !Integer.valueOf(0).equals(application.getDeleted())) {
            throw new IllegalArgumentException("用印申请不存在");
        }
        return application;
    }

    private OaSeal requireAvailableSeal(Long sealId, boolean strictAvailable) {
        OaSeal seal = sealMapper.selectById(sealId);
        if (seal == null || !Integer.valueOf(0).equals(seal.getDeleted())) {
            throw new IllegalArgumentException("印章不存在");
        }
        if (OaBorrowConstants.RESOURCE_DISABLED.equals(seal.getStatus())) {
            throw new IllegalArgumentException("印章已停用");
        }
        if (strictAvailable && !OaBorrowConstants.RESOURCE_AVAILABLE.equals(seal.getStatus())) {
            throw new IllegalArgumentException("印章当前不可借出");
        }
        return seal;
    }

    private void compensateUserSnapshot(OaSealApplication application) {
        if (application.getTenantId() == null) {
            application.setTenantId(resolveTenantId());
        }
        if (application.getUserId() == null) {
            application.setUserId(UserContext.getUserId());
        }
        if (!StringUtils.hasText(application.getUserName())) {
            application.setUserName(UserContext.getUserName());
        }
        if (application.getDeptId() == null) {
            application.setDeptId(UserContext.getDeptId());
        }
        if (!StringUtils.hasText(application.getDeptName())) {
            application.setDeptName(UserContext.getDeptName());
        }
    }

    private void insertHandoverLog(OaSealApplication application, String actionType, String remark, String attachmentUrl, LocalDateTime now) {
        OaSealHandoverLog log = new OaSealHandoverLog();
        log.setTenantId(application.getTenantId());
        log.setApplicationId(application.getId());
        log.setSealId(application.getSealId());
        log.setActionType(actionType);
        log.setOperatorId(UserContext.getUserId());
        log.setOperatorName(UserContext.getUserName());
        log.setActionTime(now);
        log.setRemark(remark);
        log.setAttachmentUrl(OaAttachmentUrlUtils.normalizeMultiAttachmentUrls(attachmentUrl, "用印交接附件"));
        log.setCreateBy(UserContext.getUserName());
        log.setCreateTime(now);
        handoverLogMapper.insert(log);
    }

    private void insertReminder(OaSealApplication application, String reminderType, String content) {
        LocalDateTime now = LocalDateTime.now();
        OaBorrowReminderLog log = new OaBorrowReminderLog();
        log.setTenantId(application.getTenantId());
        log.setBusinessType(OaBorrowConstants.BUSINESS_TYPE_SEAL);
        log.setBusinessId(application.getId());
        log.setResourceId(application.getSealId());
        log.setResourceName(application.getSealName());
        log.setApplicantId(application.getUserId());
        log.setApplicantName(application.getUserName());
        log.setReminderType(reminderType);
        log.setOperatorId(UserContext.getUserId());
        log.setOperatorName(StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system");
        log.setReminderContent(content);
        log.setReminderTime(now);
        log.setCreateBy(log.getOperatorName());
        log.setCreateTime(now);
        reminderLogMapper.insert(log);
        sysNoticeService.sendNotice(application.getUserId(), "用印归还提醒", content, "2",
                log.getOperatorId(), log.getOperatorName());
        OaSeal seal = sealMapper.selectById(application.getSealId());
        if (seal != null && seal.getKeeperId() != null && !seal.getKeeperId().equals(application.getUserId())) {
            sysNoticeService.sendNotice(seal.getKeeperId(), "用印逾期提醒", content, "2",
                    log.getOperatorId(), log.getOperatorName());
        }
    }

    private void updateLinkedContractStatus(OaSealApplication application, String status) {
        if (application == null || application.getContractId() == null || !StringUtils.hasText(status)) {
            return;
        }
        OaContract contract = contractMapper.selectById(application.getContractId());
        if (contract == null || !Integer.valueOf(0).equals(contract.getDeleted())) {
            return;
        }
        contract.setSealApplicationId(application.getId());
        contract.setStatus(status);
        contract.setUpdateBy(StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "seal-service");
        contract.setUpdateTime(LocalDateTime.now());
        contractMapper.updateById(contract);
    }

    private void publishSealApplicationSubmittedEvent(OaSealApplication application, SealApplicationSubmittedEvent event) {
        try {
            BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                    .eventType("SEAL_APPLICATION_SUBMITTED")
                    .sourceModule("cloudflow-oa")
                    .sourceId(application.getId())
                    .tenantId(application.getTenantId())
                    .payload(objectMapper.writeValueAsString(event))
                    .build();
            outboxPublisher.publish(envelope);
        } catch (Exception e) {
            log.warn("用印申请提交事件发布失败, applicationId={}, error={}", application.getId(), e.getMessage());
        }
    }

    private void traceSeal(OaSealApplication application, String eventType, String title, String content) {
        if (application == null || application.getContractId() == null) {
            return;
        }
        oaTraceEventService.record(application.getTenantId(), OaContractConstants.BUSINESS_TYPE_CONTRACT, application.getContractId(),
                OaContractConstants.BUSINESS_TYPE_SEAL, application.getId(), eventType, title, content,
                UserContext.getUserId(), StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system", null);
    }

    @SuppressWarnings("unchecked")
    private String extractInstanceId(Object data) {
        if (data instanceof Map) {
            Map<String, Object> dataMap = (Map<String, Object>) data;
            Object instanceId = dataMap.get("processInstanceId");
            if (instanceId == null) {
                instanceId = dataMap.get("instanceId");
            }
            return instanceId != null ? String.valueOf(instanceId) : null;
        }
        return data instanceof String ? (String) data : null;
    }

    private String formatDateTime(LocalDateTime value) {
        return value == null ? null : DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").format(value);
    }

    private Long resolveTenantId() {
        return UserContext.getTenantId() == null ? OaBorrowConstants.DEFAULT_TENANT_ID : UserContext.getTenantId();
    }
}
