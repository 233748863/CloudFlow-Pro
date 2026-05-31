package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.oa.constant.OaBusinessTypes;
import com.cloudflow.oa.domain.OaBorrowReminderLog;
import com.cloudflow.oa.domain.OaLicense;
import com.cloudflow.oa.domain.OaLicenseBorrow;
import com.cloudflow.oa.domain.OaLicenseHandoverLog;
import com.cloudflow.oa.domain.dto.WorkflowProcessStartDTO;
import com.cloudflow.oa.mapper.OaBorrowReminderLogMapper;
import com.cloudflow.oa.mapper.OaLicenseBorrowMapper;
import com.cloudflow.oa.mapper.OaLicenseHandoverLogMapper;
import com.cloudflow.oa.mapper.OaLicenseMapper;
import com.cloudflow.oa.service.IOaLicenseBorrowService;
import com.cloudflow.oa.service.ISysNoticeService;
import com.cloudflow.oa.service.remote.RemoteWorkflowService;
import com.cloudflow.oa.util.OaAttachmentUrlUtils;
import com.cloudflow.oa.util.OaBorrowConstants;
import com.cloudflow.common.audit.annotation.Audit;
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
 * 证照借用服务实现。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OaLicenseBorrowServiceImpl extends ServiceImpl<OaLicenseBorrowMapper, OaLicenseBorrow>
        implements IOaLicenseBorrowService {

    private final OaLicenseMapper licenseMapper;
    private final OaLicenseHandoverLogMapper handoverLogMapper;
    private final OaBorrowReminderLogMapper reminderLogMapper;
    private final RemoteWorkflowService remoteWorkflowService;
    private final ISysNoticeService sysNoticeService;
    private final OaWorkflowFailureHelper workflowFailureHelper;

    @Override
    public PageResult<OaLicenseBorrow> queryPage(OaLicenseBorrow query, PageQuery pageQuery) {
        Page<OaLicenseBorrow> page = baseMapper.selectPageByDataScope(pageQuery.build(), query, DataScopeUtils.listScope());
        return PageResult.build(page);
    }

    @Override
    public PageResult<OaLicenseBorrow> queryOverduePage(PageQuery pageQuery) {
        OaLicenseBorrow query = new OaLicenseBorrow();
        query.setStatus(OaBorrowConstants.STATUS_OVERDUE);
        return queryPage(query, pageQuery);
    }

    @Override
    public OaLicenseBorrow getBorrowInfo(Long id) {
        return requireBorrow(id);
    }

    @Override
    public List<OaLicenseHandoverLog> listHandoverLogs(Long borrowId) {
        return handoverLogMapper.selectList(new LambdaQueryWrapper<OaLicenseHandoverLog>()
                .eq(OaLicenseHandoverLog::getBorrowId, borrowId)
                .orderByDesc(OaLicenseHandoverLog::getActionTime));
    }

    @Override
    public List<OaBorrowReminderLog> listReminderLogs(Long borrowId) {
        return reminderLogMapper.selectList(new LambdaQueryWrapper<OaBorrowReminderLog>()
                .eq(OaBorrowReminderLog::getBusinessType, OaBorrowConstants.BUSINESS_TYPE_LICENSE)
                .eq(OaBorrowReminderLog::getBusinessId, borrowId)
                .orderByDesc(OaBorrowReminderLog::getReminderTime));
    }

    @Override
    public String generateBorrowNo() {
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        Integer maxSeq = licenseMapper.getTodayBorrowMaxSeq();
        int nextSeq = (maxSeq == null ? 0 : maxSeq) + 1;
        return String.format("ZZ%s%04d", today, nextSeq);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean createBorrow(OaLicenseBorrow borrow) {
        normalizeAndValidate(borrow);
        OaLicense license = requireAvailableLicense(borrow.getLicenseId(), false);
        assertNoReservationConflict(null, borrow.getLicenseId(),
                resolveBorrowTime(borrow.getExpectedBorrowTime()), borrow.getExpectedReturnTime());
        LocalDateTime now = LocalDateTime.now();
        borrow.setTenantId(resolveTenantId());
        borrow.setBorrowNo(generateBorrowNo());
        borrow.setLicenseName(license.getLicenseName());
        borrow.setUserId(UserContext.getUserId());
        borrow.setUserName(UserContext.getUserName());
        borrow.setDeptId(UserContext.getDeptId());
        borrow.setDeptName(UserContext.getDeptName());
        borrow.setStatus(OaBorrowConstants.STATUS_DRAFT);
        borrow.setDeleted(0);
        borrow.setCreateBy(UserContext.getUserName());
        borrow.setCreateTime(now);
        borrow.setUpdateBy(UserContext.getUserName());
        borrow.setUpdateTime(now);
        return save(borrow);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "更新证照借用", diff = true, highRisk = true)
    public boolean updateBorrow(OaLicenseBorrow borrow) {
        if (borrow == null || borrow.getId() == null) {
            throw new IllegalArgumentException("证照借用申请ID不能为空");
        }
        OaLicenseBorrow persisted = requireBorrow(borrow.getId());
        if (!OaBorrowConstants.STATUS_DRAFT.equals(persisted.getStatus())) {
            throw new IllegalArgumentException("只有草稿状态可以编辑");
        }
        normalizeAndValidate(borrow);
        OaLicense license = requireAvailableLicense(borrow.getLicenseId(), false);
        assertNoReservationConflict(borrow.getId(), borrow.getLicenseId(),
                resolveBorrowTime(borrow.getExpectedBorrowTime()), borrow.getExpectedReturnTime());
        borrow.setBorrowNo(persisted.getBorrowNo());
        borrow.setLicenseName(license.getLicenseName());
        borrow.setUserId(persisted.getUserId());
        borrow.setUserName(persisted.getUserName());
        borrow.setDeptId(persisted.getDeptId());
        borrow.setDeptName(persisted.getDeptName());
        borrow.setStatus(OaBorrowConstants.STATUS_DRAFT);
        borrow.setDeleted(0);
        borrow.setUpdateBy(UserContext.getUserName());
        borrow.setUpdateTime(LocalDateTime.now());
        return updateById(borrow);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean removeBorrows(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return true;
        }
        for (Long id : ids) {
            OaLicenseBorrow borrow = requireBorrow(id);
            if (!OaBorrowConstants.STATUS_DRAFT.equals(borrow.getStatus())
                    && !OaBorrowConstants.STATUS_CANCELLED.equals(borrow.getStatus())
                    && !OaBorrowConstants.STATUS_REJECTED.equals(borrow.getStatus())) {
                throw new IllegalArgumentException("只有草稿、已取消或已驳回的证照借用申请可以删除");
            }
            OaLicenseBorrow update = new OaLicenseBorrow();
            update.setId(id);
            update.setDeleted(1);
            update.setUpdateBy(UserContext.getUserName());
            update.setUpdateTime(LocalDateTime.now());
            updateById(update);
        }
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean submitBorrow(Long id) {
        OaLicenseBorrow borrow = requireBorrow(id);
        if (!OaBorrowConstants.STATUS_DRAFT.equals(borrow.getStatus())) {
            throw new IllegalArgumentException("只有草稿状态可以提交");
        }
        requireAvailableLicense(borrow.getLicenseId(), false);
        assertNoReservationConflict(borrow.getId(), borrow.getLicenseId(),
                resolveBorrowTime(borrow.getExpectedBorrowTime()), borrow.getExpectedReturnTime());
        borrow.setStatus(OaBorrowConstants.STATUS_PENDING);
        compensateUserSnapshot(borrow);

        try {
            WorkflowProcessStartDTO req = new WorkflowProcessStartDTO();
            req.setProcessDefKey("license_borrow");
            req.setBusinessKey("LICENSE_BORROW:" + borrow.getId());
            Map<String, Object> variables = new HashMap<>();
            variables.put("borrowId", borrow.getId());
            variables.put("borrowNo", borrow.getBorrowNo());
            variables.put("licenseName", borrow.getLicenseName());
            variables.put("purpose", borrow.getPurpose());
            variables.put("userId", borrow.getUserId());
            variables.put("userName", borrow.getUserName());
            variables.put("deptName", borrow.getDeptName());
            variables.put("expectedReturnTime", formatDateTime(borrow.getExpectedReturnTime()));
            WorkflowCallbackConstants.applyCallbackMetadata(
                    variables,
                    OaBusinessTypes.LICENSE_BORROW,
                    borrow.getId(),
                    borrow.getBorrowNo(),
                    "workflow:stream:approval-callback:oa"
            );
            req.setVariables(variables);
            R<?> result = remoteWorkflowService.startProcess(req);
            if (result != null && result.getCode() == 200 && result.getData() != null) {
                borrow.setInstanceId(extractInstanceId(result.getData()));
            } else {
                log.warn("证照借用 {} 工作流启动返回异常: {}", borrow.getBorrowNo(), result != null ? result.getMsg() : "null");
            }
        } catch (Exception e) {
            log.error("证照借用 {} 启动工作流失败，但提交状态已更新", borrow.getBorrowNo(), e);
            workflowFailureHelper.handleWorkflowStartFailure(
                    OaBusinessTypes.LICENSE_BORROW, borrow.getId(), borrow.getBorrowNo(),
                    borrow.getUserName(), borrow.getUserId(), e);
        }
        borrow.setUpdateBy(UserContext.getUserName());
        borrow.setUpdateTime(LocalDateTime.now());
        return updateById(borrow);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean cancelBorrow(Long id) {
        OaLicenseBorrow borrow = requireBorrow(id);
        if (!OaBorrowConstants.STATUS_DRAFT.equals(borrow.getStatus())
                && !OaBorrowConstants.STATUS_PENDING.equals(borrow.getStatus())) {
            throw new IllegalArgumentException("只有草稿或审批中的证照借用申请可以取消");
        }
        borrow.setStatus(OaBorrowConstants.STATUS_CANCELLED);
        borrow.setUpdateBy(UserContext.getUserName());
        borrow.setUpdateTime(LocalDateTime.now());
        return updateById(borrow);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean confirmBorrow(Long id, String remark) {
        return confirmBorrow(id, remark, null);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean confirmBorrow(Long id, String remark, String attachmentUrl) {
        OaLicenseBorrow borrow = requireBorrow(id);
        if (!OaBorrowConstants.STATUS_APPROVED.equals(borrow.getStatus())) {
            throw new IllegalArgumentException("只有审批通过的证照借用申请可以借出");
        }
        OaLicense license = requireAvailableLicense(borrow.getLicenseId(), true);
        LocalDateTime now = LocalDateTime.now();
        borrow.setStatus(OaBorrowConstants.STATUS_BORROWED);
        borrow.setActualBorrowTime(now);
        borrow.setHandlerId(UserContext.getUserId());
        borrow.setHandlerName(UserContext.getUserName());
        borrow.setUpdateBy(UserContext.getUserName());
        borrow.setUpdateTime(now);
        updateById(borrow);

        license.setStatus(OaBorrowConstants.RESOURCE_BORROWED);
        license.setUpdateBy(UserContext.getUserName());
        license.setUpdateTime(now);
        licenseMapper.updateById(license);

        insertHandoverLog(borrow, OaBorrowConstants.HANDOVER_BORROW, remark, attachmentUrl, now);
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean confirmReturn(Long id, String remark) {
        return confirmReturn(id, remark, null);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean confirmReturn(Long id, String remark, String attachmentUrl) {
        OaLicenseBorrow borrow = requireBorrow(id);
        if (!OaBorrowConstants.STATUS_BORROWED.equals(borrow.getStatus())
                && !OaBorrowConstants.STATUS_OVERDUE.equals(borrow.getStatus())) {
            throw new IllegalArgumentException("只有已借出或逾期的证照借用申请可以归还");
        }
        OaLicense license = licenseMapper.selectById(borrow.getLicenseId());
        LocalDateTime now = LocalDateTime.now();
        borrow.setStatus(OaBorrowConstants.STATUS_RETURNED);
        borrow.setActualReturnTime(now);
        borrow.setHandlerId(UserContext.getUserId());
        borrow.setHandlerName(UserContext.getUserName());
        borrow.setUpdateBy(UserContext.getUserName());
        borrow.setUpdateTime(now);
        updateById(borrow);

        if (license != null && !Integer.valueOf(1).equals(license.getDeleted())) {
            license.setStatus(OaBorrowConstants.RESOURCE_AVAILABLE);
            license.setUpdateBy(UserContext.getUserName());
            license.setUpdateTime(now);
            licenseMapper.updateById(license);
        }

        insertHandoverLog(borrow, OaBorrowConstants.HANDOVER_RETURN, remark, attachmentUrl, now);
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean remind(Long id, String remark) {
        OaLicenseBorrow borrow = requireBorrow(id);
        if (!OaBorrowConstants.STATUS_BORROWED.equals(borrow.getStatus())
                && !OaBorrowConstants.STATUS_OVERDUE.equals(borrow.getStatus())) {
            throw new IllegalArgumentException("只有已借出或逾期的证照借用申请可以催还");
        }
        insertReminder(borrow, OaBorrowConstants.REMINDER_MANUAL,
                StringUtils.hasText(remark) ? remark : "请尽快归还借出的证照");
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int scanAndRemindOverdue() {
        LocalDateTime now = LocalDateTime.now();
        List<OaLicenseBorrow> list = list(new LambdaQueryWrapper<OaLicenseBorrow>()
                .eq(OaLicenseBorrow::getStatus, OaBorrowConstants.STATUS_BORROWED)
                .eq(OaLicenseBorrow::getDeleted, "0")
                .lt(OaLicenseBorrow::getExpectedReturnTime, now));
        int handled = 0;
        for (OaLicenseBorrow borrow : list) {
            Long existing = reminderLogMapper.selectCount(new LambdaQueryWrapper<OaBorrowReminderLog>()
                    .eq(OaBorrowReminderLog::getBusinessType, OaBorrowConstants.BUSINESS_TYPE_LICENSE)
                    .eq(OaBorrowReminderLog::getBusinessId, borrow.getId())
                    .eq(OaBorrowReminderLog::getReminderType, OaBorrowConstants.REMINDER_AUTO));
            borrow.setStatus(OaBorrowConstants.STATUS_OVERDUE);
            borrow.setUpdateBy("overdue-scan");
            borrow.setUpdateTime(now);
            updateById(borrow);
            if (existing == null || existing == 0) {
                insertReminder(borrow, OaBorrowConstants.REMINDER_AUTO,
                        "证照借用已超过预计归还时间，请尽快归还：" + borrow.getLicenseName());
            }
            handled++;
        }
        return handled;
    }

    private void normalizeAndValidate(OaLicenseBorrow borrow) {
        if (borrow == null) {
            throw new IllegalArgumentException("证照借用申请不能为空");
        }
        if (borrow.getLicenseId() == null) {
            throw new IllegalArgumentException("请选择证照");
        }
        if (!StringUtils.hasText(borrow.getPurpose())) {
            throw new IllegalArgumentException("借用用途不能为空");
        }
        if (borrow.getExpectedReturnTime() == null) {
            throw new IllegalArgumentException("预计归还时间不能为空");
        }
        borrow.setAttachmentUrl(OaAttachmentUrlUtils.normalizeMultiAttachmentUrls(borrow.getAttachmentUrl(), "证照借用附件"));
    }

    private LocalDateTime resolveBorrowTime(LocalDateTime expectedBorrowTime) {
        return expectedBorrowTime == null ? LocalDateTime.now() : expectedBorrowTime;
    }

    private void assertNoReservationConflict(Long currentId, Long licenseId, LocalDateTime expectedBorrowTime, LocalDateTime expectedReturnTime) {
        Long count = count(new LambdaQueryWrapper<OaLicenseBorrow>()
                .ne(currentId != null, OaLicenseBorrow::getId, currentId)
                .eq(OaLicenseBorrow::getLicenseId, licenseId)
                .eq(OaLicenseBorrow::getDeleted, "0")
                .in(OaLicenseBorrow::getStatus,
                        OaBorrowConstants.STATUS_PENDING,
                        OaBorrowConstants.STATUS_APPROVED,
                        OaBorrowConstants.STATUS_BORROWED,
                        OaBorrowConstants.STATUS_OVERDUE)
                .and(wrapper -> wrapper.isNull(OaLicenseBorrow::getExpectedBorrowTime)
                        .or()
                        .lt(OaLicenseBorrow::getExpectedBorrowTime, expectedReturnTime))
                .gt(OaLicenseBorrow::getExpectedReturnTime, expectedBorrowTime));
        if (count != null && count > 0) {
            throw new IllegalArgumentException("所选证照在预计借用时间段内已有占用");
        }
    }

    private OaLicenseBorrow requireBorrow(Long id) {
        OaLicenseBorrow borrow = getById(id);
        if (borrow == null || !Integer.valueOf(0).equals(borrow.getDeleted())) {
            throw new IllegalArgumentException("证照借用申请不存在");
        }
        return borrow;
    }

    private OaLicense requireAvailableLicense(Long licenseId, boolean strictAvailable) {
        OaLicense license = licenseMapper.selectById(licenseId);
        if (license == null || !Integer.valueOf(0).equals(license.getDeleted())) {
            throw new IllegalArgumentException("证照不存在");
        }
        if (OaBorrowConstants.RESOURCE_DISABLED.equals(license.getStatus())) {
            throw new IllegalArgumentException("证照已停用");
        }
        if (strictAvailable && !OaBorrowConstants.RESOURCE_AVAILABLE.equals(license.getStatus())) {
            throw new IllegalArgumentException("证照当前不可借出");
        }
        return license;
    }

    private void compensateUserSnapshot(OaLicenseBorrow borrow) {
        if (borrow.getTenantId() == null) {
            borrow.setTenantId(resolveTenantId());
        }
        if (borrow.getUserId() == null) {
            borrow.setUserId(UserContext.getUserId());
        }
        if (!StringUtils.hasText(borrow.getUserName())) {
            borrow.setUserName(UserContext.getUserName());
        }
        if (borrow.getDeptId() == null) {
            borrow.setDeptId(UserContext.getDeptId());
        }
        if (!StringUtils.hasText(borrow.getDeptName())) {
            borrow.setDeptName(UserContext.getDeptName());
        }
    }

    private void insertHandoverLog(OaLicenseBorrow borrow, String actionType, String remark, String attachmentUrl, LocalDateTime now) {
        OaLicenseHandoverLog log = new OaLicenseHandoverLog();
        log.setTenantId(borrow.getTenantId());
        log.setBorrowId(borrow.getId());
        log.setLicenseId(borrow.getLicenseId());
        log.setActionType(actionType);
        log.setOperatorId(UserContext.getUserId());
        log.setOperatorName(UserContext.getUserName());
        log.setActionTime(now);
        log.setRemark(remark);
        log.setAttachmentUrl(OaAttachmentUrlUtils.normalizeMultiAttachmentUrls(attachmentUrl, "证照交接附件"));
        log.setCreateBy(UserContext.getUserName());
        log.setCreateTime(now);
        handoverLogMapper.insert(log);
    }

    private void insertReminder(OaLicenseBorrow borrow, String reminderType, String content) {
        LocalDateTime now = LocalDateTime.now();
        OaBorrowReminderLog log = new OaBorrowReminderLog();
        log.setTenantId(borrow.getTenantId());
        log.setBusinessType(OaBorrowConstants.BUSINESS_TYPE_LICENSE);
        log.setBusinessId(borrow.getId());
        log.setResourceId(borrow.getLicenseId());
        log.setResourceName(borrow.getLicenseName());
        log.setApplicantId(borrow.getUserId());
        log.setApplicantName(borrow.getUserName());
        log.setReminderType(reminderType);
        log.setOperatorId(UserContext.getUserId());
        log.setOperatorName(StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system");
        log.setReminderContent(content);
        log.setReminderTime(now);
        log.setCreateBy(log.getOperatorName());
        log.setCreateTime(now);
        reminderLogMapper.insert(log);
        sysNoticeService.sendNotice(borrow.getUserId(), "证照归还提醒", content, "2",
                log.getOperatorId(), log.getOperatorName());
        OaLicense license = licenseMapper.selectById(borrow.getLicenseId());
        if (license != null && license.getKeeperId() != null && !license.getKeeperId().equals(borrow.getUserId())) {
            sysNoticeService.sendNotice(license.getKeeperId(), "证照逾期提醒", content, "2",
                    log.getOperatorId(), log.getOperatorName());
        }
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
