package com.cloudflow.crm.service.remote;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.domain.PageResult;
import lombok.Data;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;

import java.math.BigDecimal;
import java.time.LocalDate;

@FeignClient(
        name = "cloudflow-service-oa",
        fallbackFactory = RemoteOaFallbackFactory.class
)
public interface RemoteOaService {

    @PostMapping("/contract")
    R<Long> createContract(@RequestHeader("X-Inner-Call") String innerCall,
                           @RequestHeader("X-From-Service") String fromService,
                           @RequestBody ContractDraftRequest request);

    @PostMapping("/project")
    R<Long> createProject(@RequestHeader("X-Inner-Call") String innerCall,
                          @RequestHeader("X-From-Service") String fromService,
                          @RequestBody ProjectDraftRequest request);

    @GetMapping("/contract/{id}")
    R<ContractInfo> getContract(@PathVariable("id") Long id);

    @GetMapping("/invoice/list")
    R<PageResult<InvoiceInfo>> listInvoices(@RequestParam("pageNum") int pageNum,
                                            @RequestParam("pageSize") int pageSize,
                                            @RequestParam(value = "invoiceDirection", required = false) String invoiceDirection,
                                            @RequestParam(value = "status", required = false) String status,
                                            @RequestParam(value = "receivableId", required = false) Long receivableId,
                                            @RequestParam(value = "customerId", required = false) Long customerId);

    @GetMapping("/project/list")
    R<PageResult<ProjectInfo>> listProjects(@RequestParam("pageNum") int pageNum,
                                            @RequestParam("pageSize") int pageSize,
                                            @RequestParam(value = "customerId", required = false) Long customerId,
                                            @RequestParam(value = "status", required = false) String status);

    @GetMapping("/budget/plan/list")
    R<PageResult<BudgetInfo>> listBudgets(@RequestParam("pageNum") int pageNum,
                                          @RequestParam("pageSize") int pageSize,
                                          @RequestParam(value = "projectId", required = false) Long projectId,
                                          @RequestParam(value = "status", required = false) String status);

    @PutMapping("/invoice/bind/{id}")
    R<Void> bindInvoice(@PathVariable("id") Long invoiceId,
                        @RequestBody InvoiceBindRequest request);

    @Data
    class ContractDraftRequest {
        private String contractName;
        private String counterpartyName;
        private String contractType;
        private BigDecimal amount;
        private String currency;
        private Long ownerId;
        private String ownerName;
        private Long deptId;
        private String deptName;
        private Long customerId;
        private String customerName;
        private String remark;
    }

    @Data
    class ProjectDraftRequest {
        private String projectName;
        private String projectType;
        private Long customerId;
        private String customerName;
        private Long contractId;
        private String contractNo;
        private Long ownerId;
        private String ownerName;
        private Long deptId;
        private String deptName;
        private LocalDate startDate;
        private LocalDate endDate;
        private BigDecimal budgetAmount;
        private String priority;
        private String status;
        private String riskLevel;
        private String sourceType;
        private Long sourceId;
        private String sourceName;
        private String remark;
    }

    @Data
    class ContractInfo {
        private Long contractId;
        private String contractNo;
        private String contractName;
        private Long customerId;
        private String customerName;
        private String counterpartyName;
    }

    @Data
    class InvoiceInfo {
        private Long invoiceId;
        private String invoiceDirection;
        private String invoiceCode;
        private String invoiceNo;
        private BigDecimal grossAmount;
        private String buyerName;
        private String sellerName;
        private Long customerId;
        private String customerName;
        private Long receivableId;
        private String status;
    }

    @Data
    class InvoiceBindRequest {
        private Long receivableId;
        private Long customerId;
        private String customerName;
        private Long contractId;
        private String contractNo;
    }

    @Data
    class ProjectInfo {
        private Long projectId;
        private String projectNo;
        private String projectName;
        private String status;
        private String riskLevel;
        private BigDecimal budgetAmount;
        private BigDecimal actualCostAmount;
        private String sourceType;
        private Long sourceId;
        private String sourceName;
    }

    @Data
    class BudgetInfo {
        private Long budgetId;
        private String budgetNo;
        private String budgetName;
        private Long projectId;
        private String projectName;
        private BigDecimal totalAmount;
        private BigDecimal reservedAmount;
        private BigDecimal actualAmount;
        private BigDecimal availableAmount;
        private String status;
    }

}
