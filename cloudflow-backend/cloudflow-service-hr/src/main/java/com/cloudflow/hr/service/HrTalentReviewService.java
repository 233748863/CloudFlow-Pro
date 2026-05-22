package com.cloudflow.hr.service;

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

    Long createReview(Map<String, Object> payload);

    void updateReview(Long reviewId, Map<String, Object> payload);

    Map<String, Object> page(Map<String, Object> query);

    Map<String, Object> getReview(Long reviewId);

    int snapshotPerformance(Long reviewId, Long objectiveId);

    void upsertParticipant(Long reviewId, Long employeeId, Map<String, Object> payload);

    void moveGridCell(Long reviewId, Long employeeId, Integer gridCell);

    String publish(Long reviewId);

    Map<Integer, List<Map<String, Object>>> loadNineBox(Long reviewId);

    Long createCalibrationSession(Long reviewId, Map<String, Object> payload);

    Map<String, Object> listCalibrationSessions(Long reviewId);

    void updateCalibrationSession(Long sessionId, Map<String, Object> payload);
}
