package com.cloudflow.workflow.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.WfFormDraft;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.dto.DraftSaveRequest;
import com.cloudflow.workflow.domain.vo.DraftDetailVO;
import com.cloudflow.workflow.domain.vo.DraftLaunchContextVO;
import com.cloudflow.workflow.domain.vo.DraftSaveResult;
import com.cloudflow.workflow.domain.vo.DraftSummaryVO;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfFormDraftMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class WfFormDraftService {
    private final WfFormDraftMapper drafts;
    private final WorkflowLaunchContextService contexts;
    private final WorkflowFormInputService forms;
    private final WorkflowDraftJson json;
    private final IWfInstanceService instances;

    @Transactional(rollbackFor = Exception.class)
    public DraftSaveResult save(DraftSaveRequest request) {
        if (request == null || !StringUtils.hasText(request.definitionId()) || request.definitionId().length() > 64
                || request.loadedContextHash() == null || !request.loadedContextHash().matches("[a-f0-9]{64}")
                || request.formData() == null || request.title() != null && request.title().length() > 200) {
            throw WorkflowException.validationError("草稿定义、标题、配置摘要或正文无效");
        }
        checkVersion(request.expectedVersion());
        Long tenantId = WorkflowLaunchContextService.requireTenant();
        Long userId = WorkflowLaunchContextService.requireUser();
        DraftLaunchContextVO context = contexts.context(request.definitionId());
        if (!context.contextHash().equals(request.loadedContextHash())) throw stale();
        boolean create = !StringUtils.hasText(request.draftId());
        WfFormDraft draft = create ? new WfFormDraft() : owned(request.draftId(), true);
        if (create && request.expectedVersion() != 0) throw conflict();
        if (!create) {
            if (!Objects.equals(draft.getDefinitionId(), request.definitionId())) throw conflict();
            checkCurrent(draft, request.expectedVersion(), context);
        }
        Map<String, Object> values = forms.validate(context, request.formData(), false);
        contexts.checkAssignees(context, request.nodeAssignees(), false);
        String formData = json.data(values);
        String nodeAssignees = json.assignees(request.nodeAssignees());
        String title = StringUtils.hasText(request.title()) ? request.title().trim() : null;
        if (!create && Objects.equals(title, draft.getTitle()) && formData.equals(draft.getFormData())
                && nodeAssignees.equals(draft.getNodeAssignees())) return saved(draft, false);
        LocalDateTime now = LocalDateTime.now().withNano(0);
        draft.setTitle(title);
        draft.setFormData(formData);
        draft.setNodeAssignees(nodeAssignees);
        draft.setLastSaveTime(now);
        draft.setExpireTime(now.plusDays(30));
        draft.setUpdateBy(String.valueOf(userId));
        draft.setUpdateTime(now);
        if (create) {
            draft.setDraftId(UUID.randomUUID().toString());
            draft.setTenantId(tenantId);
            draft.setUserId(userId);
            draft.setDefinitionId(context.definitionId());
            draft.setDefinitionName(context.definitionName());
            draft.setFormId(context.formId());
            draft.setDefinitionSnapshotHash(context.contextHash());
            draft.setLockVersion(1);
            draft.setCreateBy(String.valueOf(userId));
            draft.setCreateTime(now);
            try {
                if (drafts.insert(draft) != 1) throw conflict();
            } catch (DuplicateKeyException duplicate) {
                throw conflict();
            }
        } else {
            if (drafts.updateOwned(draft, request.expectedVersion()) != 1) throw conflict();
            draft.setLockVersion(request.expectedVersion() + 1);
        }
        return saved(draft, true);
    }

    public PageResult<DraftSummaryVO> list(PageQuery query, String keyword, String definitionId) {
        if (keyword != null && keyword.length() > 200 || definitionId != null && definitionId.length() > 64) {
            throw WorkflowException.validationError("草稿查询条件过长");
        }
        Page<WfFormDraft> page = new Page<>(Math.max(1, query.getPageNum() == null ? 1 : query.getPageNum()),
                Math.max(1, Math.min(100, query.getPageSize() == null ? 10 : query.getPageSize())));
        LambdaQueryWrapper<WfFormDraft> filter = new LambdaQueryWrapper<WfFormDraft>()
                .select(WfFormDraft::getDraftId, WfFormDraft::getDefinitionId, WfFormDraft::getDefinitionName,
                        WfFormDraft::getTitle, WfFormDraft::getLastSaveTime, WfFormDraft::getExpireTime,
                        WfFormDraft::getLockVersion, WfFormDraft::getDefinitionSnapshotHash)
                .eq(WfFormDraft::getTenantId, WorkflowLaunchContextService.requireTenant())
                .eq(WfFormDraft::getUserId, WorkflowLaunchContextService.requireUser())
                .eq(StringUtils.hasText(definitionId), WfFormDraft::getDefinitionId, definitionId)
                .orderByDesc(WfFormDraft::getLastSaveTime).orderByDesc(WfFormDraft::getDraftId);
        if (StringUtils.hasText(keyword)) filter.and(part -> part.like(WfFormDraft::getTitle, keyword)
                .or().like(WfFormDraft::getDefinitionName, keyword));
        Page<WfFormDraft> result = drafts.selectPage(page, filter);
        return new PageResult<>(result.getRecords().stream().map(this::summary).toList(),
                result.getTotal(), result.getCurrent(), result.getSize());
    }

    public DraftSummaryVO byDefinition(String definitionId) {
        requireIdentifier(definitionId);
        WfFormDraft draft = drafts.findByDefinition(WorkflowLaunchContextService.requireTenant(),
                WorkflowLaunchContextService.requireUser(), definitionId);
        return draft == null ? null : summary(draft);
    }

    @Transactional(rollbackFor = Exception.class)
    public DraftDetailVO detail(String draftId) {
        WfFormDraft pointer = owned(draftId, false);
        DraftLaunchContextVO context = contexts.context(pointer.getDefinitionId());
        WfFormDraft draft = owned(draftId, true);
        checkCurrent(draft, draft.getLockVersion(), context);
        Map<String, List<String>> assigneeIds = new LinkedHashMap<>();
        json.readAssignees(draft.getNodeAssignees()).forEach((nodeKey, userIds) ->
                assigneeIds.put(nodeKey, userIds.stream().map(String::valueOf).toList()));
        return new DraftDetailVO(draft.getDraftId(), draft.getDefinitionId(), draft.getDefinitionName(), draft.getTitle(),
                draft.getLastSaveTime(), draft.getExpireTime(), draft.getLockVersion(), "AVAILABLE", null,
                draft.getFormId(), json.readData(draft.getFormData()), assigneeIds,
                draft.getDefinitionSnapshotHash());
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "删除本人流程草稿", spel = "#draftId", highRisk = true)
    public void remove(String draftId, Integer expectedVersion) {
        checkVersion(expectedVersion);
        WfFormDraft draft = owned(draftId, true);
        if (!Objects.equals(draft.getLockVersion(), expectedVersion)) throw conflict();
        if (drafts.deleteOwned(draft.getTenantId(), draft.getUserId(), draftId, expectedVersion) != 1) throw conflict();
    }

    @Transactional(rollbackFor = Exception.class)
    public R<?> submit(String draftId, Integer expectedVersion) {
        requireIdentifier(draftId);
        checkVersion(expectedVersion);
        Long tenantId = WorkflowLaunchContextService.requireTenant();
        Long userId = WorkflowLaunchContextService.requireUser();
        WfFormDraft pointer = drafts.findOwned(tenantId, userId, draftId);
        if (pointer == null) return submitted(tenantId, userId, draftId, expectedVersion);
        DraftLaunchContextVO context = contexts.context(pointer.getDefinitionId());
        WfFormDraft draft = drafts.lockOwned(tenantId, userId, draftId);
        if (draft == null) return submitted(tenantId, userId, draftId, expectedVersion);
        checkCurrent(draft, expectedVersion, context);
        Map<String, Object> variables = new LinkedHashMap<>(forms.validate(context, json.readData(draft.getFormData()), true));
        Map<String, List<Long>> selected = json.readAssignees(draft.getNodeAssignees());
        contexts.checkAssignees(context, selected, true);
        if (StringUtils.hasText(draft.getTitle())) variables.put("_title", draft.getTitle());
        variables.put("_draftVersion", expectedVersion);
        R<?> result = instances.startProcessFromDraft(context.definitionId(), context.processDefKey(),
                "WF_DRAFT:" + draftId, variables, selected);
        if (result == null || !Integer.valueOf(200).equals(result.getCode())) {
            throw new WorkflowException("START_FAILED", "草稿提交失败，内容已保留");
        }
        if (drafts.deleteOwned(tenantId, userId, draftId, expectedVersion) != 1) throw conflict();
        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    public int cleanup() {
        Long tenantId = WorkflowLaunchContextService.requireTenant();
        LocalDateTime cutoff = LocalDateTime.now().withNano(0);
        int removed = 0;
        for (WfFormDraft draft : drafts.findExpired(tenantId, cutoff)) {
            removed += drafts.deleteExpired(tenantId, draft.getDraftId(), draft.getLockVersion(), cutoff);
        }
        return removed;
    }

    private R<?> submitted(Long tenantId, Long userId, String draftId, Integer expectedVersion) {
        WfProcessInstance instance = drafts.findSubmitted(tenantId, userId, "WF_DRAFT:" + draftId);
        if (instance == null) throw notFound();
        Object submittedVersion = json.readData(instance.getVariables()).get("_draftVersion");
        if (!String.valueOf(expectedVersion).equals(String.valueOf(submittedVersion))) throw conflict();
        return R.ok(Map.of("instanceId", instance.getInstanceId(), "processInstanceId", instance.getInstanceId(),
                "processNo", instance.getProcessNo()));
    }

    private WfFormDraft owned(String draftId, boolean lock) {
        requireIdentifier(draftId);
        Long tenantId = WorkflowLaunchContextService.requireTenant();
        Long userId = WorkflowLaunchContextService.requireUser();
        WfFormDraft draft = lock ? drafts.lockOwned(tenantId, userId, draftId) : drafts.findOwned(tenantId, userId, draftId);
        if (draft == null) throw notFound();
        return draft;
    }

    private void checkCurrent(WfFormDraft draft, Integer version, DraftLaunchContextVO context) {
        if (!Objects.equals(draft.getLockVersion(), version)) throw conflict();
        if (expired(draft)) throw new WorkflowException("DRAFT_EXPIRED", "草稿已到期，请删除后重新填写");
        if (!Objects.equals(draft.getDefinitionId(), context.definitionId())
                || !Objects.equals(draft.getDefinitionSnapshotHash(), context.contextHash())) throw stale();
    }

    private DraftSummaryVO summary(WfFormDraft draft) {
        String availability = "AVAILABLE";
        String reason = null;
        if (expired(draft)) {
            availability = "UNAVAILABLE";
            reason = "草稿已到期";
        } else {
            try {
                DraftLaunchContextVO context = contexts.context(draft.getDefinitionId());
                if (!Objects.equals(context.contextHash(), draft.getDefinitionSnapshotHash())) throw stale();
            } catch (WorkflowException unavailable) {
                availability = "DRAFT_STALE".equals(unavailable.getCode()) ? "STALE" : "UNAVAILABLE";
                reason = "STALE".equals(availability) ? "流程配置已变化，请删除后重新填写" : "流程已不可用或当前用户无权发起";
            }
        }
        return new DraftSummaryVO(draft.getDraftId(), draft.getDefinitionId(), draft.getDefinitionName(), draft.getTitle(),
                draft.getLastSaveTime(), draft.getExpireTime(), draft.getLockVersion(), availability, reason);
    }

    private DraftSaveResult saved(WfFormDraft draft, boolean changed) {
        return new DraftSaveResult(draft.getDraftId(), draft.getDefinitionId(), draft.getLockVersion(),
                draft.getLastSaveTime(), draft.getExpireTime(), changed);
    }

    private boolean expired(WfFormDraft draft) {
        return draft.getExpireTime() == null || !draft.getExpireTime().isAfter(LocalDateTime.now());
    }

    private void requireIdentifier(String identifier) {
        if (!StringUtils.hasText(identifier) || identifier.length() > 64) throw notFound();
    }

    private void checkVersion(Integer version) {
        if (version == null || version < 0 || version == Integer.MAX_VALUE) throw conflict();
    }

    private WorkflowException conflict() {
        return new WorkflowException("DRAFT_CONFLICT", "草稿已被其他操作修改，请重新加载");
    }

    private WorkflowException stale() {
        return new WorkflowException("DRAFT_STALE", "流程配置已变化，请删除后重新填写");
    }

    private WorkflowException notFound() {
        return new WorkflowException("DRAFT_NOT_FOUND", "草稿不存在或无权访问");
    }
}
