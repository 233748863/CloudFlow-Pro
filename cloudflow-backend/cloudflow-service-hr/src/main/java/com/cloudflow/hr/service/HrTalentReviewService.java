package com.cloudflow.hr.service;

import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.hr.domain.dto.talent.HrTalentCalibrationSessionDTO;
import com.cloudflow.hr.domain.dto.talent.HrTalentParticipantDTO;
import com.cloudflow.hr.domain.dto.talent.HrTalentReviewDTO;
import com.cloudflow.hr.domain.dto.talent.HrTalentReviewQueryDTO;
import com.cloudflow.hr.domain.vo.talent.HrTalentCalibrationSessionVO;
import com.cloudflow.hr.domain.vo.talent.HrTalentParticipantVO;
import com.cloudflow.hr.domain.vo.talent.HrTalentReviewListVO;
import com.cloudflow.hr.domain.vo.talent.HrTalentReviewVO;

import java.util.List;
import java.util.Map;

/**
 * HR 人才盘点（Talent Review）业务接口。
 *
 * <p>负责盘点活动主表 + 九宫格参与人 + 校准会议三张表的领域行为：
 * <ul>
 *     <li>{@link #snapshotPerformance} 拉取业绩分 → 默认入格</li>
 *     <li>{@link #upsertParticipant} HR 在校准会议上录入潜力分 + 评语 → 重算 grid_cell</li>
 *     <li>{@link #moveGridCell} 九宫格拖拽落格（仅改 grid_cell + decided_at）</li>
 *     <li>{@link #publish} 发起工作流；回调将状态改为 PUBLISHED 并自动入 HiPo 池（{@link HrTalentPoolService}）</li>
 * </ul>
 */
public interface HrTalentReviewService {

    Long createReview(HrTalentReviewDTO dto);

    void updateReview(Long reviewId, HrTalentReviewDTO dto);

    PageResult<HrTalentReviewListVO> page(HrTalentReviewQueryDTO query);

    HrTalentReviewVO getReview(Long reviewId);

    int snapshotPerformance(Long reviewId, Long objectiveId);

    void upsertParticipant(Long reviewId, Long employeeId, HrTalentParticipantDTO dto);

    void moveGridCell(Long reviewId, Long employeeId, Integer gridCell);

    String publish(Long reviewId);

    Map<Integer, List<HrTalentParticipantVO>> loadNineBox(Long reviewId);

    Long createCalibrationSession(Long reviewId, HrTalentCalibrationSessionDTO dto);

    PageResult<HrTalentCalibrationSessionVO> listCalibrationSessions(Long reviewId);

    void updateCalibrationSession(Long sessionId, HrTalentCalibrationSessionDTO dto);
}
