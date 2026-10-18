package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.utils.file.FileUploadUtils;
import com.cloudflow.common.tenant.quota.TenantQuotaService;
import com.cloudflow.hr.domain.dto.HrHRequests;
import com.cloudflow.hr.domain.dto.HrSeveranceRuleRequests;
import com.cloudflow.hr.domain.entity.HrSeveranceRule;
import com.cloudflow.hr.domain.entity.HrSeveranceRuleSlab;
import com.cloudflow.hr.domain.vo.settlement.HrSeveranceRuleView;
import com.cloudflow.hr.mapper.HrSeveranceRuleMapper;
import com.cloudflow.hr.mapper.HrSeveranceRuleSlabMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import static com.cloudflow.hr.service.HrHException.conflict;
import static com.cloudflow.hr.service.HrHException.invalid;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;
import static com.cloudflow.hr.service.HrRuleSupport.userName;

@Service
@RequiredArgsConstructor
public class HrSeveranceRuleService {
    private static final String PERMISSION = "hr:severance:manage";
    private static final String PURPOSE = "HR_SEVERANCE_POLICY";
    private static final long MAX_FILE_SIZE = 10L * 1024 * 1024;
    private final HrSeveranceRuleMapper rules;
    private final HrSeveranceRuleSlabMapper slabs;
    private final HrHSupport access;
    private final HrRuleSupport support;
    private final HrFileStorage storage;
    private final TenantQuotaService quotas;
    private final ObjectMapper json;

    public PageResult<HrSeveranceRuleView> list(HrSeveranceRuleRequests.Query query) {
        access.permission(PERMISSION); access.validate(query);
        if (query.getPageNum() == null || query.getPageSize() == null) throw invalid("分页参数不能为空");
        LambdaQueryWrapper<HrSeveranceRule> filter = new LambdaQueryWrapper<HrSeveranceRule>()
                .eq(HrSeveranceRule::getTenantId, tenantId()).eq(HrSeveranceRule::getDeleted, 0)
                .eq(query.getStatus() != null, HrSeveranceRule::getStatus, query.getStatus());
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            filter.and(nested -> nested.like(HrSeveranceRule::getRuleName, query.getKeyword().trim())
                    .or().like(HrSeveranceRule::getRuleCode, query.getKeyword().trim()));
        }
        Page<HrSeveranceRule> page = rules.selectPage(new Page<>(query.getPageNum(), query.getPageSize()), filter.orderByDesc(HrSeveranceRule::getRuleId));
        return new PageResult<>(page.getRecords().stream().map(this::view).toList(), page.getTotal(), page.getCurrent(), page.getSize());
    }

    public HrSeveranceRuleView detail(Long identifier) { return locked(identifier, this::view); }

    public record SettlementPolicy(HrSettlementCalculation.Policy policy, Set<Long> componentIds, JsonNode evidence) {
        public SettlementPolicy { componentIds = Set.copyOf(componentIds); }
    }

    /** Read-only confirmed policy resolution under the settlement permission. */
    public SettlementPolicy forSettlement(Long identifier, LocalDate relievingDate) {
        access.permission("hr:settlement:calculate");
        HrSeveranceRule record = identifier == null ? null : rules.selectById(identifier);
        if (record == null || !Objects.equals(record.getTenantId(), tenantId()) || !Integer.valueOf(0).equals(record.getDeleted())) {
            throw new HrHException("SEVERANCE_POLICY_NOT_FOUND", "所选补偿政策不存在或不可见", 404);
        }
        if (!"CONFIRMED".equals(record.getStatus()) || record.getVersion() == null || record.getVersion() < 0
                || record.getConfirmedBy() == null || record.getConfirmedTime() == null) throw conflict("SEVERANCE_POLICY_UNCONFIRMED", "所选补偿政策尚未完整核定");
        HrSeveranceRuleRequests.Settings settings = settings(record);
        HrSettlementCalculation.Policy policy = calculationPolicy(record, settings);
        try { HrSettlementCalculation.validatePolicy(policy); }
        catch (IllegalArgumentException failure) { throw conflict("SEVERANCE_POLICY_INVALID", failure.getMessage()); }
        if (relievingDate == null || relievingDate.isBefore(policy.effectiveFrom())
                || policy.effectiveTo() != null && relievingDate.isAfter(policy.effectiveTo())) throw conflict("SEVERANCE_POLICY_EXPIRED", "所选政策未覆盖离职日期");
        if (settings.getSalaryComponentIds().isEmpty() || settings.getSalaryComponentIds().size() > 100
                || new HashSet<>(settings.getSalaryComponentIds()).size() != settings.getSalaryComponentIds().size()) throw conflict("SEVERANCE_POLICY_INVALID", "已核定工资项目缺失、重复或超出容量");
        HrSeveranceRuleMapper.PolicyFile file = policyFile(record);
        if (file == null) throw conflict("SEVERANCE_POLICY_INCOMPLETE", "已核定政策文件缺失或绑定失效");
        verifiedBytes(file);
        ObjectNode evidence = json.createObjectNode(); evidence.put("ruleId", identifier.toString()); evidence.put("version", record.getVersion());
        evidence.put("confirmedBy", record.getConfirmedBy().toString()); evidence.put("confirmedTime", record.getConfirmedTime().toString());
        evidence.put("policyFileId", file.fileId().toString()); evidence.put("policyFileHash", file.fileHash());
        evidence.set("policy", json.valueToTree(policy)); evidence.set("salaryComponentIds", json.valueToTree(settings.getSalaryComponentIds().stream().map(String::valueOf).toList()));
        return new SettlementPolicy(policy, new HashSet<>(settings.getSalaryComponentIds()), evidence);
    }

    public List<HrSeveranceRuleView.Component> components() {
        access.permission(PERMISSION); return rules.components(tenantId());
    }

    public Long create(HrSeveranceRuleRequests.Create input) {
        access.permission(PERMISSION); validateDraft(input);
        try {
            return support.transaction(() -> {
                HrSeveranceRule record = new HrSeveranceRule(); apply(record, input);
                record.setTenantId(tenantId()); record.setRuleCode(input.getRuleCode());
                record.setStatus("DRAFT"); record.setDeleted(0); record.setVersion(0);
                record.setCreateBy(userName()); record.setUpdateBy(userName());
                record.setCreateTime(HrHSupport.now()); record.setUpdateTime(HrHSupport.now());
                if (rules.insert(record) != 1 || record.getRuleId() == null) throw conflict("SEVERANCE_SAVE_FAILED", "补偿政策未保存");
                replaceSlabs(record.getRuleId(), input.getSlabs()); audit(record, "CREATE"); return record.getRuleId();
            });
        } catch (DuplicateKeyException failure) {
            throw conflict("SEVERANCE_CODE_EXISTS", "该政策编号已保存，请按编号查询原记录");
        }
    }

    public void update(Long identifier, HrSeveranceRuleRequests.Update input) {
        validateDraft(input);
        locked(identifier, record -> {
            editable(record); HrHSupport.version(input.getVersion(), record.getVersion());
            apply(record, input); persist(record); replaceSlabs(identifier, input.getSlabs()); audit(record, "UPDATE"); return null;
        });
    }

    public HrSeveranceRuleView uploadPolicy(Long identifier, Integer version, MultipartFile file) {
        return locked(identifier, record -> {
            editable(record); HrHSupport.version(version, record.getVersion());
            FileUploadUtils.ValidatedFile validated;
            byte[] bytes;
            try {
                validated = FileUploadUtils.validate(file, MAX_FILE_SIZE, new String[]{"pdf", "png", "jpg", "jpeg"});
                bytes = file.getBytes();
                if (bytes.length == 0 || bytes.length > MAX_FILE_SIZE || bytes.length != file.getSize()) throw invalid("政策文件大小无效");
            } catch (Exception failure) { throw invalid("请选择内容与扩展名一致且不超过10MiB的PDF、PNG或JPEG政策文件"); }
            HrSeveranceRuleMapper.PolicyFile previous = policyFile(record);
            if (previous != null && Objects.equals(previous.fileHash(), hash(bytes))) { verifiedBytes(previous); return view(record); }
            if (record.getPolicyFileId() != null) {
                if (previous == null || rules.retirePolicyFile(tenantId(), identifier, previous.fileId()) != 1) {
                    throw conflict("SEVERANCE_POLICY_CHANGED", "原政策文件绑定已变化，请重新核实");
                }
                quotas.refreshStorage(tenantId());
            }
            Long fileId = storage.save(bytes, validated.originalFileName(), PURPOSE);
            if (rules.bindPolicyFile(tenantId(), identifier, fileId, hash(bytes), userName()) != 1) {
                throw conflict("SEVERANCE_POLICY_BIND_FAILED", "政策文件未绑定，上传已撤回");
            }
            record.setPolicyFileId(fileId); persist(record); audit(record, "POLICY_UPLOAD"); return view(record);
        });
    }

    public void confirm(Long identifier, HrHRequests.VersionDTO input) {
        access.validate(input);
        locked(identifier, record -> {
            editable(record); HrHSupport.version(input.getVersion(), record.getVersion());
            HrSeveranceRuleRequests.Settings settings = settings(record);
            List<String> missing = missing(record, settings);
            if (!missing.isEmpty()) throw conflict("SEVERANCE_POLICY_INCOMPLETE", String.join("；", missing));
            for (Long component : settings.getSalaryComponentIds().stream().sorted().toList()) {
                if (rules.lockComponent(tenantId(), component) == null) throw conflict("SEVERANCE_COMPONENT_CHANGED", "所选工资项目已停用或变化，请重新核实");
            }
            verifiedBytes(Objects.requireNonNull(policyFile(record)));
            record.setStatus("CONFIRMED"); record.setConfirmedBy(access.user()); record.setConfirmedTime(HrHSupport.now());
            persist(record); audit(record, "CONFIRM"); return null;
        });
    }

    public ResponseEntity<byte[]> download(Long identifier) {
        return download(identifier, null);
    }

    public ResponseEntity<byte[]> download(Long identifier, Long expectedFileId) {
        return locked(identifier, record -> {
            HrSeveranceRuleMapper.PolicyFile file = policyFile(record);
            if (file == null) throw new HrHException("SEVERANCE_POLICY_NOT_FOUND", "政策文件不存在或已失效", 404);
            if (expectedFileId != null && !Objects.equals(file.fileId(), expectedFileId)) throw new HrHException("SEVERANCE_POLICY_FORBIDDEN", "无权下载该政策文件", 403);
            byte[] bytes = verifiedBytes(file);
            support.audit(PURPOSE, identifier, "POLICY_DOWNLOAD", Map.of("fileId", file.fileId()));
            return ResponseEntity.ok().contentType(MediaTypeFactory.getMediaType(file.fileName()).orElse(MediaType.APPLICATION_OCTET_STREAM))
                    .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(file.fileName(), StandardCharsets.UTF_8).build().toString())
                    .header(HttpHeaders.CACHE_CONTROL, "no-store").header("Content-Security-Policy", "default-src 'none'; sandbox")
                    .header("X-Content-Type-Options", "nosniff").body(bytes);
        });
    }

    public void authorizeDownload(Long identifier, Long fileId) {
        locked(identifier, record -> {
            HrSeveranceRuleMapper.PolicyFile file = policyFile(record);
            if (file == null || !Objects.equals(file.fileId(), fileId)) throw new HrHException("SEVERANCE_POLICY_FORBIDDEN", "无权下载该政策文件", 403);
            return null;
        });
    }

    private void validateDraft(HrSeveranceRuleRequests.Settings input) {
        access.permission(PERMISSION); access.validate(input);
        if (input.getEffectiveFrom().getYear() < 1000 || input.getEffectiveFrom().getYear() > 9999
                || input.getEffectiveTo() != null && (input.getEffectiveTo().isBefore(input.getEffectiveFrom()) || input.getEffectiveTo().getYear() > 9999)) {
            throw invalid("政策日期必须在1000至9999年之间，且失效日期不得早于生效日期");
        }
        if (new HashSet<>(input.getSalaryComponentIds()).size() != input.getSalaryComponentIds().size()) throw invalid("工资项目不能重复");
        Set<Long> available = new HashSet<>(components().stream().map(HrSeveranceRuleView.Component::value).toList());
        if (!available.containsAll(input.getSalaryComponentIds())) throw invalid("请选择本租户已启用的收入工资项目");
        Set<Integer> sortNumbers = new HashSet<>();
        for (HrSeveranceRuleRequests.Slab slab : input.getSlabs()) {
            if (!sortNumbers.add(slab.getSortNo()) || slab.getMaxServiceYears() != null && slab.getMaxServiceYears().compareTo(slab.getMinServiceYears()) <= 0) {
                throw invalid("分档顺序不能重复，上限必须大于下限");
            }
        }
    }

    private void apply(HrSeveranceRule record, HrSeveranceRuleRequests.Settings input) {
        BeanUtils.copyProperties(input, record, "ruleCode", "version", "salaryComponentIds");
        record.setRuleName(input.getRuleName().trim()); record.setRemark(input.getRemark() == null ? null : input.getRemark().trim());
        record.setSalaryComponentIds(json.valueToTree(input.getSalaryComponentIds()));
    }

    private void replaceSlabs(Long identifier, List<HrSeveranceRuleRequests.Slab> values) {
        slabs.delete(new LambdaQueryWrapper<HrSeveranceRuleSlab>().eq(HrSeveranceRuleSlab::getTenantId, tenantId()).eq(HrSeveranceRuleSlab::getRuleId, identifier));
        for (HrSeveranceRuleRequests.Slab value : values.stream().sorted(Comparator.comparing(HrSeveranceRuleRequests.Slab::getSortNo)).toList()) {
            HrSeveranceRuleSlab slab = new HrSeveranceRuleSlab(); BeanUtils.copyProperties(value, slab);
            slab.setTenantId(tenantId()); slab.setRuleId(identifier); slab.setCreateBy(userName()); slab.setUpdateBy(userName());
            slab.setCreateTime(HrHSupport.now()); slab.setUpdateTime(HrHSupport.now());
            if (slabs.insert(slab) != 1) throw conflict("SEVERANCE_SLAB_SAVE_FAILED", "政策分档未保存，整次修改已撤回");
        }
    }

    private HrSeveranceRule visible(Long identifier) {
        access.permission(PERMISSION);
        HrSeveranceRule record = identifier == null ? null : rules.selectById(identifier);
        if (record == null || !Objects.equals(record.getTenantId(), tenantId()) || !Integer.valueOf(0).equals(record.getDeleted())) {
            throw new HrHException("SEVERANCE_RULE_NOT_FOUND", "补偿政策不存在", 404);
        }
        return record;
    }

    private <Result> Result locked(Long identifier, Function<HrSeveranceRule, Result> action) {
        access.permission(PERMISSION);
        return support.transaction(() -> {
            if (identifier == null || rules.lock(tenantId(), identifier) == null) throw new HrHException("SEVERANCE_RULE_NOT_FOUND", "补偿政策不存在", 404);
            return action.apply(visible(identifier));
        });
    }

    private void editable(HrSeveranceRule record) {
        if (!"DRAFT".equals(record.getStatus()) || rules.referenced(tenantId(), record.getRuleId()) != 0) {
            throw conflict("SEVERANCE_RULE_READ_ONLY", "已核定或已被结算引用的政策只读，请使用新编号建立新政策");
        }
    }

    private void persist(HrSeveranceRule record) {
        Integer previous = record.getVersion(); record.setUpdateBy(userName()); record.setUpdateTime(HrHSupport.now());
        if (rules.updateDraft(record, previous) != 1) throw conflict("VERSION_CONFLICT", "政策已变化或被结算引用，请重新读取");
        record.setVersion(previous + 1);
    }

    private HrSeveranceRuleRequests.Settings settings(HrSeveranceRule record) {
        HrSeveranceRuleRequests.Settings result = new HrSeveranceRuleRequests.Settings(); BeanUtils.copyProperties(record, result, "salaryComponentIds");
        List<Long> identifiers = new ArrayList<>();
        if (record.getSalaryComponentIds() == null || !record.getSalaryComponentIds().isArray()) throw conflict("SEVERANCE_POLICY_INVALID", "工资项目配置无法读取");
        for (JsonNode node : record.getSalaryComponentIds()) {
            if (!node.isIntegralNumber() || !node.canConvertToLong() || node.longValue() <= 0) throw conflict("SEVERANCE_POLICY_INVALID", "工资项目配置无法读取");
            identifiers.add(node.longValue());
        }
        result.setSalaryComponentIds(identifiers);
        result.setSlabs(slabs.selectList(new LambdaQueryWrapper<HrSeveranceRuleSlab>().eq(HrSeveranceRuleSlab::getTenantId, tenantId())
                .eq(HrSeveranceRuleSlab::getRuleId, record.getRuleId()).orderByAsc(HrSeveranceRuleSlab::getSortNo)).stream().map(slab -> {
                    HrSeveranceRuleRequests.Slab value = new HrSeveranceRuleRequests.Slab(); BeanUtils.copyProperties(slab, value); return value;
                }).toList());
        return result;
    }

    private List<String> missing(HrSeveranceRule record, HrSeveranceRuleRequests.Settings settings) {
        List<String> result = new ArrayList<>();
        List<Long> available = rules.components(tenantId()).stream().map(HrSeveranceRuleView.Component::value).toList();
        if (settings.getSalaryComponentIds().isEmpty()) result.add("请选择月工资基数项目");
        else if (new HashSet<>(settings.getSalaryComponentIds()).size() != settings.getSalaryComponentIds().size()
                || !available.containsAll(settings.getSalaryComponentIds())) result.add("工资项目已停用、失效或重复，请重新选择");
        if (policyFile(record) == null) result.add("请上传核定政策文件");
        try { HrSettlementCalculation.validatePolicy(calculationPolicy(record, settings)); }
        catch (IllegalArgumentException failure) { result.add(failure.getMessage()); }
        return List.copyOf(result);
    }

    private HrSettlementCalculation.Policy calculationPolicy(HrSeveranceRule record, HrSeveranceRuleRequests.Settings settings) {
        List<HrSettlementCalculation.Slab> values = settings.getSlabs().stream().map(slab -> new HrSettlementCalculation.Slab(
                slab.getSortNo(), slab.getMinServiceYears(), slab.getMaxServiceYears(), slab.getCalculationMode(), slab.getCompensationMonths())).toList();
        return new HrSettlementCalculation.Policy(record.getStatus(), record.getEffectiveFrom(), record.getEffectiveTo(), record.getAveragingMonths(),
                record.getServiceRounding(), values, record.getSocialMonthlySalary(), record.getBaseCapMultiplier(), record.getMaxCompensationMonths(),
                record.getNoticeMonths(), record.getLeaveDailyDivisor(), record.getLeaveHoursPerDay(), record.getLeaveCashMultiplier(), HrSettlementCalculation.AMOUNT_ROUNDING);
    }

    private HrSeveranceRuleView view(HrSeveranceRule record) {
        HrSeveranceRuleRequests.Settings settings = settings(record);
        HrSeveranceRuleMapper.PolicyFile file = policyFile(record);
        return new HrSeveranceRuleView(record.getRuleId(), record.getRuleCode(), settings,
                rules.components(tenantId()).stream().filter(component -> settings.getSalaryComponentIds().contains(component.value())).toList(),
                file == null ? null : new HrSeveranceRuleView.PolicyFile(file.fileId(), file.fileName(), file.fileSize()), missing(record, settings),
                record.getStatus(), record.getConfirmedBy(), record.getConfirmedTime(), record.getVersion(),
                "DRAFT".equals(record.getStatus()) && rules.referenced(tenantId(), record.getRuleId()) == 0);
    }

    private HrSeveranceRuleMapper.PolicyFile policyFile(HrSeveranceRule record) {
        return record.getPolicyFileId() == null ? null : rules.policyFile(tenantId(), record.getRuleId(), record.getPolicyFileId());
    }

    private byte[] verifiedBytes(HrSeveranceRuleMapper.PolicyFile file) {
        if (file.fileSize() == null || file.fileSize() <= 0 || file.fileSize() > MAX_FILE_SIZE) throw conflict("SEVERANCE_POLICY_INVALID", "政策文件大小无效");
        byte[] bytes = storage.loadPrivate(file.fileId(), PURPOSE);
        if (bytes.length != file.fileSize() || !hash(bytes).equals(file.fileHash())) throw conflict("SEVERANCE_POLICY_CHANGED", "政策文件内容与上传记录不一致");
        return bytes;
    }

    private void audit(HrSeveranceRule record, String operation) {
        support.audit(PURPOSE, record.getRuleId(), operation, Map.of("status", record.getStatus(), "version", record.getVersion(),
                "amountRounding", HrSettlementCalculation.AMOUNT_ROUNDING.name()));
    }

    private static String hash(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (NoSuchAlgorithmException failure) { throw new IllegalStateException(failure); }
    }
}
