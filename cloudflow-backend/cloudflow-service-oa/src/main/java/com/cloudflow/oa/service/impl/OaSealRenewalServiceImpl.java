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
import com.cloudflow.oa.domain.OaSeal;
import com.cloudflow.oa.domain.OaSealRenewal;
import com.cloudflow.oa.domain.dto.WorkflowProcessStartDTO;
import com.cloudflow.oa.mapper.OaSealMapper;
import com.cloudflow.oa.mapper.OaSealRenewalMapper;
import com.cloudflow.oa.service.IOaSealRenewalService;
import com.cloudflow.oa.service.remote.RemoteWorkflowService;
import com.cloudflow.oa.util.OaAttachmentUrlUtils;
import com.cloudflow.oa.util.OaBorrowConstants;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.redis.lock.DistributedLock;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 印章续期申请服务实现。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OaSealRenewalServiceImpl extends ServiceImpl<OaSealRenewalMapper, OaSealRenewal>
        implements IOaSealRenewalService {

    private final OaSealMapper sealMapper;
    private final RemoteWorkflowService remoteWorkflowService;
    private final OaWorkflowFailureHelper workflowFailureHelper;

    @Override
    public PageResult<OaSealRenewal> queryPage(OaSealRenewal query, PageQuery pageQuery) {
        LambdaQueryWrapper<OaSealRenewal> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(query.getSealId() != null, OaSealRenewal::getSealId, query.getSealId())
                .eq(query.getApplicantId() != null, OaSealRenewal::getApplicantId, query.getApplicantId())
                .eq(StringUtils.hasText(query.getStatus()), OaSealRenewal::getStatus, query.getStatus())
                .like(StringUtils.hasText(query.getRenewalNo()), OaSealRenewal::getRenewalNo, query.getRenewalNo())
                .like(StringUtils.hasText(query.getSealName()), OaSealRenewal::getSealName, query.getSealName())
                .eq(OaSealRenewal::getDeleted, "0")
                .orderByDesc(OaSealRenewal::getCreateTime);
        Page<OaSealRenewal> page = page(pageQuery.build(), wrapper);
        return PageResult.build(page);
    }

    @Override
    public OaSealRenewal getRenewalInfo(Long id) {
        return requireRenewal(id);
    }

    @Override
    public String generateRenewalNo() {
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        Integer maxSeq = baseMapper.getTodayRenewalMaxSeq();
        int nextSeq = (maxSeq == null ? 0 : maxSeq) + 1;
        return String.format("YZ%s%04d", today, nextSeq);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean createRenewal(OaSealRenewal renewal) {
        normalizeAndValidate(renewal);
        OaSeal seal = requireSeal(renewal.getSealId());
        assertNoPendingRenewal(seal.getSealId(), null);
        LocalDateTime now = LocalDateTime.now();
        renewal.setTenantId(resolveTenantId());
        renewal.setRenewalNo(generateRenewalNo());
        renewal.setSealName(seal.getSealName());
        renewal.setSealNo(seal.getSealNo());
        renewal.setOldIssueDate(seal.getIssueDate());
        renewal.setOldExpireDate(seal.getExpireDate());
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
    @Audit(name = "更新印章续期", diff = true, highRisk = true)
    public boolean updateRenewal(OaSealRenewal renewal) {
        if (renewal == null || renewal.getId() == null) {
            throw new IllegalArgumentException("续期申请ID不能为空");
        }
        OaSealRenewal persisted = requireRenewal(renewal.getId());
        if (!OaBorrowConstants.STATUS_DRAFT.equals(persisted.getStatus())) {
            throw new IllegalArgumentException("只有草稿状态可以编辑");
        }
        normalizeAndValidate(renewal);
        OaSeal seal = requireSeal(renewal.getSealId());
        assertNoPendingRenewal(seal.getSealId(), renewal.getId());
        renewal.setTenantId(persisted.getTenantId());
        renewal.setRenewalNo(persisted.getRenewalNo());
        renewal.setSealName(seal.getSealName());
        renewal.setSealNo(seal.getSealNo());
        renewal.setOldIssueDate(seal.getIssueDate());
        renewal.setOldExpireDate(seal.getExpireDate());
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
    @Audit(name = "删除印章续期", highRisk = true)
    public boolean removeRenewals(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return true;
        }
        LocalDateTime now = LocalDateTime.now();
        for (Long id : ids) {
            OaSealRenewal renewal = requireRenewal(id);
            if (!OaBorrowConstants.STATUS_DRAFT.equals(renewal.getStatus())
                    && !OaBorrowConstants.STATUS_CANCELLED.equals(renewal.getStatus())
                    && !OaBorrowConstants.STATUS_REJECTED.equals(renewal.getStatus())) {
                throw new IllegalArgumentException("只有草稿、已取消或已驳回的续期申请可以删除");
            }
            OaSealRenewal update = new OaSealRenewal();
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
        OaSealRenewal renewal = requireRenewal(id);
        if (!OaBorrowConstants.STATUS_DRAFT.equals(renewal.getStatus())) {
            throw new IllegalArgumentException("只有草稿状态可以提交");
        }
        requireSeal(renewal.getSealId());
        assertNoPendingRenewal(renewal.getSealId(), renewal.getId());
        renewal.setStatus(OaBorrowConstants.STATUS_PENDING);
        compensateUserSnapshot(renewal);
        renewal.setUpdateBy(UserContext.getUserName());
        renewal.setUpdateTime(LocalDateTime.now());
        boolean updated = updateById(renewal);
        if (updated) {
            startRenewalWorkflowAfterCommit(renewal);
        }
        return updated;
    }

    private void startRenewalWorkflowAfterCommit(OaSealRenewal renewal) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            startRenewalWorkflow(renewal);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                startRenewalWorkflow(renewal);
            }
        });
    }

    private void startRenewalWorkflow(OaSealRenewal renewal) {
        try {
            WorkflowProcessStartDTO req = new WorkflowProcessStartDTO();
            req.setProcessDefKey("seal_renewal");
            req.setBusinessKey("SEAL_RENEWAL:" + renewal.getId());
            Map<String, Object> variables = new HashMap<>();
            variables.put("renewalId", renewal.getId());
            variables.put("renewalNo", renewal.getRenewalNo());
            variables.put("sealName", renewal.getSealName());
            variables.put("oldExpireDate", formatDate(renewal.getOldExpireDate()));
            variables.put("newExpireDate", formatDate(renewal.getNewExpireDate()));
            variables.put("renewalReason", renewal.getRenewalReason());
            variables.put("userId", renewal.getApplicantId());
            variables.put("userName", renewal.getApplicantName());
            variables.put("deptName", renewal.getDeptName());
            WorkflowCallbackConstants.applyCallbackMetadata(
                    variables,
                    OaBusinessTypes.SEAL_RENEWAL,
                    renewal.getId(),
                    renewal.getRenewalNo(),
                    "workflow:stream:approval-callback:oa"
            );
            req.setVariables(variables);
            R<?> result = remoteWorkflowService.startProcess(req);
            if (result != null && result.getCode() == 200 && result.getData() != null) {
                OaSealRenewal update = new OaSealRenewal();
                update.setId(renewal.getId());
                update.setInstanceId(extractInstanceId(result.getData()));
                updateById(update);
            } else {
                log.warn("印章续期 {} 工作流启动返回异常: {}", renewal.getRenewalNo(), result != null ? result.getMsg() : "null");
            }
        } catch (Exception e) {
            log.error("印章续期 {} 启动工作流失败，但提交状态已更新", renewal.getRenewalNo(), e);
            workflowFailureHelper.handleWorkflowStartFailure(
                    OaBusinessTypes.SEAL_RENEWAL, renewal.getId(), renewal.getRenewalNo(),
                    renewal.getApplicantName(), renewal.getApplicantId(), e);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "取消印章续期", highRisk = true)
    public boolean cancelRenewal(Long id) {
        OaSealRenewal renewal = requireRenewal(id);
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
    // M1-5: 防并发冲突
    @DistributedLock(key = "'seal:renewal:' + #id + ':approve'")
    public void approveRenewal(Long id, String processInstanceId) {
        OaSealRenewal renewal = requireRenewal(id);
        if (!OaBorrowConstants.STATUS_PENDING.equals(renewal.getStatus())) {
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        renewal.setInstanceId(processInstanceId);
        renewal.setStatus(OaBorrowConstants.STATUS_APPROVED);
        renewal.setUpdateBy(WorkflowCallbackConstants.WORKFLOW_UPDATE_BY);
        renewal.setUpdateTime(now);
        updateById(renewal);

        OaSeal seal = requireSeal(renewal.getSealId());
        seal.setIssueDate(renewal.getNewIssueDate());
        seal.setExpireDate(renewal.getNewExpireDate());
        if (StringUtils.hasText(renewal.getAttachmentUrl())) {
            seal.setAttachmentUrl(renewal.getAttachmentUrl());
        }
        seal.setUpdateBy(WorkflowCallbackConstants.WORKFLOW_UPDATE_BY);
        seal.setUpdateTime(now);
        sealMapper.updateById(seal);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void rejectRenewal(Long id, String processInstanceId) {
        OaSealRenewal renewal = requireRenewal(id);
        renewal.setInstanceId(processInstanceId);
        renewal.setStatus(OaBorrowConstants.STATUS_REJECTED);
        renewal.setUpdateBy(WorkflowCallbackConstants.WORKFLOW_UPDATE_BY);
        renewal.setUpdateTime(LocalDateTime.now());
        updateById(renewal);
    }

    private void normalizeAndValidate(OaSealRenewal renewal) {
        if (renewal == null) {
            throw new IllegalArgumentException("续期申请不能为空");
        }
        if (renewal.getSealId() == null) {
            throw new IllegalArgumentException("请选择印章");
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
        renewal.setAttachmentUrl(OaAttachmentUrlUtils.normalizeMultiAttachmentUrls(renewal.getAttachmentUrl(), "印章续期附件"));
    }

    private OaSealRenewal requireRenewal(Long id) {
        OaSealRenewal renewal = getById(id);
        if (renewal == null || !Integer.valueOf(0).equals(renewal.getDeleted())) {
            throw new IllegalArgumentException("续期申请不存在");
        }
        return renewal;
    }

    private OaSeal requireSeal(Long sealId) {
        OaSeal seal = sealMapper.selectById(sealId);
        if (seal == null || !Integer.valueOf(0).equals(seal.getDeleted())) {
            throw new IllegalArgumentException("印章不存在");
        }
        if (OaBorrowConstants.RESOURCE_DISABLED.equals(seal.getStatus())) {
            throw new IllegalArgumentException("停用印章不能续期");
        }
        return seal;
    }

    private void assertNoPendingRenewal(Long sealId, Long currentId) {
        Long count = count(new LambdaQueryWrapper<OaSealRenewal>()
                .ne(currentId != null, OaSealRenewal::getId, currentId)
                .eq(OaSealRenewal::getSealId, sealId)
                .eq(OaSealRenewal::getStatus, OaBorrowConstants.STATUS_PENDING)
                .eq(OaSealRenewal::getDeleted, "0"));
        if (count != null && count > 0) {
            throw new IllegalArgumentException("该印章已有审批中的续期申请");
        }
    }

    private void compensateUserSnapshot(OaSealRenewal renewal) {
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
