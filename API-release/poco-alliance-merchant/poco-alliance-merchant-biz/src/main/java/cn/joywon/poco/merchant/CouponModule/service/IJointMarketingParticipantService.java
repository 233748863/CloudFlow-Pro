package cn.joywon.poco.merchant.CouponModule.service;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.CouponModule.dto.JointMarketingInviteQueryDTO;
import cn.joywon.poco.merchant.CouponModule.dto.JointMarketingParticipantCreateDTO;
import cn.joywon.poco.merchant.CouponModule.dto.JointMarketingParticipantPageDTO;
import cn.joywon.poco.merchant.CouponModule.entity.JointMarketingParticipant;
import cn.joywon.poco.merchant.CouponModule.vo.JointMarketingApplyJoinVO;
import cn.joywon.poco.merchant.CouponModule.vo.JointMarketingInviteRecordVO;
import cn.joywon.poco.merchant.CouponModule.vo.JointMarketingParticipantVO;
import com.baomidou.mybatisplus.extension.service.IService;

public interface IJointMarketingParticipantService extends IService<JointMarketingParticipant> {

    /**
     * 申请加入联合营销计划
     */
    R<?> applyJoinPlan(JointMarketingParticipantCreateDTO dto);

    /**
     * 处理加入联合营销计划申请
     */
    R<?> handleApplyJoin(Long participantId, Boolean handleResult);

    /**
     * 邀请商家参与联合营销
     */
    R<Boolean> inviteParticipant(JointMarketingParticipantCreateDTO dto);

    /**
     * 接受联合营销邀请
     */
    R<Boolean> acceptInvitation(Long participantId);

    /**
     * 拒绝联合营销邀请
     */
    R<Boolean> rejectInvitation(Long participantId);

    /**
     * 查询联合营销邀请记录
     */
    R<PageQueryVO<JointMarketingInviteRecordVO>> inviteRecord(JointMarketingInviteQueryDTO dto);

    /**
     * 退出联合营销计划
     */
    R<Boolean> quitPlan(Long planId);

    /**
     * 移除联合营销参与者
     */
    R<Boolean> removeParticipant(Long participantId);

    /**
     * 分页查询联合营销参与者
     */
    R<PageQueryVO<JointMarketingParticipantVO>> pageParticipant(JointMarketingParticipantPageDTO dto);

    /**
     * 获取联合营销计划申请加入列表
     */
    R<PageQueryVO<JointMarketingApplyJoinVO>> getApplyJoinList(Long planId, Integer pageNum, Integer pageSize);

    /**
     * 发布联合营销计划
     */
    void publishPlan(Long planId);

}