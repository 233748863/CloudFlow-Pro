package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmFollowUp;
import com.cloudflow.crm.domain.vo.HrEmployeeSummaryVO;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.mapper.CrmFollowUpMapper;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.mapper.CrmRenewalMapper;
import com.cloudflow.crm.mapper.CrmServiceTicketMapper;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.cloudflow.crm.service.remote.RemoteHrService;
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
import java.util.List;
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
    private final CrmRenewalMapper renewalMapper;
    private final CrmReceivableMapper receivableMapper;
    private final CrmServiceTicketMapper serviceTicketMapper;
    private final RemoteHrService remoteHrService;

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
            refreshHealth(customer.getCustomerId());
        }
        return saved;
    }

    @Override
    public boolean updateCustomer(CrmCustomer customer) {
        if (customer == null || customer.getCustomerId() == null) {
            throw new IllegalArgumentException("客户ID不能为空");
        }
        validate(customer);
        enrichOwnerFromHr(customer);
        CrmCustomer persisted = requireById(customer.getCustomerId(), "客户不存在");
        customer.setTenantId(persisted.getTenantId());
        customer.setUpdateBy(currentUserName());
        customer.setUpdateTime(now());
        boolean updated = updateById(customer);
        if (updated) {
            refreshHealth(customer.getCustomerId());
        }
        return updated;
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
        if (customer == null || !CrmConstants.DelFlag.NORMAL.equals(customer.getDelFlag())) {
            return;
        }

        LocalDate today = LocalDate.now();
        LocalDateTime currentTime = now();

        List<CrmFollowUp> followUps = followUpMapper.selectList(new LambdaQueryWrapper<CrmFollowUp>()
                .eq(CrmFollowUp::getCustomerId, customerId)
                .eq(CrmFollowUp::getDelFlag, CrmConstants.DelFlag.NORMAL));

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
}
