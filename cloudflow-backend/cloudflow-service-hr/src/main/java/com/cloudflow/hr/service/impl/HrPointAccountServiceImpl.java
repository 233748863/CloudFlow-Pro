package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.dto.benefit.HrPointTransactionQueryDTO;
import com.cloudflow.hr.domain.entity.HrPointAccount;
import com.cloudflow.hr.domain.entity.HrPointTransaction;
import com.cloudflow.hr.domain.vo.benefit.HrPointAccountVO;
import com.cloudflow.hr.domain.vo.benefit.HrPointTransactionVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrPointAccountMapper;
import com.cloudflow.hr.mapper.HrPointTransactionMapper;
import com.cloudflow.hr.service.IHrPointAccountService;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.cloudflow.common.audit.annotation.Audit;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class HrPointAccountServiceImpl implements IHrPointAccountService {

    private static final long DEFAULT_TENANT_ID = 100000L;

    private final HrPointAccountMapper accountMapper;
    private final HrPointTransactionMapper transactionMapper;
    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public HrPointAccount findOrCreateAccount(Long employeeId) {
        QueryWrapper<HrPointAccount> qw = new QueryWrapper<>();
        qw.eq("tenant_id", currentTenantId()).eq("employee_id", employeeId).eq("deleted", 0);
        HrPointAccount account = accountMapper.selectOne(qw);
        if (account != null) {
            return account;
        }
        account = new HrPointAccount();
        account.setTenantId(currentTenantId());
        account.setEmployeeId(employeeId);
        account.setAvailablePoints(0);
        account.setTotalEarned(0);
        account.setTotalSpent(0);
        account.setFrozenPoints(0);
        account.setLastActiveAt(LocalDateTime.now());
        account.setDeleted(0);
        account.setCreateBy(currentUserName());
        account.setUpdateBy(currentUserName());
        accountMapper.insert(account);
        return account;
    }

    @Override
    public HrPointAccountVO getMyAccount() {
        Long userId = UserContext.getUserId();
        if (userId == null) {
            throw new HrBusinessException("UNAUTHORIZED", "未登录用户");
        }
        return getEmployeeAccount(userId);
    }

    @Override
    public HrPointAccountVO getEmployeeAccount(Long employeeId) {
        QueryWrapper<HrPointAccount> qw = new QueryWrapper<>();
        qw.eq("tenant_id", currentTenantId()).eq("employee_id", employeeId).eq("deleted", 0);
        HrPointAccount account = accountMapper.selectOne(qw);
        if (account == null) {
            account = findOrCreateAccount(employeeId);
        }
        return objectMapper.convertValue(account, HrPointAccountVO.class);
    }

    @Override
    public PageResult<HrPointTransactionVO> listTransactions(Long accountId, HrPointTransactionQueryDTO query) {
        Map<String, Object> q = new LinkedHashMap<>(MapConverters.toServiceQuery(query, objectMapper));
        q.put("accountId", accountId);
        Map<String, Object> raw = crudService.page(HrPointTransaction.class, q);
        return MapConverters.toPageResult(raw, HrPointTransactionVO.class, objectMapper);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long credit(Long accountId, Integer points, String sourceType, Long sourceId, String remark) {
        if (points == null || points <= 0) {
            throw new HrBusinessException("INVALID_POINTS", "积分必须为正数");
        }
        TransactionClaim claim = claimTransaction(accountId, points, "IN", sourceType, sourceId, remark);
        if (claim.existing()) {
            return claim.transactionId();
        }
        int rows = accountMapper.credit(accountId, currentTenantId(), points);
        if (rows == 0) {
            throw new HrBusinessException("ACCOUNT_NOT_FOUND", "积分账户不存在：" + accountId);
        }
        completeTransaction(accountId, claim.transactionId());
        return claim.transactionId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long debit(Long accountId, Integer points, String sourceType, Long sourceId, String remark) {
        if (points == null || points <= 0) {
            throw new HrBusinessException("INVALID_POINTS", "积分必须为正数");
        }
        TransactionClaim claim = claimTransaction(accountId, points, "OUT", sourceType, sourceId, remark);
        if (claim.existing()) {
            return claim.transactionId();
        }
        int rows = accountMapper.debit(accountId, currentTenantId(), points);
        if (rows == 0) {
            throw new HrBusinessException("INSUFFICIENT_POINTS", "积分余额不足或账户不存在");
        }
        completeTransaction(accountId, claim.transactionId());
        return claim.transactionId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long freeze(Long accountId, Integer points, String sourceType, Long sourceId, String remark) {
        if (points == null || points <= 0) {
            throw new HrBusinessException("INVALID_POINTS", "积分必须为正数");
        }
        TransactionClaim claim = claimTransaction(accountId, points, "FROZEN", sourceType, sourceId, remark);
        if (claim.existing()) {
            return claim.transactionId();
        }
        int rows = accountMapper.freeze(accountId, currentTenantId(), points);
        if (rows == 0) {
            throw new HrBusinessException("INSUFFICIENT_POINTS", "积分余额不足无法冻结");
        }
        completeTransaction(accountId, claim.transactionId());
        return claim.transactionId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long unfreeze(Long accountId, Integer points, String sourceType, Long sourceId, String remark) {
        if (points == null || points <= 0) {
            throw new HrBusinessException("INVALID_POINTS", "积分必须为正数");
        }
        TransactionClaim claim = claimTransaction(accountId, points, "UNFROZEN", sourceType, sourceId, remark);
        if (claim.existing()) {
            return claim.transactionId();
        }
        int rows = accountMapper.unfreeze(accountId, currentTenantId(), points);
        if (rows == 0) {
            throw new HrBusinessException("INSUFFICIENT_FROZEN_POINTS", "冻结积分不足无法解冻");
        }
        completeTransaction(accountId, claim.transactionId());
        return claim.transactionId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long manualAdjust(Long employeeId, Integer points, String direction, String remark) {
        HrPointAccount account = findOrCreateAccount(employeeId);
        if ("IN".equalsIgnoreCase(direction)) {
            return credit(account.getId(), points, "MANUAL_ADJUST", null, remark);
        }
        if ("OUT".equalsIgnoreCase(direction)) {
            return debit(account.getId(), points, "MANUAL_ADJUST", null, remark);
        }
        throw new HrBusinessException("INVALID_DIRECTION", "方向必须为 IN 或 OUT");
    }

    private TransactionClaim claimTransaction(Long accountId,
                                              Integer points,
                                              String direction,
                                              String sourceType,
                                              Long sourceId,
                                              String remark) {
        Long existingId = findExistingTransactionId(sourceType, sourceId, direction);
        if (existingId != null) {
            return new TransactionClaim(existingId, true);
        }
        HrPointAccount latest = selectCurrentTenantAccount(accountId);
        if (latest == null) {
            throw new HrBusinessException("ACCOUNT_NOT_FOUND", "积分账户不存在：" + accountId);
        }
        HrPointTransaction txn = new HrPointTransaction();
        txn.setTenantId(currentTenantId());
        txn.setAccountId(accountId);
        txn.setEmployeeId(latest.getEmployeeId());
        txn.setTxnNo("PT-" + System.currentTimeMillis() + "-" + accountId + "-" + System.nanoTime());
        txn.setDirection(direction);
        txn.setSourceType(sourceType);
        txn.setSourceId(sourceId);
        txn.setPoints(points);
        txn.setBalanceAfter(latest.getAvailablePoints());
        txn.setRemark(remark);
        txn.setDeleted(0);
        txn.setCreateBy(currentUserName());
        txn.setUpdateBy(currentUserName());
        try {
            transactionMapper.insert(txn);
            return new TransactionClaim(txn.getId(), false);
        } catch (DuplicateKeyException ex) {
            existingId = findExistingTransactionId(sourceType, sourceId, direction);
            if (existingId != null) {
                return new TransactionClaim(existingId, true);
            }
            throw ex;
        }
    }

    private void completeTransaction(Long accountId, Long transactionId) {
        HrPointAccount latest = selectCurrentTenantAccount(accountId);
        if (latest == null) {
            throw new HrBusinessException("ACCOUNT_NOT_FOUND", "积分账户不存在：" + accountId);
        }
        UpdateWrapper<HrPointTransaction> uw = new UpdateWrapper<>();
        uw.eq("id", transactionId)
                .eq("tenant_id", currentTenantId())
                .set("balance_after", latest.getAvailablePoints())
                .set("update_by", currentUserName())
                .set("update_time", LocalDateTime.now());
        transactionMapper.update(null, uw);
    }

    private Long findExistingTransactionId(String sourceType, Long sourceId, String direction) {
        if (!StringUtils.hasText(sourceType) || sourceId == null || !StringUtils.hasText(direction)) {
            return null;
        }
        QueryWrapper<HrPointTransaction> qw = new QueryWrapper<>();
        qw.eq("tenant_id", currentTenantId())
                .eq("source_type", sourceType)
                .eq("source_id", sourceId)
                .eq("direction", direction)
                .eq("deleted", 0)
                .orderByAsc("id");
        HrPointTransaction existing = firstRecord(transactionMapper.selectPage(new Page<>(1, 1, false), qw));
        return existing == null ? null : existing.getId();
    }

    private <T> T firstRecord(Page<T> page) {
        return page.getRecords().isEmpty() ? null : page.getRecords().get(0);
    }

    private HrPointAccount selectCurrentTenantAccount(Long accountId) {
        QueryWrapper<HrPointAccount> qw = new QueryWrapper<>();
        qw.eq("id", accountId)
                .eq("tenant_id", currentTenantId())
                .eq("deleted", 0);
        return accountMapper.selectOne(qw);
    }

    private record TransactionClaim(Long transactionId, boolean existing) {
    }

    private long currentTenantId() {
        Long tenantId = TenantContext.getTenantId();
        if (tenantId != null) {
            return tenantId;
        }
        tenantId = UserContext.getTenantId();
        return tenantId == null ? DEFAULT_TENANT_ID : tenantId;
    }

    private String currentUserName() {
        return StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system";
    }
}
