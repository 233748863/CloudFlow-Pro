package com.cloudflow.crm.service.deal;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.common.datascope.DataScopeHandle;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.crm.domain.vo.CrmReceiptAchievementRow;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmReceiptAchievementMapper;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CrmReceiptAchievementService {
    private final CrmReceiptAchievementMapper amounts;
    private final DataScopeHandle dataScopeHandle;

    public record Scope(Long tenantId, boolean all, Long userId, List<Long> deptIds) {
        public boolean allows(Long ownerId, Long deptId) {
            return all || userId != null && Objects.equals(userId, ownerId) || deptId != null && deptIds.contains(deptId);
        }
    }

    public record Amounts(BigDecimal received, BigDecimal baseline) {
        public static Amounts zero() { return new Amounts(new BigDecimal("0.00"), new BigDecimal("0.00")); }
        public Amounts add(Amounts other) { return new Amounts(received.add(other.received), baseline.add(other.baseline)); }
    }

    public Scope scope() {
        Long userId = UserContext.getUserId();
        Long tenantId = UserContext.getTenantId();
        if (userId == null || userId <= 0 || tenantId == null || tenantId <= 0 || !Objects.equals(tenantId, CrmRecordSupport.tenantId()))
            throw new ServiceException("销售考核必须使用可信登录身份", 403);
        DataScope requested = DataScopeUtils.listScope();
        boolean all = Boolean.TRUE.equals(dataScopeHandle.calcScope(requested));
        List<Long> departments = requested.getDeptList() == null ? List.of() : requested.getDeptList().stream()
                .filter(Objects::nonNull).filter(id -> id > 0).distinct().toList();
        return new Scope(tenantId, all, requested.getUserId(), List.copyOf(departments));
    }

    @Transactional(readOnly = true)
    public Map<Long, Amounts> summarize(String dimension, List<Long> ids, LocalDate start, LocalDate end,
            String calculationBasis, String currency, Scope scope) {
        if (!Set.of("OWNER", "DEPT").contains(dimension == null ? "" : dimension)) throw invalid("考核维度无效");
        basis(calculationBasis); CrmDealPolicy.currency(currency);
        if (start == null || end == null || end.isBefore(start) || start.getYear() < 1000 || end.getYear() > 9999) throw invalid("考核日期范围无效");
        if (scope == null || !Objects.equals(scope.tenantId(), UserContext.getTenantId())) throw invalid("考核数据范围无效");
        if (ids == null || ids.isEmpty()) return Map.of();
        if (ids.size() > 200 || ids.stream().anyMatch(id -> id == null || id <= 0)) throw invalid("一次考核查询须指定1至200个有效对象");
        List<Long> selected = ids.stream().distinct().toList();
        LocalDateTime until = end.atTime(LocalTime.of(23, 59, 59));
        List<CrmReceiptAchievementRow> rows = "TEAM_V2".equals(calculationBasis)
                ? amounts.team(dimension, selected, start.atStartOfDay(), until, currency, scope)
                : amounts.owner(dimension, selected, start, end, currency, scope);
        Map<Long, Amounts> result = new LinkedHashMap<>();
        for (CrmReceiptAchievementRow row : rows) {
            Long key = "OWNER".equals(dimension) ? row.getOwnerId() : row.getDeptId();
            if (key == null || !selected.contains(key)) throw invalid("考核查询返回了范围外对象");
            result.merge(key, new Amounts(money(row.getReceivedAmount()), money(row.getBaselineAmount())), Amounts::add);
        }
        return Map.copyOf(result);
    }

    public static String basis(String value) {
        if (!Set.of("OWNER_V1", "TEAM_V2").contains(value == null ? "" : value)) throw invalid("考核口径须为旧负责人或团队分成");
        return value;
    }

    private static BigDecimal money(BigDecimal value) { return value == null ? new BigDecimal("0.00") : value.setScale(2); }
    private static CrmBusinessException invalid(String message) { return new CrmBusinessException(message); }
}
