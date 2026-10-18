package com.cloudflow.crm.service.impl;

import com.cloudflow.crm.exception.CrmBusinessException;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.crm.constant.CrmBusinessTypes;
import com.cloudflow.crm.domain.CrmApproval;
import com.cloudflow.crm.domain.CrmCustomerCredit;
import com.cloudflow.crm.mapper.CrmApprovalMapper;
import com.cloudflow.crm.mapper.CrmCustomerCreditMapper;
import com.cloudflow.crm.service.ICrmApprovalService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class CrmCreditService {
    private final CrmCustomerCreditMapper creditMapper;
    private final CrmApprovalMapper approvalMapper;
    private final CrmReferenceService references;
    private final ICrmApprovalService approvals;
    private final CrmRuleService rules;
    private final CrmAuditTrail auditTrail;

    public Map<String, Object> view(Long customerId) {
        references.customer(customerId);
        CrmCustomerCredit credit = find(customerId);
        Map<String, BigDecimal> exposure = creditMapper.exposure(customerId, LocalDate.now());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("credit", credit);
        result.put("occupied", exposure.get("occupied"));
        result.put("overdue", exposure.get("overdue"));
        result.put("available", credit == null ? null : credit.getCreditLimit().subtract(exposure.get("occupied")));
        result.put("effective", effective(credit, LocalDate.now()));
        result.put("bypassActive", bypassActive(credit, LocalDate.now()));
        result.put("pendingApproval", pending(customerId));
        return result;
    }

    @Transactional(rollbackFor = Exception.class, isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public Long submit(Long customerId, CrmCustomerCredit request) {
        references.customer(customerId);
        CrmRecordSupport.require(request, "额度信息不能为空");
        CrmRecordSupport.require(creditMapper.lockCustomer(customerId), "客户不存在");
        if (pending(customerId) != null) throw new CrmBusinessException("客户已有待处理的额度调整审批");
        CrmCustomerCredit current = creditMapper.lockByCustomer(customerId);
        if (current == null) {
            current = new CrmCustomerCredit();
            current.setCustomerId(customerId); current.setCreditLimit(BigDecimal.ZERO);
            current.setOverdueThreshold(BigDecimal.ZERO); current.setCurrency("CNY");
            current.setStatus("DISABLED"); current.setBypassFlag(0);
            CrmRecordSupport.create(current, "creditId"); creditMapper.insert(current);
        } else if (!Objects.equals(current.getVersion(), request.getVersion())) {
            throw new CrmBusinessException("额度信息已修改，请刷新后重试");
        }
        CrmCustomerCredit proposed = new CrmCustomerCredit();
        proposed.setCreditId(current.getCreditId()); proposed.setCustomerId(customerId);
        proposed.setCreditLimit(CrmRecordSupport.money(request.getCreditLimit(), "信用额度"));
        proposed.setOverdueThreshold(CrmRecordSupport.money(request.getOverdueThreshold(), "超期阈值"));
        proposed.setCurrency(CrmRecordSupport.code(request.getCurrency(), "CNY", Set.of("CNY"), "币种（本期仅支持人民币）"));
        proposed.setStatus(CrmRecordSupport.code(request.getStatus(), "ENABLED", Set.of("ENABLED", "DISABLED"), "额度状态"));
        proposed.setEffectiveStart(request.getEffectiveStart()); proposed.setEffectiveEnd(request.getEffectiveEnd());
        if (proposed.getEffectiveStart() != null && proposed.getEffectiveEnd() != null
                && proposed.getEffectiveEnd().isBefore(proposed.getEffectiveStart())) throw new CrmBusinessException("额度有效期结束不能早于开始");
        proposed.setRemark(CrmRecordSupport.text(request.getRemark(), 500, "额度调整原因"));
        Long approvalId = approvals.submitCustomerCredit(proposed);
        auditTrail.record("CRM_CREDIT_SUBMITTED", "CRM_CUSTOMER:" + customerId, "审批单=" + approvalId + ",申请额度=" + proposed.getCreditLimit(), true);
        return approvalId;
    }

    @Transactional(rollbackFor = Exception.class)
    public void bypass(Long customerId, CrmCustomerCredit request) {
        references.customer(customerId);
        CrmCustomerCredit current = CrmRecordSupport.require(creditMapper.lockByCustomer(customerId), "请先设置客户额度");
        if (!Objects.equals(current.getVersion(), request.getVersion())) throw new CrmBusinessException("额度信息已修改，请刷新后重试");
        int flag = CrmRecordSupport.flag(request.getBypassFlag());
        String reason = CrmRecordSupport.text(request.getBypassReason(), 500, "放行或撤销原因");
        if (flag == 1 && request.getBypassExpireDate() != null && request.getBypassExpireDate().isBefore(LocalDate.now())) {
            throw new CrmBusinessException("临时放行有效期不能早于今天");
        }
        CrmRecordSupport.saved(creditMapper.update(null, new LambdaUpdateWrapper<CrmCustomerCredit>()
                .eq(CrmCustomerCredit::getCreditId, current.getCreditId()).eq(CrmCustomerCredit::getVersion, current.getVersion())
                .set(CrmCustomerCredit::getBypassFlag, flag).set(CrmCustomerCredit::getBypassReason, reason)
                .set(CrmCustomerCredit::getBypassBy, UserContext.getUserId()).set(CrmCustomerCredit::getBypassTime, LocalDateTime.now())
                .set(CrmCustomerCredit::getBypassExpireDate, flag == 1 ? request.getBypassExpireDate() : null)
                .set(CrmCustomerCredit::getUpdateBy, CrmRecordSupport.userName()).set(CrmCustomerCredit::getUpdateTime, LocalDateTime.now())
                .set(CrmCustomerCredit::getVersion, current.getVersion() + 1)));
        auditTrail.record("CRM_CREDIT_BYPASS", "CRM_CUSTOMER:" + customerId, "放行=" + flag + ",原因=" + reason + ",截止=" + request.getBypassExpireDate(), true);
    }

    public void check(Long customerId, BigDecimal amount, String currency, String businessType, Long businessId) {
        references.customer(customerId);
        BigDecimal newAmount = CrmRecordSupport.money(amount, "本次金额");
        CrmCustomerCredit credit = find(customerId);
        LocalDate today = LocalDate.now();
        if (!effective(credit, today)) return;
        String actualCurrency = currency == null || currency.isBlank() ? "CNY" : currency;
        if (!"CNY".equals(credit.getCurrency()) || !"CNY".equals(actualCurrency)) throw new CrmBusinessException("信用占用本期仅支持人民币，不支持混币核算");
        Map<String, BigDecimal> exposure = creditMapper.exposure(customerId, today);
        boolean bypass = bypassActive(credit, today);
        String summary = "（额度=" + credit.getCreditLimit() + "，已占用=" + exposure.get("occupied") + "，超期=" + exposure.get("overdue") + "）";
        rules.evaluate("crm.credit.overdue", "BLOCK", businessType, businessId, exposure.get("overdue"),
                credit.getOverdueThreshold(), bypass, "客户超期欠款超过允许阈值" + summary);
        rules.evaluate("crm.credit.limit", "WARN", businessType, businessId, exposure.get("occupied").add(newAmount),
                credit.getCreditLimit(), bypass, "本次金额加已占用超过客户信用额度" + summary);
    }

    public static boolean effective(CrmCustomerCredit credit, LocalDate today) {
        return credit != null && "ENABLED".equals(credit.getStatus())
                && (credit.getEffectiveStart() == null || !credit.getEffectiveStart().isAfter(today))
                && (credit.getEffectiveEnd() == null || !credit.getEffectiveEnd().isBefore(today));
    }

    public static boolean bypassActive(CrmCustomerCredit credit, LocalDate today) {
        return effective(credit, today) && Integer.valueOf(1).equals(credit.getBypassFlag())
                && (credit.getBypassExpireDate() == null || !credit.getBypassExpireDate().isBefore(today));
    }

    private CrmCustomerCredit find(Long customerId) {
        return creditMapper.selectOne(new LambdaQueryWrapper<CrmCustomerCredit>()
                .eq(CrmCustomerCredit::getCustomerId, customerId).eq(CrmCustomerCredit::getDeleted, 0));
    }

    private CrmApproval pending(Long customerId) {
        List<CrmApproval> rows = approvalMapper.selectList(new LambdaQueryWrapper<CrmApproval>()
                .eq(CrmApproval::getBusinessType, CrmBusinessTypes.CRM_CUSTOMER_CREDIT)
                .eq(CrmApproval::getBusinessRefId, customerId).eq(CrmApproval::getStatus, "PENDING").eq(CrmApproval::getDeleted, 0));
        return rows.isEmpty() ? null : rows.get(0);
    }
}
