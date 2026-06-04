package com.cloudflow.auth.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.auth.constant.AuthBusinessTypes;
import com.cloudflow.auth.domain.SysDictChangeApproval;
import com.cloudflow.auth.domain.SysDictData;
import com.cloudflow.auth.domain.SysDictType;
import com.cloudflow.auth.domain.SysDictVersion;
import com.cloudflow.auth.domain.dto.DictChangeApprovalPayload;
import com.cloudflow.auth.domain.dto.DictChangeResult;
import com.cloudflow.auth.domain.vo.DictChangeApprovalDetailVO;
import com.cloudflow.auth.domain.vo.DictChangeApprovalSummaryVO;
import com.cloudflow.auth.event.DictChangeApprovalSubmittedEvent;
import com.cloudflow.auth.mapper.SysDictChangeApprovalMapper;
import com.cloudflow.auth.mapper.SysDictDataMapper;
import com.cloudflow.auth.mapper.SysDictTypeMapper;
import com.cloudflow.auth.mapper.SysDictVersionMapper;
import com.cloudflow.auth.service.ISysDictTypeService;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ErrorCodeConstants;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.redis.core.SysDictHelper;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.stream.Collectors;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

@Slf4j
@Service
@RequiredArgsConstructor
public class SysDictTypeServiceImpl extends ServiceImpl<SysDictTypeMapper, SysDictType>
        implements ISysDictTypeService {

    private static final long DEFAULT_TENANT_ID = 100000L;
    private static final String SYSTEM_DICT_EDIT_PERMISSION = "system:dict:edit:system";
    private static final String DICT_CHANGE_PROCESS_DEF_KEY = "dict_change_approval";
    private static final String DICT_CHANGE_CALLBACK_STREAM_KEY = "workflow:stream:approval-callback:auth";
    private static final String CHANGE_SCOPE_DICT_DATA = "DICT_DATA";

    private static final Set<String> HIGH_RISK_DICT_TYPES = Set.of(
            "sys_normal_disable",
            "request_status",
            "contract_status",
            "invoice_status",
            "salary_slip_status",
            "crm_lead_status",
            "employee_status",
            "announcement_status",
            "workflow_status",
            "workflow_definition_status"
    );

    private final SysDictDataMapper dictDataMapper;
    private final SysDictHelper sysDictHelper;
    private final DictReferenceRegistry dictReferenceRegistry;
    private final SysDictVersionMapper dictVersionMapper;
    private final SysDictChangeApprovalMapper dictChangeApprovalMapper;
    private final ObjectMapper objectMapper;
    private final OutboxPublisher outboxPublisher;
    private final com.cloudflow.auth.service.remote.RemoteWorkflowService remoteWorkflowService;

    @PostConstruct
    public void init() {
        loadDictDataToRedis();
    }

    public void loadDictDataToRedis() {
        clearLegacyDictCaches();

        List<SysDictData> all = dictDataMapper.selectList(new LambdaQueryWrapper<SysDictData>()
                .eq(SysDictData::getStatus, "0")
                .orderByAsc(SysDictData::getDictType)
                .orderByAsc(SysDictData::getDictSort));
        if (all == null || all.isEmpty()) {
            log.info("dict cache warmup completed, no records");
            return;
        }

        Set<String> dictTypes = new HashSet<>();
        for (SysDictData data : all) {
            dictTypes.add(data.getDictType());
        }
        for (String dictType : dictTypes) {
            List<SysDictHelper.DictItem> items = all.stream()
                    .filter(data -> dictType.equals(data.getDictType()))
                    .map(this::toDictItem)
                    .collect(Collectors.toCollection(ArrayList::new));
            sysDictHelper.setDictDataCache(dictType, items);
        }
        log.info("dict cache warmup completed, dictTypeCount={}, itemCount={}", dictTypes.size(), all.size());
    }

    private void clearLegacyDictCaches() {
        for (String key : sysDictHelper.keys(SysDictHelper.DICT_DATA_PREFIX + "*")) {
            sysDictHelper.deleteRawCacheKey(key);
        }
    }

    private SysDictHelper.DictItem toDictItem(SysDictData data) {
        return new SysDictHelper.DictItem(
                data.getDictSort(),
                data.getDictLabel(),
                data.getDictValue(),
                data.getListClass(),
                data.getCssClass()
        );
    }

    @Override
    public void refreshDictCache(String dictType) {
        if (dictType == null || dictType.isEmpty()) {
            return;
        }
        List<SysDictData> list = dictDataMapper.selectList(new LambdaQueryWrapper<SysDictData>()
                .eq(SysDictData::getDictType, dictType)
                .eq(SysDictData::getStatus, "0")
                .orderByAsc(SysDictData::getDictSort));
        List<SysDictHelper.DictItem> items = list.stream()
                .map(this::toDictItem)
                .collect(Collectors.toCollection(ArrayList::new));
        sysDictHelper.setDictDataCache(dictType, items);
    }

    @Override
    public List<SysDictType> selectDictTypeAll() {
        return list(new LambdaQueryWrapper<SysDictType>()
                .eq(SysDictType::getStatus, "0")
                .orderByAsc(SysDictType::getDictId));
    }

    @Override
    public List<SysDictData> selectDictDataByType(String dictType) {
        List<SysDictHelper.DictItem> cached = sysDictHelper.getDictData(dictType);
        if (cached != null && !cached.isEmpty()) {
            List<SysDictData> result = new ArrayList<>(cached.size());
            for (SysDictHelper.DictItem item : cached) {
                SysDictData data = new SysDictData();
                data.setDictType(dictType);
                data.setDictSort(item.getSort());
                data.setDictLabel(item.getLabel());
                data.setDictValue(item.getValue());
                data.setListClass(item.getListClass());
                data.setCssClass(item.getCssClass());
                data.setStatus("0");
                result.add(data);
            }
            return result;
        }

        List<SysDictData> list = dictDataMapper.selectList(new LambdaQueryWrapper<SysDictData>()
                .eq(SysDictData::getDictType, dictType)
                .eq(SysDictData::getStatus, "0")
                .orderByAsc(SysDictData::getDictSort));
        if (!list.isEmpty()) {
            List<SysDictHelper.DictItem> items = list.stream()
                    .map(this::toDictItem)
                    .collect(Collectors.toCollection(ArrayList::new));
            sysDictHelper.setDictDataCache(dictType, items);
        }
        return list;
    }

    @Override
    public boolean checkDictTypeUnique(SysDictType dictType) {
        LambdaQueryWrapper<SysDictType> wrapper = new LambdaQueryWrapper<SysDictType>()
                .eq(SysDictType::getDictType, dictType.getDictType());
        if (dictType.getDictId() != null) {
            wrapper.ne(SysDictType::getDictId, dictType.getDictId());
        }
        return count(wrapper) == 0;
    }

    @Override
    public boolean insertDictType(SysDictType dictType) {
        boolean saved = save(dictType);
        if (saved) {
            recordSnapshot(dictType.getDictType());
        }
        return saved;
    }

    @Override
    @Audit(name = "更新字典类型", spel = "#dictType", oldVal = "@sysDictTypeServiceImpl.getById(#dictType.dictId)", diff = true, highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public boolean updateDictType(SysDictType dictType) {
        SysDictType oldDict = getById(dictType.getDictId());
        if (oldDict != null && !oldDict.getDictType().equals(dictType.getDictType())) {
            assertDictTypeRenameAllowed(oldDict.getDictType());
            SysDictData updateData = new SysDictData();
            updateData.setDictType(dictType.getDictType());
            dictDataMapper.update(updateData, new LambdaQueryWrapper<SysDictData>()
                    .eq(SysDictData::getDictType, oldDict.getDictType()));
            log.info("dict type code changed, old={}, new={}", oldDict.getDictType(), dictType.getDictType());
            sysDictHelper.removeDictDataCache(oldDict.getDictType());
            refreshDictCache(dictType.getDictType());
        }
        boolean updated = updateById(dictType);
        if (updated) {
            if (oldDict != null && !oldDict.getDictType().equals(dictType.getDictType())) {
                recordSnapshot(dictType.getDictType());
            } else {
                recordSnapshot(oldDict != null ? oldDict.getDictType() : dictType.getDictType());
            }
        }
        return updated;
    }

    @Override
    @Audit(name = "删除字典类型", highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public void deleteDictTypeByIds(Long[] dictIds) {
        List<SysDictType> dictTypes = listByIds(Arrays.asList(dictIds));
        for (SysDictType dictType : dictTypes) {
            assertDictTypeNotReferenced(dictType.getDictType());
            recordSnapshot(dictType.getDictType());
            dictDataMapper.delete(new LambdaQueryWrapper<SysDictData>()
                    .eq(SysDictData::getDictType, dictType.getDictType()));
            sysDictHelper.removeDictDataCache(dictType.getDictType());
        }
        removeByIds(Arrays.asList(dictIds));
        log.info("dict types deleted, count={}", dictIds.length);
    }

    @Override
    @Audit(name = "删除字典数据", highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public DictChangeResult deleteDictDataByIds(Long[] dictCodes) {
        List<SysDictData> records = loadDictDataList(dictCodes);
        if (records.isEmpty()) {
            return DictChangeResult.applied("未找到可删除的字典数据");
        }
        Set<String> dictTypes = records.stream()
                .map(SysDictData::getDictType)
                .filter(StringUtils::hasText)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (dictTypes.size() > 1) {
            throw new ServiceException("高风险字典删除仅支持同一字典类型分批提交",
                    ErrorCodeConstants.BAD_REQUEST);
        }
        if (records.stream().anyMatch(this::isHighRisk)) {
            for (SysDictData record : records) {
                assertDictValueNotReferenced(record.getDictType(), record.getDictValue());
            }
            return submitHighRiskDeleteApproval(records);
        }
        applyDeleteDictData(records, resolveUserName());
        return DictChangeResult.applied("字典数据已删除");
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public DictChangeResult saveDictData(SysDictData dictData) {
        normalizeRiskLevel(dictData);
        fillTenantIdIfAbsent(dictData);
        if (isHighRisk(dictData)) {
            return submitHighRiskCreateApproval(dictData);
        }
        boolean inserted = applySaveDictData(cloneDictData(dictData), resolveUserName());
        if (!inserted) {
            throw new ServiceException("字典数据新增失败", ErrorCodeConstants.INTERNAL_SERVER_ERROR);
        }
        return DictChangeResult.applied("字典数据已创建");
    }

    @Override
    @Audit(name = "更新字典数据", spel = "#dictData", oldVal = "@sysDictTypeServiceImpl.selectDictDataById(#dictData.dictCode)", diff = true, highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public DictChangeResult updateDictData(SysDictData dictData) {
        SysDictData old = dictDataMapper.selectById(dictData.getDictCode());
        if (old == null) {
            throw new ServiceException("字典数据不存在", ErrorCodeConstants.BAD_REQUEST);
        }
        normalizeRiskLevel(dictData);
        dictData.setTenantId(old.getTenantId());
        assertDictDataMutationSafe(dictData, old);
        if (isHighRisk(dictData) || isHighRisk(old)) {
            return submitHighRiskUpdateApproval(dictData, old);
        }
        boolean updated = applyUpdateDictData(cloneDictData(dictData), old, resolveUserName());
        if (!updated) {
            throw new ServiceException("字典数据更新失败", ErrorCodeConstants.INTERNAL_SERVER_ERROR);
        }
        return DictChangeResult.applied("字典数据已更新");
    }

    @Override
    public List<SysDictVersion> listDictVersions(String dictType) {
        return dictVersionMapper.selectList(new LambdaQueryWrapper<SysDictVersion>()
                .eq(SysDictVersion::getDictType, dictType)
                .eq(UserContext.getTenantId() != null, SysDictVersion::getTenantId, UserContext.getTenantId())
                .orderByDesc(SysDictVersion::getVersionNo)
                .orderByDesc(SysDictVersion::getPublishedAt));
    }

    @Override
    @Audit(name = "回滚字典版本", highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public void rollbackDictVersion(Long versionId) {
        SysDictVersion version = dictVersionMapper.selectById(versionId);
        if (version == null) {
            throw new ServiceException("字典版本不存在", ErrorCodeConstants.BAD_REQUEST);
        }
        DictSnapshot snapshot = deserializeSnapshot(version.getSnapshotJson());
        if (snapshot.type() == null || snapshot.type().getDictType() == null) {
            throw new ServiceException("字典版本快照损坏", ErrorCodeConstants.CONCURRENT_MODIFICATION);
        }

        SysDictType currentType = getOne(new LambdaQueryWrapper<SysDictType>()
                .eq(SysDictType::getDictType, snapshot.type().getDictType())
                .eq(version.getTenantId() != null, SysDictType::getTenantId, version.getTenantId())
                .last("LIMIT 1"));
        SysDictType typeToPersist = snapshot.type();
        if (currentType != null) {
            typeToPersist.setDictId(currentType.getDictId());
            updateById(typeToPersist);
        } else {
            typeToPersist.setDictId(null);
            save(typeToPersist);
        }

        dictDataMapper.delete(new LambdaQueryWrapper<SysDictData>()
                .eq(SysDictData::getDictType, snapshot.type().getDictType())
                .eq(version.getTenantId() != null, SysDictData::getTenantId, version.getTenantId()));
        for (SysDictData item : snapshot.data()) {
            item.setDictCode(null);
            dictDataMapper.insert(item);
        }
        refreshDictCache(snapshot.type().getDictType());
        recordSnapshot(snapshot.type().getDictType());
    }

    @Override
    public List<DictChangeApprovalSummaryVO> listDictChangeApprovals(String dictType) {
        return dictChangeApprovalMapper.selectList(new LambdaQueryWrapper<SysDictChangeApproval>()
                        .eq(StringUtils.hasText(dictType), SysDictChangeApproval::getDictType, dictType)
                        .eq(resolveTenantId() != null, SysDictChangeApproval::getTenantId, resolveTenantId())
                        .orderByDesc(SysDictChangeApproval::getCreateTime)
                        .orderByDesc(SysDictChangeApproval::getApprovalId))
                .stream()
                .map(this::toDictChangeApprovalSummary)
                .toList();
    }

    @Override
    public DictChangeApprovalDetailVO getDictChangeApprovalDetail(Long approvalId) {
        if (approvalId == null) {
            throw new ServiceException("字典审批单不存在", ErrorCodeConstants.NOT_FOUND);
        }
        SysDictChangeApproval approval = dictChangeApprovalMapper.selectById(approvalId);
        if (approval == null || !Objects.equals(resolveTenantId(), approval.getTenantId())) {
            throw new ServiceException("字典审批单不存在", ErrorCodeConstants.NOT_FOUND);
        }
        DictChangeApprovalDetailVO detail = new DictChangeApprovalDetailVO();
        BeanUtils.copyProperties(approval, detail);
        detail.setPayloadJson(approval.getPayloadJson());
        detail.setPayload(deserializeDictChangePayload(approval.getPayloadJson()));
        return detail;
    }

    public SysDictData selectDictDataById(Long dictCode) {
        return dictDataMapper.selectById(dictCode);
    }

    public SysDictChangeApproval getDictChangeApprovalById(Long approvalId) {
        if (approvalId == null) {
            return null;
        }
        return dictChangeApprovalMapper.selectById(approvalId);
    }

    public void startDictChangeApprovalWorkflow(SysDictChangeApproval approval, String processDefKey) {
        if (approval == null || approval.getApprovalId() == null) {
            return;
        }
        com.cloudflow.auth.service.remote.InternalWorkflowStartDTO dto =
                new com.cloudflow.auth.service.remote.InternalWorkflowStartDTO();
        dto.setProcessDefKey(processDefKey);
        dto.setBusinessKey("DICT_CHANGE:" + approval.getApprovalId());
        dto.setStartUserId(approval.getApplicantId());
        dto.setStartUserName(approval.getApplicantName());

        Map<String, Object> variables = new HashMap<>();
        variables.put("approvalId", approval.getApprovalId());
        variables.put("approvalNo", approval.getApprovalNo());
        variables.put("dictType", approval.getDictType());
        variables.put("actionType", approval.getActionType());
        variables.put("riskLevel", approval.getRiskLevel());
        variables.put("targetSummary", approval.getTargetSummary());
        WorkflowCallbackConstants.applyCallbackMetadata(
                variables,
                AuthBusinessTypes.DICT_CHANGE_APPROVAL,
                approval.getApprovalId(),
                approval.getApprovalNo(),
                DICT_CHANGE_CALLBACK_STREAM_KEY
        );
        dto.setVariables(variables);

        try {
            R<?> result = remoteWorkflowService.startProcessInternal(dto);
            if (result != null && result.isSuccess() && result.getData() != null) {
                SysDictChangeApproval update = new SysDictChangeApproval();
                update.setApprovalId(approval.getApprovalId());
                update.setInstanceId(extractInstanceId(result.getData()));
                update.setStatus("IN_PROGRESS");
                update.setUpdateBy(approval.getApplicantName());
                update.setUpdateTime(LocalDateTime.now());
                dictChangeApprovalMapper.updateById(update);
            }
        } catch (Exception ex) {
            log.warn("启动字典审批工作流失败: approvalId={}, processDefKey={}",
                    approval.getApprovalId(), processDefKey, ex);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void handleDictChangeApproved(ApprovalResultDTO dto) {
        SysDictChangeApproval approval = requireDictChangeApproval(dto.getBusinessId());
        DictChangeApprovalPayload payload = deserializeDictChangePayload(approval.getPayloadJson());
        String originalUserName = UserContext.getUserName();
        try {
            UserContext.setUserName(WorkflowCallbackConstants.WORKFLOW_UPDATE_BY);
            applyApprovedPayload(payload);
            updateApprovalStatus(approval.getApprovalId(), "APPROVED",
                    dto.getProcessInstanceId(), dto.getApprovalComment(), WorkflowCallbackConstants.WORKFLOW_UPDATE_BY);
        } finally {
            UserContext.setUserName(originalUserName);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void handleDictChangeRejected(ApprovalResultDTO dto) {
        SysDictChangeApproval approval = requireDictChangeApproval(dto.getBusinessId());
        updateApprovalStatus(approval.getApprovalId(), "REJECTED",
                dto.getProcessInstanceId(), dto.getApprovalComment(), WorkflowCallbackConstants.WORKFLOW_UPDATE_BY);
    }

    private void assertDictTypeNotReferenced(String dictType) {
        List<DictReferenceCheckResult> findings = findDictValueReferences(dictType, null);
        if (!findings.isEmpty()) {
            throw new ServiceException("字典类型 " + dictType + " 已被引用: " + summarizeReferences(findings),
                    ErrorCodeConstants.CONCURRENT_MODIFICATION);
        }
        if (dictReferenceRegistry.isProtected(dictType)) {
            throw new ServiceException("字典类型 " + dictType + " 已被 " +
                    dictReferenceRegistry.protectedReason(dictType).orElse("状态机枚举") + " 绑定，禁止删除",
                    ErrorCodeConstants.CONCURRENT_MODIFICATION);
        }
    }

    private void assertDictValueNotReferenced(String dictType, String dictValue) {
        List<DictReferenceCheckResult> findings = findDictValueReferences(dictType, dictValue);
        if (!findings.isEmpty()) {
            throw new ServiceException("字典值 " + dictType + ":" + dictValue + " 已被引用: " + summarizeReferences(findings),
                    ErrorCodeConstants.CONCURRENT_MODIFICATION);
        }
        if (dictReferenceRegistry.isProtected(dictType)) {
            throw new ServiceException("字典值 " + dictType + ":" + dictValue + " 已被 " +
                    dictReferenceRegistry.protectedReason(dictType).orElse("状态机枚举") + " 绑定，禁止删除",
                    ErrorCodeConstants.CONCURRENT_MODIFICATION);
        }
    }

    private void assertDictTypeRenameAllowed(String dictType) {
        List<DictReferenceCheckResult> findings = findDictValueReferences(dictType, null);
        if (!findings.isEmpty()) {
            throw new ServiceException("字典类型 " + dictType + " 已被引用: " + summarizeReferences(findings),
                    ErrorCodeConstants.CONCURRENT_MODIFICATION);
        }
        if (!dictReferenceRegistry.isProtected(dictType)) {
            return;
        }
        throw new ServiceException("字典类型 " + dictType + " 已被 " +
                dictReferenceRegistry.protectedReason(dictType).orElse("状态机枚举") + " 绑定，禁止改名",
                ErrorCodeConstants.CONCURRENT_MODIFICATION);
    }

    private List<DictReferenceCheckResult> findDictValueReferences(String dictType, String dictValue) {
        List<DictReferenceRegistry.DictReferenceBinding> bindings = dictReferenceRegistry.bindings(dictType);
        if (bindings.isEmpty()) {
            return List.of();
        }

        List<String> values;
        if (dictValue != null) {
            values = List.of(dictValue);
        } else {
            values = dictDataMapper.selectList(new LambdaQueryWrapper<SysDictData>()
                            .select(SysDictData::getDictValue)
                            .eq(SysDictData::getDictType, dictType))
                    .stream()
                    .map(SysDictData::getDictValue)
                    .filter(value -> value != null && !value.isBlank())
                    .distinct()
                    .toList();
        }
        if (values.isEmpty()) {
            return List.of();
        }

        List<DictReferenceCheckResult> findings = new ArrayList<>();
        for (DictReferenceRegistry.DictReferenceBinding binding : bindings) {
            for (String value : values) {
                Long refCount = dictDataMapper.countDictReferences(binding.tableName(), binding.columnName(), value);
                long count = refCount == null ? 0L : refCount;
                if (count > 0) {
                    findings.add(new DictReferenceCheckResult(
                            dictType,
                            value,
                            binding.tableName(),
                            binding.columnName(),
                            binding.label(),
                            count
                    ));
                }
            }
        }
        return findings;
    }

    private String summarizeReferences(List<DictReferenceCheckResult> findings) {
        return findings.stream()
                .map(DictReferenceCheckResult::summary)
                .collect(Collectors.joining("; "));
    }

    private void recordSnapshot(String dictType) {
        if (dictType == null || dictType.isBlank()) {
            return;
        }
        SysDictType dictTypeEntity = getOne(new LambdaQueryWrapper<SysDictType>()
                .eq(SysDictType::getDictType, dictType)
                .eq(UserContext.getTenantId() != null, SysDictType::getTenantId, UserContext.getTenantId())
                .last("LIMIT 1"));
        if (dictTypeEntity == null) {
            return;
        }
        List<SysDictData> dictDataList = dictDataMapper.selectList(new LambdaQueryWrapper<SysDictData>()
                .eq(SysDictData::getDictType, dictType)
                .eq(UserContext.getTenantId() != null, SysDictData::getTenantId, UserContext.getTenantId())
                .orderByAsc(SysDictData::getDictSort)
                .orderByAsc(SysDictData::getDictCode));
        DictSnapshot snapshot = new DictSnapshot(dictTypeEntity, dictDataList);

        SysDictVersion version = new SysDictVersion();
        version.setTenantId(dictTypeEntity.getTenantId());
        version.setDictType(dictType);
        version.setVersionNo(nextVersionNo(dictType, dictTypeEntity.getTenantId()));
        version.setSnapshotJson(serializeSnapshot(snapshot));
        version.setPublishedBy(StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system");
        version.setPublishedAt(java.time.LocalDateTime.now());
        dictVersionMapper.insert(version);
    }

    private Integer nextVersionNo(String dictType, Long tenantId) {
        SysDictVersion latest = dictVersionMapper.selectOne(new LambdaQueryWrapper<SysDictVersion>()
                .eq(SysDictVersion::getDictType, dictType)
                .eq(tenantId != null, SysDictVersion::getTenantId, tenantId)
                .orderByDesc(SysDictVersion::getVersionNo)
                .last("LIMIT 1"));
        return latest == null || latest.getVersionNo() == null ? 1 : latest.getVersionNo() + 1;
    }

    private String serializeSnapshot(DictSnapshot snapshot) {
        try {
            return objectMapper.writeValueAsString(snapshot);
        } catch (JsonProcessingException e) {
            throw new ServiceException("字典版本快照序列化失败", ErrorCodeConstants.INTERNAL_SERVER_ERROR, e);
        }
    }

    private DictSnapshot deserializeSnapshot(String snapshotJson) {
        try {
            return objectMapper.readValue(snapshotJson, new TypeReference<DictSnapshot>() {
            });
        } catch (JsonProcessingException e) {
            throw new ServiceException("字典版本快照反序列化失败", ErrorCodeConstants.INTERNAL_SERVER_ERROR, e);
        }
    }

    private record DictSnapshot(SysDictType type, List<SysDictData> data) {
    }

    private DictChangeApprovalSummaryVO toDictChangeApprovalSummary(SysDictChangeApproval approval) {
        DictChangeApprovalSummaryVO summary = new DictChangeApprovalSummaryVO();
        BeanUtils.copyProperties(approval, summary);
        return summary;
    }

    private void normalizeRiskLevel(SysDictData dictData) {
        if (dictData == null) {
            return;
        }
        String riskLevel = dictData.getRiskLevel();
        if (!StringUtils.hasText(riskLevel)) {
            dictData.setRiskLevel(isHighRiskDictType(dictData.getDictType()) ? "HIGH" : "LOW");
            return;
        }
        dictData.setRiskLevel(riskLevel.trim().toUpperCase());
    }

    private boolean isHighRiskDictType(String dictType) {
        return dictType != null && HIGH_RISK_DICT_TYPES.contains(dictType.trim());
    }

    private boolean isHighRisk(SysDictData dictData) {
        if (dictData == null) {
            return false;
        }
        return "HIGH".equalsIgnoreCase(dictData.getRiskLevel()) || isHighRiskDictType(dictData.getDictType());
    }

    private DictChangeResult submitHighRiskCreateApproval(SysDictData dictData) {
        assertHighRiskPermission(dictData.getDictType());
        SysDictData newItem = cloneDictData(dictData);
        newItem.setDictCode(null);
        DictChangeApprovalPayload payload = new DictChangeApprovalPayload(
                CHANGE_SCOPE_DICT_DATA,
                "ADD",
                dictData.getDictType(),
                null,
                null,
                List.of(),
                List.of(newItem)
        );
        SysDictChangeApproval approval = createDictChangeApproval(
                dictData.getDictType(),
                "ADD",
                normalizeRiskLevelValue(dictData.getRiskLevel()),
                null,
                "新增字典数据：" + dictData.getDictLabel(),
                payload,
                dictData.getRemark()
        );
        publishDictChangeApprovalSubmittedEvent(approval);
        return DictChangeResult.pending(approval.getApprovalId(), approval.getApprovalNo(),
                "高风险字典新增已提交审批");
    }

    private DictChangeResult submitHighRiskUpdateApproval(SysDictData incoming, SysDictData persisted) {
        assertHighRiskPermission(incoming.getDictType());
        DictChangeApprovalPayload payload = new DictChangeApprovalPayload(
                CHANGE_SCOPE_DICT_DATA,
                "UPDATE",
                persisted.getDictType(),
                null,
                null,
                List.of(cloneDictData(persisted)),
                List.of(cloneDictData(incoming))
        );
        SysDictChangeApproval approval = createDictChangeApproval(
                persisted.getDictType(),
                "UPDATE",
                normalizeRiskLevelValue(firstNonBlank(incoming.getRiskLevel(), persisted.getRiskLevel())),
                String.valueOf(persisted.getDictCode()),
                "修改字典数据：" + persisted.getDictLabel(),
                payload,
                incoming.getRemark()
        );
        publishDictChangeApprovalSubmittedEvent(approval);
        return DictChangeResult.pending(approval.getApprovalId(), approval.getApprovalNo(),
                "高风险字典修改已提交审批");
    }

    private DictChangeResult submitHighRiskDeleteApproval(List<SysDictData> records) {
        SysDictData first = records.get(0);
        assertHighRiskPermission(first.getDictType());
        DictChangeApprovalPayload payload = new DictChangeApprovalPayload(
                CHANGE_SCOPE_DICT_DATA,
                "DELETE",
                first.getDictType(),
                null,
                null,
                records.stream().map(this::cloneDictData).toList(),
                List.of()
        );
        String targetIds = records.stream()
                .map(SysDictData::getDictCode)
                .filter(Objects::nonNull)
                .map(String::valueOf)
                .collect(Collectors.joining(","));
        String targetSummary = "删除字典数据：" + records.stream()
                .map(SysDictData::getDictLabel)
                .filter(StringUtils::hasText)
                .collect(Collectors.joining("、"));
        String riskLevel = records.stream()
                .map(SysDictData::getRiskLevel)
                .filter(StringUtils::hasText)
                .map(this::normalizeRiskLevelValue)
                .findFirst()
                .orElse("HIGH");
        SysDictChangeApproval approval = createDictChangeApproval(
                first.getDictType(),
                "DELETE",
                riskLevel,
                targetIds,
                targetSummary,
                payload,
                first.getRemark()
        );
        publishDictChangeApprovalSubmittedEvent(approval);
        return DictChangeResult.pending(approval.getApprovalId(), approval.getApprovalNo(),
                "高风险字典删除已提交审批");
    }

    private SysDictChangeApproval createDictChangeApproval(String dictType,
                                                           String actionType,
                                                           String riskLevel,
                                                           String targetIds,
                                                           String targetSummary,
                                                           DictChangeApprovalPayload payload,
                                                           String remark) {
        SysDictChangeApproval approval = new SysDictChangeApproval();
        approval.setTenantId(resolveTenantId());
        approval.setApprovalNo(nextDictApprovalNo());
        approval.setDictType(dictType);
        approval.setChangeScope(CHANGE_SCOPE_DICT_DATA);
        approval.setActionType(actionType);
        approval.setRiskLevel(normalizeRiskLevelValue(riskLevel));
        approval.setTargetIds(targetIds);
        approval.setTargetSummary(targetSummary);
        approval.setPayloadJson(serializeDictChangePayload(payload));
        approval.setApplicantId(SecurityUtils.getUserId());
        approval.setApplicantName(resolveUserName());
        approval.setDeptId(UserContext.getDeptId());
        approval.setDeptName(UserContext.getDeptName());
        approval.setStatus("PENDING");
        approval.setRemark(remark);
        approval.setCreateBy(resolveUserName());
        approval.setCreateTime(LocalDateTime.now());
        approval.setUpdateBy(resolveUserName());
        approval.setUpdateTime(LocalDateTime.now());
        dictChangeApprovalMapper.insert(approval);
        return approval;
    }

    private void publishDictChangeApprovalSubmittedEvent(SysDictChangeApproval approval) {
        try {
            DictChangeApprovalSubmittedEvent event = new DictChangeApprovalSubmittedEvent();
            event.setApprovalId(approval.getApprovalId());
            event.setProcessDefKey(DICT_CHANGE_PROCESS_DEF_KEY);
            event.setSubmittedAt(LocalDateTime.now());

            BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                    .eventType("DICT_CHANGE_APPROVAL_SUBMITTED")
                    .sourceModule("cloudflow-auth")
                    .sourceId(approval.getApprovalId())
                    .tenantId(approval.getTenantId())
                    .payload(objectMapper.writeValueAsString(event))
                    .build();
            outboxPublisher.publish(envelope);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("字典审批提交流程事件发布失败", e);
        }
    }

    private void applyApprovedPayload(DictChangeApprovalPayload payload) {
        if (payload == null || !CHANGE_SCOPE_DICT_DATA.equalsIgnoreCase(payload.getChangeScope())) {
            throw new ServiceException("不支持的字典审批变更范围", ErrorCodeConstants.BAD_REQUEST);
        }
        String actionType = payload.getActionType() == null ? "" : payload.getActionType().trim().toUpperCase();
        switch (actionType) {
            case "ADD" -> {
                for (SysDictData item : payload.getNewDictDataList()) {
                    item.setDictCode(null);
                    normalizeRiskLevel(item);
                    fillTenantIdIfAbsent(item);
                    if (!applySaveDictData(item, WorkflowCallbackConstants.WORKFLOW_UPDATE_BY)) {
                        throw new ServiceException("审批通过后新增字典数据失败", ErrorCodeConstants.INTERNAL_SERVER_ERROR);
                    }
                }
            }
            case "UPDATE" -> {
                if (payload.getNewDictDataList().isEmpty() || payload.getOldDictDataList().isEmpty()) {
                    throw new ServiceException("字典审批载荷缺少更新数据", ErrorCodeConstants.BAD_REQUEST);
                }
                SysDictData newItem = payload.getNewDictDataList().get(0);
                SysDictData oldItem = payload.getOldDictDataList().get(0);
                assertDictDataMutationSafe(newItem, oldItem);
                if (!applyUpdateDictData(newItem, oldItem, WorkflowCallbackConstants.WORKFLOW_UPDATE_BY)) {
                    throw new ServiceException("审批通过后更新字典数据失败", ErrorCodeConstants.INTERNAL_SERVER_ERROR);
                }
            }
            case "DELETE" -> applyDeleteDictData(payload.getOldDictDataList(), WorkflowCallbackConstants.WORKFLOW_UPDATE_BY);
            default -> throw new ServiceException("不支持的字典审批动作: " + payload.getActionType(),
                    ErrorCodeConstants.BAD_REQUEST);
        }
    }

    private boolean applySaveDictData(SysDictData dictData, String operator) {
        fillTenantIdIfAbsent(dictData);
        dictData.setCreateBy(operator);
        dictData.setUpdateBy(operator);
        boolean inserted = dictDataMapper.insert(dictData) > 0;
        if (inserted) {
            refreshDictCache(dictData.getDictType());
            recordSnapshot(dictData.getDictType());
        }
        return inserted;
    }

    private boolean applyUpdateDictData(SysDictData dictData, SysDictData old, String operator) {
        dictData.setUpdateBy(operator);
        boolean updated = dictDataMapper.updateById(dictData) > 0;
        if (!updated) {
            return false;
        }
        if (old.getDictType() != null && !old.getDictType().equals(dictData.getDictType())) {
            refreshDictCache(old.getDictType());
            recordSnapshot(old.getDictType());
        }
        refreshDictCache(dictData.getDictType());
        recordSnapshot(dictData.getDictType());
        return true;
    }

    private void applyDeleteDictData(List<SysDictData> records, String operator) {
        if (records == null || records.isEmpty()) {
            return;
        }
        Set<String> affectedTypes = new HashSet<>();
        List<Long> dictCodes = new ArrayList<>();
        for (SysDictData data : records) {
            assertDictValueNotReferenced(data.getDictType(), data.getDictValue());
            if (data.getDictCode() != null) {
                dictCodes.add(data.getDictCode());
            }
            affectedTypes.add(data.getDictType());
        }
        for (String dictType : affectedTypes) {
            recordSnapshot(dictType);
        }
        if (!dictCodes.isEmpty()) {
            dictDataMapper.deleteBatchIds(dictCodes);
        }
        for (String dictType : affectedTypes) {
            refreshDictCache(dictType);
        }
    }

    private void assertDictDataMutationSafe(SysDictData incoming, SysDictData persisted) {
        if (incoming == null || persisted == null) {
            return;
        }
        String oldType = trimToNull(persisted.getDictType());
        String newType = trimToNull(incoming.getDictType());
        String oldValue = trimToNull(persisted.getDictValue());
        String newValue = trimToNull(incoming.getDictValue());
        if (!Objects.equals(oldType, newType) || !Objects.equals(oldValue, newValue)) {
            assertDictValueNotReferenced(persisted.getDictType(), persisted.getDictValue());
        }
    }

    private void assertHighRiskPermission(String dictType) {
        if (!isHighRiskDictType(dictType)) {
            return;
        }
        Set<String> permissions = UserContext.getPermissions();
        if (permissions.contains("*:*:*") || permissions.contains(SYSTEM_DICT_EDIT_PERMISSION)) {
            return;
        }
        throw new ServiceException("高风险系统字典需具备 special 权限后才可提交审批",
                ErrorCodeConstants.FORBIDDEN);
    }

    private SysDictChangeApproval requireDictChangeApproval(Long approvalId) {
        SysDictChangeApproval approval = dictChangeApprovalMapper.selectById(approvalId);
        if (approval == null) {
            throw new ServiceException("字典审批单不存在", ErrorCodeConstants.BAD_REQUEST);
        }
        return approval;
    }

    private void updateApprovalStatus(Long approvalId,
                                      String status,
                                      String instanceId,
                                      String approvalComment,
                                      String operator) {
        SysDictChangeApproval update = new SysDictChangeApproval();
        update.setApprovalId(approvalId);
        update.setStatus(status);
        update.setInstanceId(instanceId);
        update.setApprovalComment(approvalComment);
        update.setUpdateBy(operator);
        update.setUpdateTime(LocalDateTime.now());
        dictChangeApprovalMapper.updateById(update);
    }

    private String serializeDictChangePayload(DictChangeApprovalPayload payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException e) {
            throw new ServiceException("字典审批载荷序列化失败", ErrorCodeConstants.INTERNAL_SERVER_ERROR, e);
        }
    }

    private DictChangeApprovalPayload deserializeDictChangePayload(String payloadJson) {
        try {
            return objectMapper.readValue(payloadJson, DictChangeApprovalPayload.class);
        } catch (JsonProcessingException e) {
            throw new ServiceException("字典审批载荷反序列化失败", ErrorCodeConstants.INTERNAL_SERVER_ERROR, e);
        }
    }

    private List<SysDictData> loadDictDataList(Long[] dictCodes) {
        if (dictCodes == null || dictCodes.length == 0) {
            return List.of();
        }
        List<SysDictData> records = new ArrayList<>();
        for (Long dictCode : dictCodes) {
            SysDictData data = dictDataMapper.selectById(dictCode);
            if (data != null) {
                normalizeRiskLevel(data);
                records.add(data);
            }
        }
        return records;
    }

    private SysDictData cloneDictData(SysDictData source) {
        if (source == null) {
            return null;
        }
        SysDictData target = new SysDictData();
        BeanUtils.copyProperties(source, target);
        return target;
    }

    private void fillTenantIdIfAbsent(SysDictData dictData) {
        if (dictData != null && dictData.getTenantId() == null) {
            dictData.setTenantId(resolveTenantId());
        }
    }

    private Long resolveTenantId() {
        return SecurityUtils.getTenantId() == null ? DEFAULT_TENANT_ID : SecurityUtils.getTenantId();
    }

    private String resolveUserName() {
        String userName = SecurityUtils.getUsername();
        return StringUtils.hasText(userName) ? userName : "system";
    }

    private String nextDictApprovalNo() {
        return "DCA" + DateTimeFormatter.ofPattern("yyyyMMddHHmmss").format(LocalDateTime.now());
    }

    private String extractInstanceId(Object data) {
        if (data instanceof Map<?, ?> dataMap) {
            Object instanceId = dataMap.get("processInstanceId");
            if (instanceId == null) {
                instanceId = dataMap.get("instanceId");
            }
            return instanceId == null ? null : String.valueOf(instanceId);
        }
        return data == null ? null : String.valueOf(data);
    }

    private String normalizeRiskLevelValue(String riskLevel) {
        if (!StringUtils.hasText(riskLevel)) {
            return "HIGH";
        }
        String normalized = riskLevel.trim().toUpperCase();
        return "MID".equals(normalized) ? "HIGH" : normalized;
    }

    private String firstNonBlank(String first, String second) {
        return StringUtils.hasText(first) ? first : second;
    }

    private String trimToNull(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return value.trim();
    }

}
