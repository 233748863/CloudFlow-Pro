package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.crm.config.CrmEventStreamConstants;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmFollowUp;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmQuote;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.vo.HrEmployeeSummaryVO;
import com.cloudflow.crm.service.CrmEventPublisher;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.mapper.CrmFollowUpMapper;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.mapper.CrmQuoteMapper;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.mapper.CrmRenewalMapper;
import com.cloudflow.crm.mapper.CrmServiceTicketMapper;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.cloudflow.crm.service.remote.RemoteHrService;
import com.cloudflow.common.audit.annotation.Audit;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 客户域服务。仅负责 CrmCustomer 的 CRUD 与健康度刷新。
 *
 * <p>原来这里揉了工作台聚合、Dashboard、跨模块草稿等整整 1080 行；
 * 已拆分到 {@link CrmCustomerWorkspaceServiceImpl}（读聚合）
 * 与 {@link CrmCrossModuleDraftServiceImpl}（调 OA 的集成层）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CrmCustomerServiceImpl extends CrmServiceSupport<CrmCustomerMapper, CrmCustomer>
        implements ICrmCustomerService {

    private final CrmFollowUpMapper followUpMapper;
    private final CrmOpportunityMapper opportunityMapper;
    private final CrmQuoteMapper quoteMapper;
    private final CrmRenewalMapper renewalMapper;
    private final CrmReceivableMapper receivableMapper;
    private final CrmServiceTicketMapper serviceTicketMapper;
    private final RemoteHrService remoteHrService;
    private final CrmEventPublisher crmEventPublisher;

    @Override
    public PageResult<CrmCustomer> queryPage(CrmCustomer query, PageQuery pageQuery) {
        Page<CrmCustomer> page = baseMapper.selectPageByDataScope(
                pageQuery.build(),
                query,
                DataScopeUtils.listScope("dept_id", "owner_id"));
        return PageResult.build(page);
    }

    @Override
    public CrmCustomer getAccessibleCustomer(Long customerId) {
        if (customerId == null) {
            throw new IllegalArgumentException("客户ID不能为空");
        }
        CrmCustomer customer = baseMapper.selectByIdWithDataScope(
                customerId,
                DataScopeUtils.listScope("dept_id", "owner_id"));
        if (customer == null) {
            throw new IllegalArgumentException("客户不存在");
        }
        return customer;
    }

    @Override
    public boolean createCustomer(CrmCustomer customer) {
        validate(customer);
        enrichOwnerFromHr(customer);
        Localize.fillCustomerDefaults(customer, currentTenantId(), currentUserName(), now());
        boolean saved = save(customer);
        if (saved) {
            publishCustomerCreated(customer);
            refreshHealth(customer.getCustomerId());
        }
        return saved;
    }

    @Override
    @Audit(name = "更新客户")
    public boolean updateCustomer(CrmCustomer customer) {
        if (customer == null || customer.getCustomerId() == null) {
            throw new IllegalArgumentException("客户ID不能为空");
        }
        validate(customer);
        CrmCustomer persisted = requireById(customer.getCustomerId(), "客户不存在");
        // M1-4: 所有权校验
        DataScopeUtils.assertOwnership(persisted, CrmCustomer::getOwnerId, "客户");
        if (customer.getPoolFlag() != null && !Objects.equals(customer.getPoolFlag(), persisted.getPoolFlag())) {
            throw new IllegalArgumentException("客户公海状态变更请走客户领取/公海释放流程");
        }
        if (StringUtils.hasText(customer.getStatus())
                && !Objects.equals(customer.getStatus(), persisted.getStatus())
                && ("POOL".equalsIgnoreCase(customer.getStatus()) || "POOL".equalsIgnoreCase(persisted.getStatus()))) {
            throw new IllegalArgumentException("客户公海状态变更请走客户领取/公海释放流程");
        }
        if (customer.getOwnerId() != null && !Objects.equals(customer.getOwnerId(), persisted.getOwnerId())) {
            throw new IllegalArgumentException("客户归属变更请走客户领取/公海指派流程");
        }
        if (StringUtils.hasText(customer.getLevelCode())
                && !Objects.equals(customer.getLevelCode(), persisted.getLevelCode())) {
            throw new IllegalArgumentException("客户分级变更请走审批流程");
        }
        customer.setTenantId(persisted.getTenantId());
        customer.setOwnerId(persisted.getOwnerId());
        customer.setOwnerName(persisted.getOwnerName());
        customer.setDeptId(customer.getDeptId() == null ? persisted.getDeptId() : customer.getDeptId());
        customer.setDeptName(StringUtils.hasText(customer.getDeptName()) ? customer.getDeptName() : persisted.getDeptName());
        customer.setPoolFlag(persisted.getPoolFlag());
        customer.setPooledTime(persisted.getPooledTime());
        customer.setOriginalOwnerId(persisted.getOriginalOwnerId());
        customer.setOriginalOwnerName(persisted.getOriginalOwnerName());
        if (!StringUtils.hasText(customer.getLevelCode())) {
            customer.setLevelCode(persisted.getLevelCode());
        }
        if (!StringUtils.hasText(customer.getStatus())) {
            customer.setStatus(persisted.getStatus());
        }
        customer.setUpdateBy(currentUserName());
        customer.setUpdateTime(now());
        boolean updated = updateById(customer);
        if (updated) {
            refreshHealth(customer.getCustomerId());
        }
        return updated;
    }

    @Override
    @Audit(name = "删除客户", highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public boolean deleteCustomers(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return false;
        }
        Long tenantId = currentTenantId();
        for (Long id : ids) {
            CrmCustomer customer = getAccessibleCustomer(id);
            assertCustomerDeletable(customer);
            boolean updated = update(new LambdaUpdateWrapper<CrmCustomer>()
                    .eq(CrmCustomer::getCustomerId, id)
                    .eq(CrmCustomer::getTenantId, tenantId)
                    .eq(CrmCustomer::getDeleted, CrmConstants.DelFlag.NORMAL)
                    .set(CrmCustomer::getDeleted, CrmConstants.DelFlag.DELETED)
                    .set(CrmCustomer::getUpdateBy, currentUserName())
                    .set(CrmCustomer::getUpdateTime, now()));
            if (!updated) {
                throw new IllegalStateException("客户删除失败: " + id);
            }
        }
        return true;
    }

    /**
     * 若传入了 ownerId（按约定是 sys_user.user_id），尝试从 HR 补齐员工名称与部门快照，
     * 并拒绝已离职的员工担任客户归属。HR 服务不可用时仅打印日志，避免阻塞业务。
     */
    private void enrichOwnerFromHr(CrmCustomer customer) {
        if (customer == null || customer.getOwnerId() == null) {
            return;
        }
        try {
            R<HrEmployeeSummaryVO> response = remoteHrService.getEmployeeByUserId(customer.getOwnerId());
            if (response == null || !response.isSuccess() || response.getData() == null) {
                return;
            }
            HrEmployeeSummaryVO employee = response.getData();
            if (!employee.isActive()) {
                throw new IllegalArgumentException("客户归属员工已离职，请选择其它员工");
            }
            if (!StringUtils.hasText(customer.getOwnerName())) {
                customer.setOwnerName(employee.getEmployeeName());
            }
            if (customer.getDeptId() == null && employee.getDeptId() != null) {
                customer.setDeptId(employee.getDeptId());
                customer.setDeptName(employee.getDeptName());
            }
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            log.warn("enrichOwnerFromHr failed, ownerId={}, error={}", customer.getOwnerId(), ex.getMessage());
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void refreshHealth(Long customerId) {
        if (customerId == null) {
            return;
        }
        CrmCustomer customer = getById(customerId);
        if (customer == null || !CrmConstants.DelFlag.NORMAL.equals(customer.getDeleted())) {
            return;
        }

        LocalDate today = LocalDate.now();
        LocalDateTime currentTime = now();

        List<CrmFollowUp> followUps = followUpMapper.selectList(new LambdaQueryWrapper<CrmFollowUp>()
                .eq(CrmFollowUp::getCustomerId, customerId)
                .eq(CrmFollowUp::getDeleted, CrmConstants.DelFlag.NORMAL));

        LocalDateTime lastFollowUpTime = followUps.stream()
                .map(CrmFollowUp::getFollowUpTime)
                .filter(Objects::nonNull)
                .max(Comparator.naturalOrder())
                .orElse(null);
        LocalDateTime nextFollowUpTime = followUps.stream()
                .map(CrmFollowUp::getNextFollowUpTime)
                .filter(Objects::nonNull)
                .filter(value -> !value.isBefore(currentTime))
                .min(Comparator.naturalOrder())
                .orElse(null);

        LocalDate renewalWindowDate = CrmHealthCalculator.resolveRenewalWindowDate(renewalMapper, customerId);
        int overdueDays = CrmHealthCalculator.resolveMaxOverdueDays(receivableMapper, customerId, today);
        boolean hasHighSeverityOpenTicket = CrmHealthCalculator.hasHighSeverityOpenTicket(serviceTicketMapper, customerId);
        boolean hasOverdueOpenTicket = CrmHealthCalculator.hasOverdueOpenTicket(serviceTicketMapper, customerId, currentTime);

        List<String> redReasons = new ArrayList<>();
        List<String> yellowReasons = new ArrayList<>();

        if (renewalWindowDate != null) {
            long daysToRenewal = ChronoUnit.DAYS.between(today, renewalWindowDate);
            if (daysToRenewal <= 30) {
                redReasons.add("30天内续约到期");
            } else if (daysToRenewal <= 90) {
                yellowReasons.add("90天内续约到期");
            }
        }

        if (overdueDays > 30) {
            redReasons.add("回款逾期超过30天");
        } else if (overdueDays > 0) {
            yellowReasons.add("回款逾期未超过30天");
        }

        if (hasHighSeverityOpenTicket) {
            redReasons.add("存在高严重度未关闭工单");
        }
        if (hasOverdueOpenTicket) {
            redReasons.add("存在SLA已超时未关闭工单");
        }

        if (lastFollowUpTime == null
                || ChronoUnit.DAYS.between(lastFollowUpTime.toLocalDate(), today) >= 30) {
            yellowReasons.add("30天未跟进");
        }

        String healthLevel;
        String healthReason;
        if (!redReasons.isEmpty()) {
            healthLevel = CrmConstants.HealthLevel.RED;
            healthReason = String.join("；", redReasons);
        } else if (!yellowReasons.isEmpty()) {
            healthLevel = CrmConstants.HealthLevel.YELLOW;
            healthReason = String.join("；", yellowReasons);
        } else {
            healthLevel = CrmConstants.HealthLevel.GREEN;
            healthReason = "状态正常";
        }

        LambdaUpdateWrapper<CrmCustomer> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(CrmCustomer::getCustomerId, customerId)
                .set(CrmCustomer::getHealthLevel, healthLevel)
                .set(CrmCustomer::getHealthReason, healthReason)
                .set(CrmCustomer::getLastFollowUpTime, lastFollowUpTime)
                .set(CrmCustomer::getNextFollowUpTime, nextFollowUpTime)
                .set(CrmCustomer::getUpdateBy, currentUserName())
                .set(CrmCustomer::getUpdateTime, currentTime);
        update(null, wrapper);
    }

    private void validate(CrmCustomer customer) {
        if (customer == null) {
            throw new IllegalArgumentException("客户不能为空");
        }
        if (!StringUtils.hasText(customer.getCustomerName())) {
            throw new IllegalArgumentException("客户名称不能为空");
        }
        if (!StringUtils.hasText(customer.getCustomerCode())) {
            customer.setCustomerCode(Localize.nextNo(CrmConstants.NoPrefix.CUSTOMER));
        }
        customer.setCustomerTags(normalizeTags(customer.getCustomerTags()));
        if (!StringUtils.hasText(customer.getHealthLevel())) {
            customer.setHealthLevel(CrmConstants.HealthLevel.GREEN);
        }
        if (!StringUtils.hasText(customer.getStatus())) {
            customer.setStatus(CrmConstants.CustomerStatus.ACTIVE);
        }
    }

    private String normalizeTags(String customerTags) {
        if (!StringUtils.hasText(customerTags)) {
            return null;
        }
        return java.util.Arrays.stream(customerTags.split("[,，]"))
                .map(String::trim)
                .filter(StringUtils::hasText)
                .distinct()
                .reduce((left, right) -> left + "," + right)
                .orElse(null);
    }

    private void assertCustomerDeletable(CrmCustomer customer) {
        if (customer == null || customer.getCustomerId() == null) {
            throw new IllegalArgumentException("客户不存在");
        }
        Long customerId = customer.getCustomerId();
        Long wonOpportunities = opportunityMapper.selectCount(new LambdaQueryWrapper<CrmOpportunity>()
                .eq(CrmOpportunity::getCustomerId, customerId)
                .eq(CrmOpportunity::getDeleted, CrmConstants.DelFlag.NORMAL)
                .eq(CrmOpportunity::getStage, CrmConstants.OpportunityStage.WON));
        if (wonOpportunities != null && wonOpportunities > 0) {
            throw new IllegalArgumentException("客户存在赢单商机，禁止删除");
        }
        Long activeOpportunities = opportunityMapper.selectCount(new LambdaQueryWrapper<CrmOpportunity>()
                .eq(CrmOpportunity::getCustomerId, customerId)
                .eq(CrmOpportunity::getDeleted, CrmConstants.DelFlag.NORMAL)
                .notIn(CrmOpportunity::getStage,
                        CrmConstants.OpportunityStage.WON,
                        CrmConstants.OpportunityStage.LOST));
        if (activeOpportunities != null && activeOpportunities > 0) {
            throw new IllegalArgumentException("客户存在有效商机，禁止删除");
        }
        Long quotes = quoteMapper.selectCount(new LambdaQueryWrapper<CrmQuote>()
                .eq(CrmQuote::getCustomerId, customerId)
                .eq(CrmQuote::getDeleted, CrmConstants.DelFlag.NORMAL));
        if (quotes != null && quotes > 0) {
            throw new IllegalArgumentException("客户存在报价记录，禁止删除");
        }
        Long unpaidReceivables = receivableMapper.selectCount(new LambdaQueryWrapper<CrmReceivable>()
                .eq(CrmReceivable::getCustomerId, customerId)
                .eq(CrmReceivable::getDeleted, CrmConstants.DelFlag.NORMAL)
                .ne(CrmReceivable::getStatus, CrmConstants.ReceivableStatus.RECEIVED));
        if (unpaidReceivables != null && unpaidReceivables > 0) {
            throw new IllegalArgumentException("客户存在未结清回款，禁止删除");
        }
    }

    private void publishCustomerCreated(CrmCustomer customer) {
        if (customer == null || customer.getCustomerId() == null) {
            return;
        }
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("customerId", customer.getCustomerId());
        fields.put("customerCode", customer.getCustomerCode());
        fields.put("customerName", customer.getCustomerName());
        fields.put("ownerId", customer.getOwnerId());
        fields.put("ownerName", customer.getOwnerName());
        fields.put("deptId", customer.getDeptId());
        fields.put("deptName", customer.getDeptName());
        fields.put("levelCode", customer.getLevelCode());
        fields.put("source", customer.getSource());
        crmEventPublisher.publish(CrmEventStreamConstants.EVENT_CUSTOMER_CREATED,
                customer.getTenantId(), fields);
    }
}
