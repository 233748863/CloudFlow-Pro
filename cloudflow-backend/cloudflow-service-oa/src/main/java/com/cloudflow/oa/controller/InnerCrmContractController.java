package com.cloudflow.oa.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.oa.domain.OaContract;
import com.cloudflow.oa.mapper.OaContractMapper;
import com.cloudflow.oa.service.IOaContractService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.web.bind.annotation.*;
import java.math.BigDecimal;
import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/inner/oa/crm-contracts")
public class InnerCrmContractController {
    private final OaContractMapper mapper;
    private final IOaContractService contracts;
    public record Origin(Long contractId, Long customerId, String sourceType, Long sourceId, String currency, String status) { }

    @PostMapping("/draft")
    @RepeatSubmit
    @SysLog("CRM生成合同草稿")
    @Inner(allowedServices = "cloudflow-service-crm")
    public R<Long> createDraft(@Valid @RequestBody Draft request) {
        if (UserContext.getUserId() == null) return R.fail(403, "生成CRM合同草稿需要用户身份");
        OaContract contract = new OaContract();
        BeanUtils.copyProperties(request, contract);
        try {
            return R.ok(contracts.createContract(contract));
        } catch (IllegalArgumentException exception) {
            return R.fail(exception.getMessage());
        }
    }

    @GetMapping("/{id}")
    @Inner(allowedServices = "cloudflow-service-crm")
    public R<Summary> detail(@PathVariable Long id) {
        if (UserContext.getUserId() == null) return R.fail(403, "读取CRM合同需要用户身份");
        OaContract query = new OaContract();
        query.setContractId(id);
        PageQuery page = new PageQuery();
        page.setPageSize(1);
        List<OaContract> records = contracts.queryPage(query, page).getRows();
        return records.isEmpty() ? R.fail("合同不存在或无权访问") : R.ok(summary(records.get(0)));
    }

    @GetMapping("/list")
    @Inner(allowedServices = "cloudflow-service-crm")
    public R<PageResult<Summary>> list(@RequestParam Long customerId,
            @RequestParam(required = false) String status, PageQuery page) {
        if (UserContext.getUserId() == null) return R.fail(403, "读取CRM合同需要用户身份");
        OaContract query = new OaContract();
        query.setCustomerId(customerId);
        query.setStatus(status);
        PageResult<OaContract> records = contracts.queryPage(query, page);
        return R.ok(new PageResult<>(records.getRows().stream().map(this::summary).toList(),
                records.getTotal(), records.getPageNum(), records.getPageSize()));
    }

    private Summary summary(OaContract contract) {
        return new Summary(contract.getContractId(), contract.getContractNo(), contract.getContractName(),
                contract.getCustomerId(), contract.getCustomerName(), contract.getCounterpartyName(),
                contract.getStatus(), contract.getRiskLevel(), contract.getAmount(), contract.getInvoiceStatus(),
                contract.getProjectId(), contract.getProjectName());
    }

    public record Summary(Long contractId, String contractNo, String contractName, Long customerId, String customerName,
            String counterpartyName, String status, String riskLevel, BigDecimal amount, String invoiceStatus,
            Long projectId, String projectName) { }

    @Data
    public static class Draft {
        @NotBlank
        private String contractName;
        @NotBlank
        private String counterpartyName;
        @NotBlank
        private String contractType;
        @NotNull
        private BigDecimal amount;
        private String currency;
        private Long ownerId;
        private String ownerName;
        private Long deptId;
        private String deptName;
        @NotNull
        @Positive
        private Long customerId;
        private String customerName;
        private String remark;
        @NotBlank
        @Pattern(regexp = "CRM_CUSTOMER|CRM_QUOTE|CRM_OPPORTUNITY")
        private String sourceType;
        @NotNull
        @Positive
        private Long sourceId;
        private Integer sourceVersion;
        private Integer opportunityVersion;
    }

    @PostMapping("/origins")
    @RepeatSubmit.Disabled
    @Inner(allowedServices = "cloudflow-service-crm")
    public R<List<Origin>> origins(@RequestBody List<Long> contractIds) {
        Long tenantId = TenantContext.getTenantId() == null ? UserContext.getTenantId() : TenantContext.getTenantId();
        if (tenantId == null || contractIds == null || contractIds.isEmpty() || contractIds.size() > 500) throw new IllegalArgumentException("租户不能为空且每次查询1至500份合同");
        return R.ok(mapper.selectList(new LambdaQueryWrapper<OaContract>().eq(OaContract::getTenantId, tenantId)
                .eq(OaContract::getDeleted, 0).in(OaContract::getContractId, contractIds)).stream()
                .map(contract -> new Origin(contract.getContractId(), contract.getCustomerId(), contract.getSourceType(), contract.getSourceId(), contract.getCurrency(), contract.getStatus())).toList());
    }
}
