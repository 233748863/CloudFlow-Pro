package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.dto.talent.HrTalentPoolDTO;
import com.cloudflow.hr.domain.dto.talent.HrTalentPoolQueryDTO;
import com.cloudflow.hr.domain.entity.HrTalentPool;
import com.cloudflow.hr.domain.entity.HrTalentPoolMember;
import com.cloudflow.hr.domain.vo.talent.HrTalentPoolListVO;
import com.cloudflow.hr.domain.vo.talent.HrTalentPoolMemberVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrTalentPoolMapper;
import com.cloudflow.hr.mapper.HrTalentPoolMemberMapper;
import com.cloudflow.hr.service.HrTalentPoolService;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class HrTalentPoolServiceImpl implements HrTalentPoolService {

    private static final long DEFAULT_TENANT_ID = 100000L;
    private static final String DEFAULT_HIPO_POOL_NO = "HIPO_DEFAULT";

    private final HrTalentPoolMapper poolMapper;
    private final HrTalentPoolMemberMapper memberMapper;
    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createPool(HrTalentPoolDTO dto) {
        HrTalentPool pool = objectMapper.convertValue(dto, HrTalentPool.class);
        pool.setTenantId(currentTenantId());
        pool.setStatus(StringUtils.hasText(pool.getStatus()) ? pool.getStatus() : "ACTIVE");
        pool.setDeleted(0);
        pool.setCreateBy(currentUserName());
        pool.setUpdateBy(currentUserName());
        if (!StringUtils.hasText(pool.getPoolNo())) {
            pool.setPoolNo("POOL-" + System.currentTimeMillis());
        }
        poolMapper.insert(pool);
        return pool.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updatePool(Long poolId, HrTalentPoolDTO dto) {
        crudService.updateProperties(HrTalentPool.class, poolId, MapConverters.toMap(dto, objectMapper));
    }

    @Override
    public PageResult<HrTalentPoolListVO> pagePools(HrTalentPoolQueryDTO query) {
        Map<String, Object> raw = crudService.page(HrTalentPool.class, MapConverters.toServiceQuery(query, objectMapper));
        return MapConverters.toPageResult(raw, HrTalentPoolListVO.class, objectMapper);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public HrTalentPool getOrCreateDefaultHipoPool(Long tenantId) {
        long tid = tenantId == null ? currentTenantId() : tenantId;
        QueryWrapper<HrTalentPool> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tid).eq("pool_no", DEFAULT_HIPO_POOL_NO).eq("deleted", 0);
        HrTalentPool pool = poolMapper.selectOne(qw);
        if (pool != null) {
            return pool;
        }
        pool = new HrTalentPool();
        pool.setTenantId(tid);
        pool.setPoolNo(DEFAULT_HIPO_POOL_NO);
        pool.setPoolName("默认高潜人才池");
        pool.setPoolType("HIPO");
        pool.setDescription("盘点发布回调自动入池：grid_cell ∈ {1,4}");
        pool.setStatus("ACTIVE");
        pool.setDeleted(0);
        pool.setCreateBy(currentUserName());
        pool.setUpdateBy(currentUserName());
        poolMapper.insert(pool);
        return pool;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void joinPool(Long poolId, Long employeeId, Long sourceReviewId) {
        long tid = currentTenantId();
        QueryWrapper<HrTalentPoolMember> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tid).eq("pool_id", poolId).eq("employee_id", employeeId).eq("deleted", 0);
        HrTalentPoolMember existing = memberMapper.selectOne(qw);
        if (existing != null) {
            if ("IN".equals(existing.getStatus())) {
                return;
            }
            UpdateWrapper<HrTalentPoolMember> uw = new UpdateWrapper<>();
            uw.eq("id", existing.getId()).eq("tenant_id", tid)
                    .set("status", "IN")
                    .set("joined_at", LocalDateTime.now())
                    .set("joined_review_id", sourceReviewId)
                    .set("exit_at", null)
                    .set("exit_reason", null)
                    .set("update_by", currentUserName())
                    .set("update_time", LocalDateTime.now());
            memberMapper.update(null, uw);
            return;
        }
        HrTalentPoolMember m = new HrTalentPoolMember();
        m.setTenantId(tid);
        m.setPoolId(poolId);
        m.setEmployeeId(employeeId);
        m.setJoinedAt(LocalDateTime.now());
        m.setJoinedReviewId(sourceReviewId);
        m.setStatus("IN");
        m.setDeleted(0);
        m.setCreateBy(currentUserName());
        m.setUpdateBy(currentUserName());
        memberMapper.insert(m);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void exitPool(Long poolId, Long employeeId, String reason) {
        UpdateWrapper<HrTalentPoolMember> uw = new UpdateWrapper<>();
        uw.eq("pool_id", poolId).eq("employee_id", employeeId)
                .eq("tenant_id", currentTenantId()).eq("deleted", 0)
                .set("status", "OUT")
                .set("exit_at", LocalDateTime.now())
                .set("exit_reason", StringUtils.hasText(reason) ? reason : "MANUAL")
                .set("update_by", currentUserName())
                .set("update_time", LocalDateTime.now());
        int rows = memberMapper.update(null, uw);
        if (rows == 0) {
            throw new HrBusinessException("MEMBER_NOT_FOUND",
                    "人才池成员不存在：poolId=" + poolId + ", employeeId=" + employeeId);
        }
    }

    @Override
    public List<HrTalentPoolMemberVO> listMembers(Long poolId) {
        Map<String, Object> q = new LinkedHashMap<>();
        q.put("poolId", poolId);
        q.put("status", "IN");
        return MapConverters.toVOList(crudService.list(HrTalentPoolMember.class, q),
                HrTalentPoolMemberVO.class, objectMapper);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void joinDefaultHipoPool(Long tenantId, Long employeeId, Long sourceReviewId) {
        HrTalentPool pool = getOrCreateDefaultHipoPool(tenantId);
        joinPool(pool.getId(), employeeId, sourceReviewId);
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
