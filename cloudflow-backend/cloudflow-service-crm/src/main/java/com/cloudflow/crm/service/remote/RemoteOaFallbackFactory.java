package com.cloudflow.crm.service.remote;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.domain.PageResult;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.openfeign.FallbackFactory;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class RemoteOaFallbackFactory implements FallbackFactory<RemoteOaService> {

    @Override
    public RemoteOaService create(Throwable cause) {
        log.error("CRM 调用 OA 服务失败: {}", cause.getMessage());
        return new RemoteOaService() {
            @Override
            public R<Long> createContract(String innerCall, String fromService, ContractDraftRequest request) {
                log.error("CRM 生成合同草稿失败: {}", request != null ? request.getContractName() : null);
                return R.fail("OA 服务暂时不可用，无法生成合同草稿");
            }

            @Override
            public R<Long> createProject(String innerCall, String fromService, ProjectDraftRequest request) {
                log.error("CRM 生成项目草稿失败: {}", request != null ? request.getProjectName() : null);
                return R.fail("OA 服务暂时不可用，无法生成项目草稿");
            }

            @Override
            public R<Void> createBudget(String innerCall, String fromService, BudgetDraftRequest request) {
                log.error("CRM 生成预算草稿失败: {}", request != null ? request.getBudgetName() : null);
                return R.fail("OA 服务暂时不可用，无法生成预算草稿");
            }

            @Override
            public R<Void> createInvoice(String innerCall, String fromService, InvoiceDraftRequest request) {
                log.error("CRM 生成发票草稿失败: {}", request != null ? request.getInvoiceNo() : null);
                return R.fail("OA 服务暂时不可用，无法生成发票草稿");
            }

            @Override
            public R<RemoteOaService.ContractInfo> getContract(Long id) {
                log.error("CRM 查询OA合同失败: {}", id);
                return R.fail("OA 服务暂时不可用，无法查询合同");
            }

            @Override
            public R<PageResult<RemoteOaService.ContractInfo>> listContracts(int pageNum, int pageSize, Long customerId, String status) {
                log.error("CRM 查询OA合同列表失败");
                return R.fail("OA 服务暂时不可用，无法查询合同");
            }

            @Override
            public R<PageResult<RemoteOaService.InvoiceInfo>> listInvoices(int pageNum, int pageSize, String invoiceDirection, String status, Long receivableId, Long customerId) {
                log.error("CRM 查询OA发票列表失败");
                return R.fail("OA 服务暂时不可用，无法查询发票");
            }

            @Override
            public R<PageResult<RemoteOaService.ProjectInfo>> listProjects(int pageNum, int pageSize, Long customerId, String status) {
                log.error("CRM 查询OA项目列表失败");
                return R.fail("OA 服务暂时不可用，无法查询项目");
            }

            @Override
            public R<PageResult<RemoteOaService.BudgetInfo>> listBudgets(int pageNum, int pageSize, Long projectId, String status) {
                log.error("CRM 查询OA预算列表失败");
                return R.fail("OA 服务暂时不可用，无法查询预算");
            }

            @Override
            public R<Void> bindInvoice(Long invoiceId, RemoteOaService.InvoiceBindRequest request) {
                log.error("CRM 绑定OA发票失败: {}", invoiceId);
                return R.fail("OA 服务暂时不可用，无法绑定发票");
            }

            @Override
            public R<Void> voidInvoice(Long invoiceId, RemoteOaService.InvoiceVoidRequest request) {
                log.error("CRM 作废OA发票失败: {}", invoiceId);
                return R.fail("OA 服务暂时不可用，无法作废发票");
            }
        };
    }
}
