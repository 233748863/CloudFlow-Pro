package com.cloudflow.crm.service.impl;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmSalesTarget;
import com.cloudflow.crm.domain.dto.CrmSalesTargetWriteDTO;
import com.cloudflow.crm.domain.vo.CrmSalesTargetPreviewVO;
import com.cloudflow.crm.domain.vo.HrEmployeeSummaryVO;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmSalesTargetMapper;
import com.cloudflow.crm.service.ICrmSalesTargetService;
import com.cloudflow.crm.service.deal.CrmDealMemberResolver;
import com.cloudflow.crm.service.deal.CrmDealPolicy;
import com.cloudflow.crm.service.deal.CrmReceiptAchievementService;
import com.cloudflow.crm.service.deal.CrmReceiptAchievementService.Amounts;
import com.cloudflow.crm.service.deal.CrmReceiptAchievementService.Scope;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CrmSalesTargetServiceImpl implements ICrmSalesTargetService {
    private final CrmSalesTargetMapper targets;
    private final CrmReceiptAchievementService achievements;
    private final CrmDealMemberResolver members;
    private final ObjectMapper json;

    @Override
    @Transactional(readOnly = true)
    public PageResult<CrmSalesTarget> queryPage(CrmSalesTarget query, PageQuery pageQuery) {
        if (query != null) {
            if (query.getCalculationBasis() != null) CrmReceiptAchievementService.basis(query.getCalculationBasis());
            if (query.getCurrency() != null) CrmDealPolicy.currency(query.getCurrency());
        }
        Scope scope = achievements.scope();
        PageResult<CrmSalesTarget> result = PageResult.build(targets.selectPageByDataScope(pageQuery.build(), query, scope));
        attach(result.getRows(), scope);
        return result;
    }

    @Override
    @Transactional(readOnly = true)
    public CrmSalesTarget detail(Long id) {
        Scope scope = achievements.scope();
        CrmSalesTarget row = read(id, scope, false);
        attach(List.of(row), scope);
        return row;
    }

    @Override
    @Transactional(readOnly = true)
    public CrmSalesTarget creation(String requestKey) {
        Scope scope = achievements.scope();
        CrmSalesTarget row = targets.byNumber(number(requestKey), scope.tenantId(), false);
        if (row == null) return null;
        verify(row, scope);
        attach(List.of(row), scope);
        return row;
    }

    @Override
    @Audit(name = "创建销售目标")
    @Transactional(rollbackFor = Exception.class)
    public CrmSalesTarget createSalesTarget(CrmSalesTargetWriteDTO request) {
        require(request);
        if (request.salesTargetId() != null || request.version() != null && request.version() != 0) throw invalid("新建目标不能指定已有记录或版本");
        Scope scope = achievements.scope();
        CrmSalesTarget row = normalize(request, null, scope);
        row.setTargetNo(number(request.requestKey()));
        CrmSalesTarget existing = targets.byNumber(row.getTargetNo(), scope.tenantId(), false);
        if (existing != null) return sameCreation(existing, row, scope);
        CrmRecordSupport.create(row, "salesTargetId");
        try { CrmRecordSupport.saved(targets.insert(row)); }
        catch (DuplicateKeyException duplicate) {
            existing = targets.byNumber(row.getTargetNo(), scope.tenantId(), true);
            if (existing == null) throw duplicate;
            return sameCreation(existing, row, scope);
        }
        attach(List.of(row), scope);
        return row;
    }

    @Override
    @Audit(name = "更新销售目标")
    @Transactional(rollbackFor = Exception.class)
    public CrmSalesTarget updateSalesTarget(CrmSalesTargetWriteDTO request) {
        require(request);
        Scope scope = achievements.scope();
        CrmSalesTarget previous = read(request.salesTargetId(), scope, true);
        version(request.version(), previous);
        CrmSalesTarget row = normalize(request, previous, scope);
        if (requiresConfirmation(previous, row)) {
            CrmSalesTargetPreviewVO preview = compare(previous, row, scope);
            if (!Boolean.TRUE.equals(request.basisChangeConfirmed()) || !Objects.equals(preview.fingerprint(), request.previewFingerprint()))
                throw invalid("考核口径或币种变更须重新预览差异并明确确认；金额已变化时不能沿用旧预览");
        }
        CrmRecordSupport.touch(row);
        CrmRecordSupport.saved(targets.write(row));
        return detail(row.getSalesTargetId());
    }

    @Override
    @Transactional(readOnly = true)
    public CrmSalesTargetPreviewVO preview(CrmSalesTargetWriteDTO request) {
        require(request);
        Scope scope = achievements.scope();
        CrmSalesTarget previous = request.salesTargetId() == null ? null : read(request.salesTargetId(), scope, false);
        if (previous != null) version(request.version(), previous);
        return compare(previous, normalize(request, previous, scope), scope);
    }

    @Override
    @Audit(name = "删除销售目标", highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public void removeSalesTargets(List<Long> ids, List<Integer> versions) {
        if (ids == null || ids.isEmpty() || ids.size() > 100 || versions == null || versions.size() != ids.size()
                || ids.stream().anyMatch(id -> id == null || id <= 0) || ids.stream().distinct().count() != ids.size())
            throw invalid("删除须提供1至100个不同的目标及其版本");
        Scope scope = achievements.scope();
        Map<Long, Integer> expected = new LinkedHashMap<>();
        for (int index = 0; index < ids.size(); index++) expected.put(ids.get(index), versions.get(index));
        for (Long id : ids.stream().sorted().toList()) {
            CrmSalesTarget row = read(id, scope, true);
            version(expected.get(id), row);
            CrmRecordSupport.touch(row);
            CrmRecordSupport.saved(targets.markDeleted(row));
        }
    }

    private CrmSalesTarget normalize(CrmSalesTargetWriteDTO request, CrmSalesTarget previous, Scope scope) {
        CrmSalesTarget row = new CrmSalesTarget();
        row.setSalesTargetId(previous == null ? null : previous.getSalesTargetId());
        row.setTenantId(scope.tenantId());
        row.setVersion(previous == null ? 0 : previous.getVersion());
        row.setTargetName(CrmRecordSupport.text(request.targetName(), 120, "目标名称"));
        row.setDimensionType(CrmRecordSupport.code(request.dimensionType(), null, Set.of("OWNER", "DEPT"), "考核维度"));
        row.setPeriodType(CrmRecordSupport.code(request.periodType(), null, Set.of("MONTH", "QUARTER", "YEAR"), "考核周期"));
        if (request.targetYear() == null || request.targetYear() < 1000 || request.targetYear() > 9999) throw invalid("目标年份须为1000至9999");
        row.setTargetYear(request.targetYear());
        if (!"YEAR".equals(row.getPeriodType())) {
            int maximum = "MONTH".equals(row.getPeriodType()) ? 12 : 4;
            if (request.targetPeriod() == null || request.targetPeriod() < 1 || request.targetPeriod() > maximum) throw invalid("目标周期超出所选月份或季度范围");
            row.setTargetPeriod(request.targetPeriod());
        }
        String amount = request.targetAmount() == null ? "" : request.targetAmount().trim();
        if (!amount.matches("(?:0|[1-9][0-9]{0,13})(?:\\.[0-9]{1,2})?")) throw invalid("目标金额须为非负十进制金额，最多14位整数和2位小数");
        row.setTargetAmount(CrmRecordSupport.money(new BigDecimal(amount), "目标金额").setScale(2));
        row.setCalculationBasis(CrmReceiptAchievementService.basis(request.calculationBasis() == null
                ? previous == null ? "TEAM_V2" : previous.getCalculationBasis() : request.calculationBasis()));
        row.setCurrency(CrmDealPolicy.currency(request.currency() == null ? previous == null ? "CNY" : previous.getCurrency() : request.currency()));
        row.setStatus(CrmRecordSupport.code(request.status(), previous == null ? "ACTIVE" : previous.getStatus(), Set.of("ACTIVE", "INACTIVE"), "目标状态"));
        if (request.remark() != null && request.remark().length() > 500) throw invalid("目标备注最多500字符");
        row.setRemark(request.remark() == null || request.remark().isBlank() ? null : request.remark().trim());
        if ("OWNER".equals(row.getDimensionType())) {
            Long ownerId = request.ownerId() == null ? UserContext.getUserId() : request.ownerId();
            CrmDealMemberResolver.Resolved resolved = members.resolve(List.of(new CrmDealMemberResolver.Assignment(ownerId, "OWNER", BigDecimal.ONE, null)));
            HrEmployeeSummaryVO owner = resolved.directory().get(ownerId);
            row.setOwnerId(owner.getUserId()); row.setOwnerName(owner.getEmployeeName());
            row.setDeptId(owner.getDeptId()); row.setDeptName(owner.getDeptName());
        } else {
            if (request.deptId() == null || request.deptId() <= 0) throw invalid("部门目标须选择有效部门");
            String name = targets.departmentName(request.deptId(), scope.tenantId());
            if (name == null || name.isBlank()) throw invalid("部门不存在或已停用");
            row.setDeptId(request.deptId()); row.setDeptName(name);
        }
        if (!scope.allows(row.getOwnerId(), row.getDeptId())) throw invalid("无权设置该人员或部门的销售目标");
        return row;
    }

    private CrmSalesTargetPreviewVO compare(CrmSalesTarget previous, CrmSalesTarget proposed, Scope scope) {
        Amounts owner = amount(proposed, "OWNER_V1", scope);
        Amounts team = amount(proposed, "TEAM_V2", scope);
        BigDecimal prior = previous == null ? new BigDecimal("0.00") : amount(previous, previous.getCalculationBasis(), scope).received();
        List<Object> content = new ArrayList<>(payload(proposed));
        content.addAll(Arrays.asList(scope.tenantId(), UserContext.getUserId(), previous == null ? null : previous.getSalesTargetId(),
                previous == null ? null : previous.getVersion(), previous == null ? null : previous.getCalculationBasis(),
                previous == null ? null : previous.getCurrency(), prior.toPlainString(), owner.received().toPlainString(),
                team.received().toPlainString(), team.baseline().toPlainString()));
        return new CrmSalesTargetPreviewVO(previous == null ? null : previous.getVersion(), previous == null ? null : previous.getCalculationBasis(),
                previous == null ? null : previous.getCurrency(), proposed.getCalculationBasis(), proposed.getCurrency(), prior,
                owner.received(), team.received(), team.baseline(), requiresConfirmation(previous, proposed), fingerprint(content));
    }

    private void attach(List<CrmSalesTarget> rows, Scope scope) {
        Map<String, List<CrmSalesTarget>> groups = rows.stream().collect(Collectors.groupingBy(this::group, LinkedHashMap::new, Collectors.toList()));
        for (List<CrmSalesTarget> group : groups.values()) {
            CrmSalesTarget sample = group.get(0);
            List<Long> ids = group.stream().map(this::reference).filter(Objects::nonNull).distinct().toList();
            Map<Long, Amounts> totals = achievements.summarize(sample.getDimensionType(), ids, start(sample), end(sample),
                    sample.getCalculationBasis(), sample.getCurrency(), scope);
            for (CrmSalesTarget row : group) {
                Amounts actual = totals.getOrDefault(reference(row), Amounts.zero());
                row.setAchievedAmount(actual.received()); row.setBaselineAmount(actual.baseline());
                row.setGapAmount(row.getTargetAmount().subtract(actual.received()));
                row.setCompletionRate(row.getTargetAmount().signum() == 0 ? new BigDecimal("0.00")
                        : actual.received().multiply(new BigDecimal("100")).divide(row.getTargetAmount(), 2, RoundingMode.HALF_UP));
                row.setPeriodLabel("YEAR".equals(row.getPeriodType()) ? row.getTargetYear() + "年"
                        : row.getTargetYear() + ("QUARTER".equals(row.getPeriodType()) ? "年 Q" : "年 ") + row.getTargetPeriod()
                        + ("MONTH".equals(row.getPeriodType()) ? "月" : ""));
            }
        }
    }

    private Amounts amount(CrmSalesTarget row, String basis, Scope scope) {
        Long id = reference(row);
        if (id == null) throw invalid("目标对象缺失，请先核对目标");
        return achievements.summarize(row.getDimensionType(), List.of(id), start(row), end(row), basis, row.getCurrency(), scope)
                .getOrDefault(id, Amounts.zero());
    }

    private CrmSalesTarget read(Long id, Scope scope, boolean lock) {
        if (id == null || id <= 0) throw invalid("销售目标ID无效");
        return verify(targets.accessible(id, scope, lock), scope);
    }

    private CrmSalesTarget verify(CrmSalesTarget row, Scope scope) {
        if (row == null || !Objects.equals(row.getTenantId(), scope.tenantId()) || !Integer.valueOf(0).equals(row.getDeleted())
                || !scope.allows(row.getOwnerId(), row.getDeptId())) throw invalid("销售目标不存在或无权访问");
        return row;
    }

    private CrmSalesTarget sameCreation(CrmSalesTarget existing, CrmSalesTarget proposed, Scope scope) {
        verify(existing, scope);
        if (!payload(existing).equals(payload(proposed))) throw invalid("该操作标识已用于其他目标内容，请先核对原创建结果");
        attach(List.of(existing), scope);
        return existing;
    }

    private List<Object> payload(CrmSalesTarget row) {
        return Arrays.asList(row.getTargetName(), row.getDimensionType(), row.getPeriodType(), row.getTargetYear(), row.getTargetPeriod(),
                row.getOwnerId(), row.getDeptId(), row.getTargetAmount().setScale(2).toPlainString(),
                row.getCalculationBasis(), row.getCurrency(), row.getStatus(), row.getRemark());
    }

    private String fingerprint(List<Object> content) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json.writeValueAsBytes(content))); }
        catch (Exception failure) { throw new IllegalStateException("目标差异预览生成失败", failure); }
    }

    private boolean requiresConfirmation(CrmSalesTarget previous, CrmSalesTarget proposed) {
        return previous != null && (!Objects.equals(previous.getCalculationBasis(), proposed.getCalculationBasis())
                || !Objects.equals(previous.getCurrency(), proposed.getCurrency()));
    }

    private Long reference(CrmSalesTarget row) { return "OWNER".equals(row.getDimensionType()) ? row.getOwnerId() : row.getDeptId(); }
    private String group(CrmSalesTarget row) {
        return row.getDimensionType() + ":" + row.getPeriodType() + ":" + row.getTargetYear() + ":" + row.getTargetPeriod()
                + ":" + row.getCalculationBasis() + ":" + row.getCurrency();
    }
    private LocalDate start(CrmSalesTarget row) {
        int month = switch (row.getPeriodType()) { case "YEAR" -> 1; case "QUARTER" -> (row.getTargetPeriod() - 1) * 3 + 1; default -> row.getTargetPeriod(); };
        return LocalDate.of(row.getTargetYear(), month, 1);
    }
    private LocalDate end(CrmSalesTarget row) {
        LocalDate start = start(row);
        int months = switch (row.getPeriodType()) { case "YEAR" -> 12; case "QUARTER" -> 3; default -> 1; };
        LocalDate finalMonth = start.plusMonths(months - 1);
        return finalMonth.withDayOfMonth(finalMonth.lengthOfMonth());
    }
    private static String number(String key) {
        if (key == null || !key.matches("[a-f0-9]{32}")) throw invalid("新建操作标识无效，请保留原页面并重新核对");
        return CrmConstants.NoPrefix.SALES_TARGET + key;
    }
    private static void version(Integer expected, CrmSalesTarget row) {
        if (expected == null || !Objects.equals(expected, row.getVersion())) throw invalid("销售目标已被修改，请核对最新版本后重试");
    }
    private static void require(CrmSalesTargetWriteDTO request) { if (request == null) throw invalid("销售目标内容不能为空"); }
    private static CrmBusinessException invalid(String message) { return new CrmBusinessException(message); }
}
