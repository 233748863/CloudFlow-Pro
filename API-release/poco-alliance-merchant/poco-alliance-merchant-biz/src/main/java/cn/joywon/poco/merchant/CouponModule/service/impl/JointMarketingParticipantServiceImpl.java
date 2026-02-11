package cn.joywon.poco.merchant.CouponModule.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.lang.Assert;
import cn.hutool.core.util.ObjUtil;
import cn.hutool.core.util.StrUtil;
import cn.joywon.poco.common.core.exception.CheckedException;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.security.service.PocoUser;
import cn.joywon.poco.common.security.util.SecurityUtils;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.CouponModule.dto.JointMarketingInviteQueryDTO;
import cn.joywon.poco.merchant.CouponModule.dto.JointMarketingParticipantCreateDTO;
import cn.joywon.poco.merchant.CouponModule.dto.JointMarketingParticipantPageDTO;
import cn.joywon.poco.merchant.CouponModule.entity.JointMarketingParticipant;
import cn.joywon.poco.merchant.CouponModule.entity.JointMarketingPlan;
import cn.joywon.poco.merchant.CouponModule.mapper.JointMarketingParticipantMapper;
import cn.joywon.poco.merchant.CouponModule.service.IJointMarketingParticipantService;
import cn.joywon.poco.merchant.CouponModule.service.IJointMarketingPlanService;
import cn.joywon.poco.merchant.CouponModule.vo.JointMarketingApplyJoinVO;
import cn.joywon.poco.merchant.CouponModule.vo.JointMarketingInviteRecordVO;
import cn.joywon.poco.merchant.CouponModule.vo.JointMarketingParticipantVO;
import cn.joywon.poco.merchant.MerchantModule.entity.Merchant;
import cn.joywon.poco.merchant.MerchantModule.service.IMerchantService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.context.config.annotation.RefreshScope;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RefreshScope
@RequiredArgsConstructor
public class JointMarketingParticipantServiceImpl extends
        ServiceImpl<JointMarketingParticipantMapper, JointMarketingParticipant> implements IJointMarketingParticipantService {

    @Value("${joywon.ma.joint.invitation-expiry-days}")
    private Integer invitationExpiryDays;

    private final IJointMarketingPlanService planService;
    private final IMerchantService merchantService;

    @Override
    public R<?> applyJoinPlan(JointMarketingParticipantCreateDTO dto) {
        Long planId = dto.getPlanId();
        // 检查计划状态
        JointMarketingPlan plan = planService.getById(planId);
        Assert.notNull(plan, () -> new CheckedException("计划不存在"));
        Assert.isTrue("ACTIVE".equals(plan.getStatus()), () -> new CheckedException("申请加入失败, 联合营销计划当前状态不可加入"));

        // 检查是否已申请
        Long merchantId = getCurrentMerchantId();
        JointMarketingParticipant entity = lambdaQuery()
                .eq(JointMarketingParticipant::getPlanId, planId)
                .eq(JointMarketingParticipant::getMerchantId, merchantId)
                .last("LIMIT 1")
                .one();
        Assert.isNull(entity, () -> new CheckedException("已申请过加入该联合营销计划, 请勿重复申请"));

        // 写入申请加入记录
        entity = new JointMarketingParticipant();
        entity.setMerchantId(getCurrentMerchantId());
        entity.setStatus("APPLY_JOIN");
        entity.setRole("PARTICIPANT");
        entity.setInfo(dto.getInfo());
        entity.setPlanId(planId);
        boolean result = save(entity);
        Assert.isTrue(result, () -> new RuntimeException("申请加入联合营销失败, 请重试"));

        return R.ok();
    }

    @Override
    public R<?> handleApplyJoin(Long participantId, Boolean handleResult) {
        JointMarketingParticipant participant = getById(participantId);
        Assert.notNull(participant, () -> new CheckedException("无效的联合营销加入申请记录"));
        Assert.isTrue("APPLY_JOIN".equals(participant.getStatus()),
                () -> new CheckedException("无效的联合营销加入申请记录状态"));
        JointMarketingPlan plan = planService.getById(participant.getPlanId());
        Assert.notNull(plan, () -> new CheckedException("联合营销计划不存在"));
        Assert.isTrue(ObjUtil.equal(getCurrentMerchantId(), plan.getInitiatorMerchantId()),
                () -> new CheckedException("联合营销计划不存在"));

        if (handleResult) {
            participant.setStatus("ACCEPTED");
            participant.setJoinTime(LocalDateTime.now());
        } else {
            participant.setStatus("REJECTED");
        }
        boolean result = updateById(participant);
        Assert.isTrue(result, () -> new RuntimeException("处理加入联合营销申请失败, 请重试"));

        return R.ok();
    }

    @Override
    public R<Boolean> inviteParticipant(JointMarketingParticipantCreateDTO dto) {
        // 1. 检查计划
        JointMarketingPlan plan = planService.getById(dto.getPlanId());
        if (ObjUtil.isNull(plan)) {
            return R.failed("计划不存在");
        }

        // 2. 权限: 发起人才能邀请
        if (!plan.getInitiatorMerchantId().equals(SecurityUtils.getUser().getDeptId())) {
            return R.failed("无权操作");
        }

        // 3. 检查计划状态
        if (!"DRAFT".equals(plan.getStatus()) && !"PUBLISHED".equals(plan.getStatus())) {
            return R.failed("只有草稿或已发布状态的计划可以邀请参与者");
        }

        // 4. 检查商家是否存在
        Merchant merchant = merchantService.getById(dto.getMerchantId());
        if (ObjUtil.isNull(merchant)) {
            return R.failed("商家不存在");
        }
        if (!merchant.getEnable()) {
            return R.failed("商家当前状态不可用");
        }

        // 6. 检查是否已存在
        LocalDateTime expiryTime = LocalDate.now().plusDays(invitationExpiryDays).atTime(23, 59, 59);
        JointMarketingParticipant existing = getOne(new LambdaQueryWrapper<JointMarketingParticipant>()
                .eq(JointMarketingParticipant::getPlanId, dto.getPlanId())
                .eq(JointMarketingParticipant::getMerchantId, dto.getMerchantId())
                .last("LIMIT 1"));
        if (existing != null) {
            // 处理已存在的邀请
            if ("PENDING".equals(existing.getStatus())) {
                return R.failed("该商家已被邀请，请等待对方处理");
            } else if ("ACCEPTED".equals(existing.getStatus())) {
                return R.failed("该商家已接受邀请");
            } else if ("REJECTED".equals(existing.getStatus())) {
                // 重新邀请
                existing.setStatus("PENDING");
                existing.setExpiryTime(expiryTime);
                updateById(existing);
                return R.ok(true);
            }
        }

        // 7. 创建记录
        JointMarketingParticipant participant = new JointMarketingParticipant();
        participant.setPlanId(dto.getPlanId());
        participant.setMerchantId(dto.getMerchantId());
        participant.setExpiryTime(expiryTime);
        participant.setInfo(dto.getInfo());
        participant.setRole("PARTICIPANT");
        participant.setStatus("PENDING");
        save(participant);

        return R.ok(true);
    }

    @Override
    public R<Boolean> acceptInvitation(Long participantId) {
        JointMarketingParticipant participant = getById(participantId);
        if (ObjUtil.isNull(participant)) {
            return R.failed("记录不存在");
        }

        if (!participant.getMerchantId().equals(SecurityUtils.getUser().getDeptId())) {
            return R.failed("无权操作");
        }

        if (!"PENDING".equals(participant.getStatus())) {
            return R.failed("状态不正确");
        }

        if (participant.getExpiryTime().isAfter(LocalDateTime.now())) {
            participant.setStatus("EXPIRED");
            updateById(participant);
            return R.failed("邀请已过期");
        }

        participant.setStatus("ACCEPTED");
        participant.setJoinTime(LocalDateTime.now());
        updateById(participant);
        return R.ok(true);
    }

    @Override
    public R<Boolean> rejectInvitation(Long participantId) {
        JointMarketingParticipant participant = getById(participantId);
        if (ObjUtil.isNull(participant)) {
            return R.failed("记录不存在");
        }

        if (!participant.getMerchantId().equals(SecurityUtils.getUser().getDeptId())) {
            return R.failed("无权操作");
        }

        if (!"PENDING".equals(participant.getStatus())) {
            return R.failed("状态不正确");
        }

        participant.setStatus("REJECTED");
        updateById(participant);
        return R.ok(true);
    }

    @Override
    public R<PageQueryVO<JointMarketingInviteRecordVO>> inviteRecord(JointMarketingInviteQueryDTO dto) {
        dto.setInviteStartTime(dto.getInviteStartDate() == null ? null : dto.getInviteStartDate().atStartOfDay());
        dto.setInviteEndTime(dto.getInviteEndDate() == null ? null : dto.getInviteEndDate().atTime(23, 59, 59));
        if (dto.getInviteStartTime() != null && dto.getInviteEndTime() != null) {
            Assert.isTrue(dto.getInviteStartTime().isBefore(dto.getInviteEndTime()),
                    () -> new CheckedException("无效的邀请时间范围"));
        }
        dto.setAcceptStartTime(dto.getAcceptStartDate() == null ? null : dto.getAcceptStartDate().atStartOfDay());
        dto.setAcceptEndTime(dto.getAcceptEndDate() == null ? null : dto.getAcceptEndDate().atTime(23, 59, 59));
        if (dto.getAcceptStartTime() != null && dto.getAcceptEndTime() != null) {
            Assert.isTrue(dto.getAcceptStartTime().isBefore(dto.getAcceptEndTime()),
                    () -> new CheckedException("无效的接受邀请时间范围"));
        }
        dto.setMerchantId(getCurrentMerchantId());

        Page<JointMarketingInviteRecordVO> pageData = baseMapper.queryInviteRecord(dto.page(), dto);
        return R.ok(PageQueryVO.of(pageData));
    }

    @Override
    public R<Boolean> quitPlan(Long planId) {
        Long merchantId = SecurityUtils.getUser().getDeptId();
        JointMarketingParticipant participant = getOne(new LambdaQueryWrapper<JointMarketingParticipant>()
                .eq(JointMarketingParticipant::getPlanId, planId)
                .eq(JointMarketingParticipant::getMerchantId, merchantId));

        if (ObjUtil.isNull(participant)) {
            return R.failed("未参与该计划");
        }

        if ("QUIT".equals(participant.getStatus())) {
            return R.failed("已退出");
        }

        participant.setStatus("QUIT");
        updateById(participant);
        return R.ok(true);
    }

    @Override
    public R<Boolean> removeParticipant(Long participantId) {
        JointMarketingParticipant participant = getById(participantId);
        if (ObjUtil.isNull(participant)) {
            return R.failed("记录不存在");
        }

        // Check initiator permission
        JointMarketingPlan plan = planService.getById(participant.getPlanId());
        if (ObjUtil.isNull(plan) || !plan.getInitiatorMerchantId().equals(SecurityUtils.getUser().getDeptId())) {
            return R.failed("无权操作");
        }

        participant.setStatus("REJECTED");
        updateById(participant);
        return R.ok(true);
    }

    @Override
    public R<PageQueryVO<JointMarketingParticipantVO>> pageParticipant(JointMarketingParticipantPageDTO dto) {
        Page<JointMarketingParticipant> page = new Page<>(dto.getPageNum(), dto.getPageSize());
        Page<JointMarketingParticipant> resultPage = page(page, new LambdaQueryWrapper<JointMarketingParticipant>()
                .eq(ObjUtil.isNotNull(dto.getPlanId()), JointMarketingParticipant::getPlanId, dto.getPlanId())
                .eq(ObjUtil.isNotNull(dto.getMerchantId()), JointMarketingParticipant::getMerchantId, dto.getMerchantId())
                .eq(StrUtil.isNotBlank(dto.getStatus()), JointMarketingParticipant::getStatus, dto.getStatus())
                .orderByDesc(JointMarketingParticipant::getCreatedTime));

        if (CollUtil.isEmpty(resultPage.getRecords())) {
            return R.ok(PageQueryVO.empty(resultPage));
        }

        // Populate Merchant Name
        List<Long> merchantIds = resultPage.getRecords().stream()
                .map(JointMarketingParticipant::getMerchantId)
                .collect(Collectors.toList());

        Map<Long, String> merchantNameMap;
        if (CollUtil.isNotEmpty(merchantIds)) {
            List<Merchant> merchants = merchantService.listByIds(merchantIds);
            merchantNameMap = merchants.stream().collect(Collectors.toMap(Merchant::getId, Merchant::getName));
        } else {
            merchantNameMap = Map.of();
        }

        return R.ok(PageQueryVO.of(resultPage, i -> {
            JointMarketingParticipantVO vo = BeanUtil.copyProperties(i, JointMarketingParticipantVO.class);
            vo.setMerchantName(merchantNameMap.get(i.getMerchantId()));
            return vo;
        }));
    }

    @Override
    public R<PageQueryVO<JointMarketingApplyJoinVO>> getApplyJoinList(Long planId, Integer pageNum, Integer pageSize) {
        // 检查联合营销计划状态
        JointMarketingPlan plan = planService.getById(planId);
        Assert.notNull(plan, () -> new CheckedException("联合营销计划不存在"));
        Assert.isTrue(ObjUtil.equals(getCurrentMerchantId(), plan.getInitiatorMerchantId()),
                () -> new CheckedException("联合营销计划不存在"));

        // 查询联合营销计划申请加入列表
        IPage<JointMarketingApplyJoinVO> pageData = baseMapper.getApplyJoinList(Page.of(pageNum, pageSize), planId);
        return R.ok(PageQueryVO.of(pageData));
    }

    @Override
    public void publishPlan(Long planId) {
        JointMarketingParticipant entity = new JointMarketingParticipant();
        entity.setPlanId(planId);
        entity.setRole("INITIATOR");
        entity.setStatus("ACCEPTED");
        entity.setJoinTime(LocalDateTime.now());
        entity.setMerchantId(getCurrentMerchantId());
        boolean result = save(entity);

        if (!result) {
            result = planService.lambdaUpdate().eq(JointMarketingPlan::getId, planId)
                    .set(JointMarketingPlan::getStatus, "DRAFT")
                    .update();
        }
        Assert.isTrue(result, () -> {
            log.error("发布联合营销计划时同步参与方数据失败, 请检查联合营销计划状态, planId: {}", planId);
            throw new RuntimeException("发布联合营销计划时同步参与方数据失败");
        });
    }

    /**
     * 清理过期邀请
     * 每天凌晨2点执行
     */
    @Async
    @Scheduled(cron = "0 0 2 * * ?")
    @Transactional(rollbackFor = Exception.class)
    public void cleanupExpiredInvitations() {
        try {
            LocalDateTime now = LocalDateTime.now();

            List<JointMarketingParticipant> expiredParticipants = list(
                    new LambdaQueryWrapper<JointMarketingParticipant>()
                            .eq(JointMarketingParticipant::getStatus, "PENDING")
                            .le(JointMarketingParticipant::getExpiryTime, now)
            );

            if (CollUtil.isNotEmpty(expiredParticipants)) {
                for (JointMarketingParticipant participant : expiredParticipants) {
                    participant.setStatus("EXPIRED");
                }

                updateBatchById(expiredParticipants);
                log.info("清理过期邀请完成, 数量: {}", expiredParticipants.size());
            }
        } catch (Exception e) {
            log.error("清理过期邀请失败", e);
        }
    }

    private Long getCurrentMerchantId() {
        PocoUser user = SecurityUtils.getUser();
        Assert.notNull(user, () -> new CheckedException("无效的登录用户"));
        return user.getDeptId();
    }

}