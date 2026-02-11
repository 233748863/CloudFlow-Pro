package cn.joywon.poco.merchant.CouponModule.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.lang.Assert;
import cn.hutool.core.util.ObjUtil;
import cn.joywon.poco.common.core.exception.CheckedException;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.data.datascope.DataScope;
import cn.joywon.poco.common.data.datascope.DataScopeFuncEnum;
import cn.joywon.poco.common.security.service.PocoUser;
import cn.joywon.poco.common.security.util.SecurityUtils;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.CouponModule.dto.JointMarketingApplyJoinPlanDTO;
import cn.joywon.poco.merchant.CouponModule.dto.JointMarketingPlanCreateDTO;
import cn.joywon.poco.merchant.CouponModule.dto.JointMarketingPlanPageDTO;
import cn.joywon.poco.merchant.CouponModule.dto.JointMarketingPlanUpdateDTO;
import cn.joywon.poco.merchant.CouponModule.entity.JointMarketingPlan;
import cn.joywon.poco.merchant.CouponModule.entity.JointMarketingRebateRecord;
import cn.joywon.poco.merchant.CouponModule.mapper.JointMarketingPlanMapper;
import cn.joywon.poco.merchant.CouponModule.mapper.JointMarketingRebateRecordMapper;
import cn.joywon.poco.merchant.CouponModule.service.IJointMarketingAllocationService;
import cn.joywon.poco.merchant.CouponModule.service.IJointMarketingPlanService;
import cn.joywon.poco.merchant.CouponModule.vo.JointMarketingPlanVO;
import cn.joywon.poco.merchant.CouponModule.vo.JointMarketingStatisticsVO;
import cn.joywon.poco.merchant.MerchantModule.bo.MerchantSimpleInfoBO;
import cn.joywon.poco.merchant.MerchantModule.service.IMerchantService;
import cn.joywon.poco.merchant.PlatformModule.dto.JointMarketingPendingDTO;
import cn.joywon.poco.merchant.PlatformModule.dto.JointMarketingPlanAuditDTO;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.context.config.annotation.RefreshScope;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RefreshScope
@RequiredArgsConstructor
public class JointMarketingPlanServiceImpl extends
        ServiceImpl<JointMarketingPlanMapper, JointMarketingPlan> implements IJointMarketingPlanService {

    private final IMerchantService merchantService;
    private final IJointMarketingAllocationService allocationService;
    private final JointMarketingRebateRecordMapper rebateRecordMapper;

    @Override
    public R<Long> createPlan(JointMarketingPlanCreateDTO dto) {
        validatePlanTime(dto.getStartTime(), dto.getEndTime());

        JointMarketingPlan plan = new JointMarketingPlan();
        plan.setName(dto.getName());
        plan.setDescription(dto.getDescription());
        plan.setStartTime(dto.getStartTime());
        plan.setEndTime(dto.getEndTime());
        plan.setInitiatorMerchantId(SecurityUtils.getUser().getDeptId());
        plan.setStatus("DRAFT"); // 默认草稿状态

        save(plan);
        return R.ok(plan.getId());
    }

    @Override
    public R<Boolean> updatePlan(JointMarketingPlanUpdateDTO dto) {
        JointMarketingPlan plan = getById(dto.getId());
        if (ObjUtil.isNull(plan)) {
            return R.failed("计划不存在");
        }
        if (!"DRAFT".equals(plan.getStatus())) {
            return R.failed("联合营销计划当前状态已无法进行修改");
        }

        plan.setName(dto.getName());
        plan.setDescription(dto.getDescription());
        plan.setStartTime(dto.getStartTime());
        plan.setEndTime(dto.getEndTime());
        plan.setAuditStatus("PENDING");
        plan.setAuditReason("");

        updateById(plan);
        return R.ok(true);
    }

    @Override
    public R<?> auditPlan(JointMarketingPlanAuditDTO dto) {
        JointMarketingPlan plan = getById(dto.getPlanId());
        Assert.notNull(plan, () -> new CheckedException("审核失败, 联合营销计划不存在"));
        Assert.isTrue("PENDING".equals(plan.getAuditStatus()), () -> new CheckedException("审核失败, 联合营销计划已被审核"));
        Assert.isTrue("DRAFT".equals(plan.getStatus()), () -> new CheckedException("审核失败, 联合营销计划当前状态不可审核"));

        if (dto.getApprove()) {
            plan.setAuditStatus("APPROVED");
        } else  {
            plan.setAuditStatus("REJECTED");
        }
        plan.setAuditReason(dto.getReason());
        boolean result = updateById(plan);
        Assert.isTrue(result, () -> new RuntimeException("审核失败, 请重试"));

        return R.ok();
    }

    @Override
    public R<PageQueryVO<JointMarketingPlanVO>> getPendingList(JointMarketingPendingDTO dto) {
        IPage<JointMarketingPlanVO> pageData = baseMapper.getPendingList(dto.page(), dto);
        return R.ok(PageQueryVO.of(pageData));
    }

    @Override
    public R<PageQueryVO<JointMarketingPlanVO>> pagePlan(JointMarketingPlanPageDTO dto) {
        validPlanQueryTime(dto);

        // 创建 DataScope
        DataScope listScope = listScope("initiator_merchant_id", "created_by");
        DataScope countScope = countScope("initiator_merchant_id", "created_by");

        // 分页查询
        Page<JointMarketingPlanVO> page = new Page<>(dto.getPageNum(), dto.getPageSize());
        page.setSearchCount(false);  // 禁用自动统计

        IPage<JointMarketingPlanVO> resultPage = baseMapper.pagePlan(page, dto, listScope);
        Long total = baseMapper.countPlan(dto, countScope);
        page.setTotal(total == null ? 0L : total);

        // 处理VO状态
        LocalDateTime now = LocalDateTime.now();
        if (CollUtil.isNotEmpty(resultPage.getRecords())) {
            for (JointMarketingPlanVO vo : resultPage.getRecords()) {
                // 如果是已发布状态，根据时间动态调整展示状态
                if ("PUBLISHED".equals(vo.getStatus())) {
                    if (vo.getStartTime() != null && now.isBefore(vo.getStartTime())) {
                        vo.setStatus("NOT_STARTED");
                    } else if (vo.getEndTime() != null && now.isAfter(vo.getEndTime())) {
                        vo.setStatus("ENDED");
                    } else {
                        vo.setStatus("ONGOING");
                    }
                }
            }
        }

        return R.ok(PageQueryVO.of(resultPage, vo -> {
            vo.setPlanRole("INITIATOR");
            return vo;
        }));
    }

    @Override
    public R<PageQueryVO<JointMarketingPlanVO>> queryPlans(JointMarketingPlanPageDTO dto) {
        // 查询我发布的
        if (dto.getOnlyOwnerPublish()) {
            return pagePlan(dto);
        }

        validPlanQueryTime(dto);

        // 查询我关联的
        IPage<JointMarketingPlanVO> pageData = baseMapper.queryRelatedPlans(dto.page(), dto, getPrincipalMerchantId());
        return R.ok(PageQueryVO.of(pageData));
    }

    @Override
    public void publishPlan(Long planId) {
        JointMarketingPlan plan = getById(planId);
        if (ObjUtil.isNull(plan)) {
            throw new CheckedException("计划不存在");
        }

        // 权限校验
        if (!plan.getInitiatorMerchantId().equals(SecurityUtils.getUser().getDeptId())) {
           throw new CheckedException("无权操作该计划");
        }

        if (!"APPROVED".equals(plan.getAuditStatus())) {
            throw new CheckedException("发布失败, 计划未通过审核");
        }

        if (!"DRAFT".equals(plan.getStatus())) {
            throw new CheckedException("只有草稿状态的计划可以发布");
        }

        // 检查时间有效性
        validatePlanTime(plan.getStartTime(), plan.getEndTime());
        // 检查规则下的分润配置
//        allocationService.validateProfitSharingConfig(planId);

        plan.setStatus("PUBLISHED");
        boolean result = updateById(plan);
        Assert.isTrue(result, () -> new RuntimeException("联合营销计划发布失败"));
    }

    @Override
    public R<Boolean> closePlan(Long planId) {
        JointMarketingPlan plan = getById(planId);
        if (ObjUtil.isNull(plan)) {
            return R.failed("计划不存在");
        }

        // 权限校验
        if (!plan.getInitiatorMerchantId().equals(SecurityUtils.getUser().getDeptId())) {
            return R.failed("无权操作该计划");
        }

        if (!"PUBLISHED".equals(plan.getStatus())) {
            return R.failed("只有已发布状态的计划可以关闭");
        }

        plan.setStatus("ENDED");
        updateById(plan);
        return R.ok(true);
    }

    @Override
    public R<JointMarketingPlanVO> getPlanDetail(Long planId) {
        JointMarketingPlan plan = getById(planId);
        if (ObjUtil.isNull(plan)) {
            return R.failed("计划不存在");
        }

        JointMarketingPlanVO vo = new JointMarketingPlanVO();
        BeanUtil.copyProperties(plan, vo);

        // 动态状态处理
        LocalDateTime now = LocalDateTime.now();
        if ("PUBLISHED".equals(vo.getStatus())) {
            if (vo.getStartTime() != null && now.isBefore(vo.getStartTime())) {
                vo.setStatus("NOT_STARTED");
            } else if (vo.getEndTime() != null && now.isAfter(vo.getEndTime())) {
                vo.setStatus("ENDED");
            } else {
                vo.setStatus("ONGOING");
            }
        }

        return R.ok(vo);
    }

    @Override
    public R<PageQueryVO<JointMarketingPlanVO>> queryApplyJoinPlanList(JointMarketingApplyJoinPlanDTO dto) {
        Long merchantId = getPrincipalMerchantId();

        // 根据商家ID列表查询联合营销计划(最高优先级)
        IPage<JointMarketingPlanVO> pageData;
        if (CollUtil.isNotEmpty(dto.getMerchantIds())) {
            List<Long> merchantIds = dto.getMerchantIds().stream().map(Long::parseLong).toList();
            pageData = queryApplyJoinPlanListByMerchantIds(dto.page(), merchantIds, dto.getPlanName());
            pageData.getRecords().forEach(vo -> {
                if (ObjUtil.equals(merchantId, vo.getInitiatorMerchantId())) {
                    vo.setCanJoin(false);
                }
            });
            return R.ok(PageQueryVO.of(pageData));
        }

        // 根据地区编码列表或行业分类ID列表查询联合营销计划
        List<Long> industryIds = null;
        if (CollUtil.isNotEmpty(dto.getIndustryIds())) {
            industryIds = dto.getIndustryIds().stream().map(Long::valueOf).toList();
        }
        List<MerchantSimpleInfoBO> merchants = merchantService.queryMerchantByIndustryAndRegions(dto.getRegionCodes(), industryIds);
        if (CollUtil.isEmpty(merchants)) {
            // 当没有匹配的商家时，传递空列表而不是 null，避免 MyBatis 参数绑定错误
            pageData = queryApplyJoinPlanListByMerchantIds(dto.page(), CollUtil.newArrayList(), dto.getPlanName());
            return R.ok(PageQueryVO.of(pageData));
        }
        List<Long> merchantIds = merchants.stream().map(MerchantSimpleInfoBO::getMerchantId).toList();
        pageData = baseMapper.queryApplyJoinPlanListByMerchant(dto.page(), merchantIds, dto.getPlanName());
        List<JointMarketingPlanVO> vos = pageData.getRecords();
        if (CollUtil.isEmpty(vos)) {
            return R.ok(PageQueryVO.empty(pageData));
        }
        Map<Long, MerchantSimpleInfoBO> merchantsMap = merchants.stream()
                .collect(Collectors.toMap(MerchantSimpleInfoBO::getMerchantId, merchant -> merchant));
        for (JointMarketingPlanVO vo : vos) {
            MerchantSimpleInfoBO merchant = merchantsMap.get(vo.getInitiatorMerchantId());
            if (ObjUtil.isNull(merchant)) {
                continue;
            }
            if (ObjUtil.equals(merchantId, vo.getInitiatorMerchantId())) {
                vo.setCanJoin(false);
            }
            vo.setInitiatorMerchantName(merchant.getMerchantName());
            vo.setInitiatorMerchantLogo(merchant.getMerchantLogo());

        }

        return R.ok(PageQueryVO.of(pageData));
    }

    @Override
    public R<JointMarketingStatisticsVO> getStatistics(Long planId) {
        JointMarketingStatisticsVO vo = new JointMarketingStatisticsVO();
        vo.setPlanId(planId);

        // 1. 查询该计划下的所有返利记录
        List<JointMarketingRebateRecord> records = rebateRecordMapper.selectList(new LambdaQueryWrapper<JointMarketingRebateRecord>()
                .eq(JointMarketingRebateRecord::getPlanId, planId));

        if (CollUtil.isEmpty(records)) {
            vo.setTotalIssuedCoupons(0);
            vo.setTotalRedeemedCoupons(0);
            vo.setTotalRebateAmount(BigDecimal.ZERO);
            vo.setTotalSettledAmount(BigDecimal.ZERO);
            return R.ok(vo);
        }

        // 2. 统计数据
        // 累计发放: 记录总数 (假设一条记录对应一张券, 若有分润规则导致一张券多条记录, 需去重couponId)
        long issuedCount = records.stream().map(JointMarketingRebateRecord::getCouponId).distinct().count();
        vo.setTotalIssuedCoupons((int) issuedCount);

        // 累计核销: 状态为 PENDING_SETTLEMENT 或 SETTLED 的记录 (同样需去重couponId)
        long redeemedCount = records.stream()
                .filter(r -> "PENDING_SETTLEMENT".equals(r.getStatus()) || "SETTLED".equals(r.getStatus()))
                .map(JointMarketingRebateRecord::getCouponId)
                .distinct()
                .count();
        vo.setTotalRedeemedCoupons((int) redeemedCount);

        // 累计返利金额: 所有记录金额之和
        BigDecimal totalAmount = records.stream()
                .map(JointMarketingRebateRecord::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        vo.setTotalRebateAmount(totalAmount);

        // 累计已结算金额: 状态为 SETTLED 的记录金额之和
        BigDecimal settledAmount = records.stream()
                .filter(r -> "SETTLED".equals(r.getStatus()))
                .map(JointMarketingRebateRecord::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        vo.setTotalSettledAmount(settledAmount);

        return R.ok(vo);
    }

    private Long getPrincipalMerchantId() {
        PocoUser user = SecurityUtils.getUser();
        Assert.notNull(user, () -> new CheckedException("无效的登录用户"));
        return user.getDeptId();
    }

    /**
     * 创建列表查询的 DataScope
     */
    private DataScope listScope(String deptColumn, String userColumn) {
        DataScope scope = new DataScope();
        scope.setFunc(DataScopeFuncEnum.ALL);
        scope.setScopeDeptName(deptColumn);
        scope.setScopeUserName(userColumn);
        return scope;
    }

    /**
     * 创建统计查询的 DataScope
     */
    private DataScope countScope(String deptColumn, String userColumn) {
        DataScope scope = new DataScope();
        scope.setFunc(DataScopeFuncEnum.COUNT);
        scope.setScopeDeptName(deptColumn);
        scope.setScopeUserName(userColumn);
        return scope;
    }

    private void validatePlanTime(LocalDateTime startTime, LocalDateTime endTime) {
        LocalDateTime now = LocalDateTime.now();
        if (startTime != null && startTime.isBefore(now.minusDays(1))) {
            throw new CheckedException("开始时间不能早于当前时间");
        }
        if (endTime != null && endTime.isBefore(now)) {
            throw new CheckedException("结束时间不能早于当前时间");
        }
        if (startTime != null && endTime != null && endTime.isBefore(startTime)) {
            throw new CheckedException("结束时间不能早于开始时间");
        }
    }

    private void validPlanQueryTime(JointMarketingPlanPageDTO dto) {
        dto.setStartTime(dto.getStartDate() == null ? null : dto.getStartDate().atStartOfDay());
        dto.setEndTime(dto.getEndDate() == null ? null : dto.getEndDate().atTime(23, 59, 59));
        if (dto.getStartTime() != null && dto.getEndTime() != null) {
            Assert.isTrue(dto.getStartTime().isBefore(dto.getEndTime()), () -> new CheckedException("无效的查询时间"));
        }

        dto.setAcceptStartTime(dto.getAcceptStartDate() == null ? null : dto.getAcceptStartDate().atStartOfDay());
        dto.setAcceptEndTime(dto.getAcceptEndDate() == null ? null : dto.getAcceptEndDate().atTime(23, 59, 59));
        if (dto.getAcceptStartTime() != null && dto.getAcceptEndTime() != null) {
            Assert.isTrue(dto.getAcceptStartTime().isBefore(dto.getAcceptEndTime()), () -> new CheckedException("无效的查询时间"));
        }
    }

    private IPage<JointMarketingPlanVO> queryApplyJoinPlanListByMerchantIds(
            Page<JointMarketingPlanVO> page, List<Long> merchantIds, String planName) {
        return baseMapper.queryApplyJoinPlanListByMerchantIds(page, merchantIds, planName);
    }

    private Long getCurrentMerchantId() {
        PocoUser user = SecurityUtils.getUser();
        Assert.notNull(user, () -> new CheckedException("无效的登录用户"));
        return user.getDeptId();
    }

}