package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.oa.constant.OaBusinessTypes;
import com.cloudflow.oa.domain.OaLicense;
import com.cloudflow.oa.domain.OaLicenseRenewal;
import com.cloudflow.oa.domain.dto.WorkflowProcessStartDTO;
import com.cloudflow.oa.mapper.OaLicenseMapper;
import com.cloudflow.oa.mapper.OaLicenseRenewalMapper;
import com.cloudflow.oa.service.IOaLicenseRenewalService;
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
 * 证照续期申请服务实现。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OaLicenseRenewalServiceImpl extends ServiceImpl<OaLicenseRenewalMapper, OaLicenseRenewal>
        implements IOaLicenseRenewalService {

    private final OaLicenseMapper licenseMapper;
    private final RemoteWorkflowService remoteWorkflowService;
    private final OaWorkflowFailureHelper workflowFailureHelper;

    @Override
    public PageResult<OaLicenseRenewal> queryPage(OaLicenseRenewal query, PageQuery pageQuery) {
        LambdaQueryWrapper<OaLicenseRenewal> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(query.getLicenseId() != null, OaLicenseRenewal::getLicenseId, query.getLicenseId())
                .eq(query.getApplicantId() != null, OaLicenseRenewal::getApplicantId, query.getApplicantId())
                .eq(StringUtils.hasText(query.getStatus()), OaLicenseRenewal::getStatus, query.getStatus())
                .like(StringUtils.hasText(query.getRenewalNo()), OaLicenseRenewal::getRenewalNo, query.getRenewalNo())
                .like(StringUtils.hasText(query.getLicenseName()), OaLicenseRenewal::getLicenseName, query.getLicenseName())
                .eq(OaLicenseRenewal::getDeleted, "0")
                .orderByDesc(OaLicenseRenewal::getCreateTime);
        Page<OaLicenseRenewal> page = page(pageQuery.build(), wrapper);
        return PageResult.build(page);
    }

    @Override
    public OaLicenseRenewal getRenewalInfo(Long id) {
        return requireRenewal(id);
    }

    @Override
    public String generateRenewalNo() {
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        Integer maxSeq = baseMapper.getTodayRenewalMaxSeq();
        int nextSeq = (maxSeq == null ? 0 : maxSeq) + 1;
        return String.format("XQ%s%04d", today, nextSeq);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean createRenewal(OaLicenseRenewal renewal) {
        normalizeAndValidate(renewal);
        OaLicense license = requireLicense(renewal.getLicenseId());
        assertNoPendingRenewal(license.getLicenseId(), null);
        LocalDateTime now = LocalDateTime.now();
        renewal.setTenantId(resolveTenantId());
        renewal.setRenewalNo(generateRenewalNo());
        renewal.setLicenseName(license.getLicenseName());
        renewal.setLicenseNo(license.getLicenseNo());
        renewal.setOldIssueDate(license.getIssueDate());
        renewal.setOldExpireDate(license.getExpireDate());
        renewal.setApplicantId(UserContext.getUserId());
        renewal.setApplicantName(UserContext.getUserName());
        renewal.setDeptId(UserContext.getDeptId());
        renewal.setDeptName(UserContext.getDeptName());
        renewal.setStatus(OaBorrowConstants.STATUS_DRAFT);
        renewal.setDeleted(0);
        renewal.setCreateBy(UserContext.getUserName());
        renewal.setCreateTime(now);
        renewal.setUpdateBy(UserContext.getUserName());
        renewal.setUpdateTime(now);
        return save(renewal);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "更新证照续期", diff = true, highRisk = true)
    public boolean updateRenewal(OaLicenseRenewal renewal) {
        if (renewal == null || renewal.getId() == null) {
            throw new IllegalArgumentException("续期申请ID不能为空");
        }
        OaLicenseRenewal persisted = requireRenewal(renewal.getId());
        if (!OaBorrowConstants.STATUS_DRAFT.equals(persisted.getStatus())) {
            throw new IllegalArgumentException("只有草稿状态可以编辑");
        }
        normalizeAndValidate(renewal);
        OaLicense license = requireLicense(renewal.getLicenseId());
        assertNoPendingRenewal(license.getLicenseId(), renewal.getId());
        renewal.setTenantId(persisted.getTenantId());
        renewal.setRenewalNo(persisted.getRenewalNo());
        renewal.setLicenseName(license.getLicenseName());
        renewal.setLicenseNo(license.getLicenseNo());
        renewal.setOldIssueDate(license.getIssueDate());
        renewal.setOldExpireDate(license.getExpireDate());
        renewal.setApplicantId(persisted.getApplicantId());
        renewal.setApplicantName(persisted.getApplicantName());
        renewal.setDeptId(persisted.getDeptId());
        renewal.setDeptName(persisted.getDeptName());
        renewal.setStatus(OaBorrowConstants.STATUS_DRAFT);
        renewal.setDeleted(0);
        renewal.setUpdateBy(UserContext.getUserName());
        renewal.setUpdateTime(LocalDateTime.now());
        return updateById(renewal);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean removeRenewals(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return true;
        }
        LocalDateTime now = LocalDateTime.now();
        for (Long id : ids) {
            OaLicenseRenewal renewal = requireRenewal(id);
            if (!OaBorrowConstants.STATUS_DRAFT.equals(renewal.getStatus())
                    && !OaBorrowConstants.STATUS_CANCELLED.equals(renewal.getStatus())
                    && !OaBorrowConstants.STATUS_REJECTED.equals(renewal.getStatus())) {
                throw new IllegalArgumentException("只有草稿、已取消或已驳回的续期申请可以删除");
            }
            OaLicenseRenewal update = new OaLicenseRenewal();
            update.setId(id);
            update.setDeleted(1);
            update.setUpdateBy(UserContext.getUserName());
            update.setUpdateTime(now);
            updateById(update);
        }
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean submitRenewal(Long id) {
        OaLicenseRenewal renewal = requireRenewal(id);
        if (!OaBorrowConstants.STATUS_DRAFT.equals(renewal.getStatus())) {
            throw new IllegalArgumentException("只有草稿状态可以提交");
        }
        requireLicense(renewal.getLicenseId());
        assertNoPendingRenewal(renewal.getLicenseId(), renewal.getId());
        renewal.setStatus(OaBorrowConstants.STATUS_PENDING);
        compensateUserSnapshot(renewal);

        try {
            WorkflowProcessStartDTO req = new WorkflowProcessStartDTO();
            req.setProcessDefKey("license_renewal");
            req.setBusinessKey("LICENSE_RENEWAL:" + renewal.getId());
            Map<String, Object> variables = new HashMap<>();
            variables.put("renewalId", renewal.getId());
            variables.put("renewalNo", renewal.getRenewalNo());
            variables.put("licenseName", renewal.getLicenseName());
            variables.put("oldExpireDate", formatDate(renewal.getOldExpireDate()));
            variables.put("newExpireDate", formatDate(renewal.getNewExpireDate()));
            variables.put("renewalReason", renewal.getRenewalReason());
            variables.put("userId", renewal.getApplicantId());
            variables.put("userName", renewal.getApplicantName());
            variables.put("deptName", renewal.getDeptName());
            WorkflowCallbackConstants.applyCallbackMetadata(
                    variables,
                    OaBusinessTypes.LICENSE_RENEWAL,
                    renewal.getId(),
                    renewal.getRenewalNo(),
                    "workflow:stream:approval-callback:oa"
            );
            req.setVariables(variables);
            R<?> result = remoteWorkflowService.startProcess(req);
            if (result != null && result.getCode() == 200 && result.getData() != null) {
                renewal.setInstanceId(extractInstanceId(result.getData()));
            } else {
                log.warn("证照续期 {} 工作流启动返回异常: {}", renewal.getRenewalNo(), result != null ? result.getMsg() : "null");
            }
        } catch (Exception e) {
            log.error("证照续期 {} 启动工作流失败，但提交状态已更新", renewal.getRenewalNo(), e);
            workflowFailureHelper.handleWorkflowStartFailure(
                    OaBusinessTypes.LICENSE_RENEWAL, renewal.getId(), renewal.getRenewalNo(),
                    renewal.getApplicantName(), renewal.getApplicantId(), e);
        }
        renewal.setUpdateBy(UserContext.getUserName());
        renewal.setUpdateTime(LocalDateTime.now());
        return updateById(renewal);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean cancelRenewal(Long id) {
        OaLicenseRenewal renewal = requireRenewal(id);
        if (!OaBorrowConstants.STATUS_DRAFT.equals(renewal.getStatus())
                && !OaBorrowConstants.STATUS_PENDING.equals(renewal.getStatus())) {
            throw new IllegalArgumentException("只有草稿或审批中的续期申请可以取消");
        }
        renewal.setStatus(OaBorrowConstants.STATUS_CANCELLED);
        renewal.setUpdateBy(UserContext.getUserName());
        renewal.setUpdateTime(LocalDateTime.now());
        return updateById(renewal);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void approveRenewal(Long id, String processInstanceId) {
        OaLicenseRenewal renewal = requireRenewal(id);
        if (!OaBorrowConstants.STATUS_PENDING.equals(renewal.getStatus())) {
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        renewal.setInstanceId(processInstanceId);
        renewal.setStatus(OaBorrowConstants.STATUS_APPROVED);
        renewal.setUpdateBy(WorkflowCallbackConstants.WORKFLOW_UPDATE_BY);
        renewal.setUpdateTime(now);
        updateById(renewal);

        OaLicense license = requireLicense(renewal.getLicenseId());
        license.setIssueDate(renewal.getNewIssueDate());
        license.setExpireDate(renewal.getNewExpireDate());
        if (StringUtils.hasText(renewal.getAttachmentUrl())) {
            license.setAttachmentUrl(renewal.getAttachmentUrl());
        }
        license.setUpdateBy(WorkflowCallbackConstants.WORKFLOW_UPDATE_BY);
        license.setUpdateTime(now);
        licenseMapper.updateById(license);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void rejectRenewal(Long id, String processInstanceId) {
        OaLicenseRenewal renewal = requireRenewal(id);
        renewal.setInstanceId(processInstanceId);
        renewal.setStatus(OaBorrowConstants.STATUS_REJECTED);
        renewal.setUpdateBy(WorkflowCallbackConstants.WORKFLOW_UPDATE_BY);
        renewal.setUpdateTime(LocalDateTime.now());
        updateById(renewal);
    }

    private void normalizeAndValidate(OaLicenseRenewal renewal) {
        if (renewal == null) {
            throw new IllegalArgumentException("续期申请不能为空");
        }
        if (renewal.getLicenseId() == null) {
            throw new IllegalArgumentException("请选择证照");
        }
        if (renewal.getNewExpireDate() == null) {
            throw new IllegalArgumentException("新到期日期不能为空");
        }
        if (renewal.getNewIssueDate() != null && renewal.getNewIssueDate().isAfter(renewal.getNewExpireDate())) {
            throw new IllegalArgumentException("新签发日期不能晚于新到期日期");
        }
        if (!StringUtils.hasText(renewal.getRenewalReason())) {
            throw new IllegalArgumentException("续期原因不能为空");
        }
        renewal.setAttachmentUrl(OaAttachmentUrlUtils.normalizeMultiAttachmentUrls(renewal.getAttachmentUrl(), "证照续期附件"));
    }

    private OaLicenseRenewal requireRenewal(Long id) {
        OaLicenseRenewal renewal = getById(id);
        if (renewal == null || !Integer.valueOf(0).equals(renewal.getDeleted())) {
            throw new IllegalArgumentException("续期申请不存在");
        }
        return renewal;
    }

    private OaLicense requireLicense(Long licenseId) {
        OaLicense license = licenseMapper.selectById(licenseId);
        if (license == null || !Integer.valueOf(0).equals(license.getDeleted())) {
            throw new IllegalArgumentException("证照不存在");
        }
        if (OaBorrowConstants.RESOURCE_DISABLED.equals(license.getStatus())) {
            throw new IllegalArgumentException("停用证照不能续期");
        }
        return license;
    }

    private void assertNoPendingRenewal(Long licenseId, Long currentId) {
        Long count = count(new LambdaQueryWrapper<OaLicenseRenewal>()
                .ne(currentId != null, OaLicenseRenewal::getId, currentId)
                .eq(OaLicenseRenewal::getLicenseId, licenseId)
                .eq(OaLicenseRenewal::getStatus, OaBorrowConstants.STATUS_PENDING)
                .eq(OaLicenseRenewal::getDeleted, "0"));
        if (count != null && count > 0) {
            throw new IllegalArgumentException("该证照已有审批中的续期申请");
        }
    }

    private void compensateUserSnapshot(OaLicenseRenewal renewal) {
        if (renewal.getTenantId() == null) {
            renewal.setTenantId(resolveTenantId());
        }
        if (renewal.getApplicantId() == null) {
            renewal.setApplicantId(UserContext.getUserId());
        }
        if (!StringUtils.hasText(renewal.getApplicantName())) {
            renewal.setApplicantName(UserContext.getUserName());
        }
        if (renewal.getDeptId() == null) {
            renewal.setDeptId(UserContext.getDeptId());
        }
        if (!StringUtils.hasText(renewal.getDeptName())) {
            renewal.setDeptName(UserContext.getDeptName());
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

    private String formatDate(LocalDate value) {
        return value == null ? null : DateTimeFormatter.ISO_LOCAL_DATE.format(value);
    }

    private Long resolveTenantId() {
        return UserContext.getTenantId() == null ? OaBorrowConstants.DEFAULT_TENANT_ID : UserContext.getTenantId();
    }
}
