package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.domain.dto.talent.HrTalentCalibrationSessionDTO;
import com.cloudflow.hr.domain.dto.talent.HrTalentParticipantDTO;
import com.cloudflow.hr.domain.dto.talent.HrTalentReviewDTO;
import com.cloudflow.hr.domain.dto.talent.HrTalentReviewQueryDTO;
import com.cloudflow.hr.domain.entity.HrPerformanceObjective;
import com.cloudflow.hr.domain.entity.HrPerformanceResult;
import com.cloudflow.hr.domain.entity.HrTalentCalibrationSession;
import com.cloudflow.hr.domain.entity.HrTalentReview;
import com.cloudflow.hr.domain.entity.HrTalentReviewParticipant;
import com.cloudflow.hr.domain.vo.talent.HrTalentCalibrationSessionVO;
import com.cloudflow.hr.domain.vo.talent.HrTalentParticipantVO;
import com.cloudflow.hr.domain.vo.talent.HrTalentReviewListVO;
import com.cloudflow.hr.domain.vo.talent.HrTalentReviewVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrPerformanceObjectiveMapper;
import com.cloudflow.hr.mapper.HrPerformanceResultMapper;
import com.cloudflow.hr.mapper.HrTalentCalibrationSessionMapper;
import com.cloudflow.hr.mapper.HrTalentReviewMapper;
import com.cloudflow.hr.mapper.HrTalentReviewParticipantMapper;
import com.cloudflow.hr.service.IHrTalentReviewService;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.cloudflow.common.audit.annotation.Audit;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

@Slf4j
@Service
@RequiredArgsConstructor
public class HrTalentReviewServiceImpl implements IHrTalentReviewService {

    private static final long DEFAULT_TENANT_ID = 100000L;

    private final HrTalentReviewMapper reviewMapper;
    private final HrTalentReviewParticipantMapper participantMapper;
    private final HrTalentCalibrationSessionMapper calibrationSessionMapper;
    private final HrPerformanceObjectiveMapper performanceObjectiveMapper;
    private final HrPerformanceResultMapper performanceResultMapper;
    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;
    private final WorkflowServiceClient workflowServiceClient;

    @Value("${cloudflow.hr.talent.review-process-key:wf_hr_talent_review}")
    private String reviewProcessKey;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createReview(HrTalentReviewDTO dto) {
        HrTalentReview review = objectMapper.convertValue(dto, HrTalentReview.class);
        review.setTenantId(currentTenantId());
        review.setStatus(StringUtils.hasText(review.getStatus()) ? review.getStatus() : "DRAFT");
        review.setDeleted(0);
        review.setCreateBy(currentUserName());
        review.setUpdateBy(currentUserName());
        if (!StringUtils.hasText(review.getReviewNo())) {
            review.setReviewNo("TR-" + System.currentTimeMillis());
        }
        reviewMapper.insert(review);
        return review.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "更新人才评审")
    public void updateReview(Long reviewId, HrTalentReviewDTO dto) {
        crudService.updateProperties(HrTalentReview.class, reviewId, MapConverters.toMap(dto, objectMapper));
    }

    @Override
    public PageResult<HrTalentReviewListVO> page(HrTalentReviewQueryDTO query) {
        Map<String, Object> raw = crudService.page(HrTalentReview.class, MapConverters.toServiceQuery(query, objectMapper));
        return MapConverters.toPageResult(raw, HrTalentReviewListVO.class, objectMapper);
    }

    @Override
    public HrTalentReviewVO getReview(Long reviewId) {
        Map<String, Object> row = crudService.get(HrTalentReview.class, reviewId);
        if (row.isEmpty()) {
            return null;
        }
        return objectMapper.convertValue(row, HrTalentReviewVO.class);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int snapshotPerformance(Long reviewId, Long objectiveId) {
        HrTalentReview review = reviewMapper.selectById(reviewId);
        if (review == null) {
            throw new HrBusinessException("REVIEW_NOT_FOUND", "盘点活动不存在：" + reviewId);
        }
        if (!"DRAFT".equals(review.getStatus()) && !"IN_PROGRESS".equals(review.getStatus())) {
            throw new HrBusinessException("REVIEW_STATUS_INVALID",
                    "盘点状态 " + review.getStatus() + " 不允许重新拉取业绩快照");
        }
        Integer objectivePublished = Math.toIntExact(performanceObjectiveMapper.selectCount(
                new LambdaQueryWrapper<HrPerformanceObjective>()
                        .eq(HrPerformanceObjective::getId, objectiveId)
                        .eq(HrPerformanceObjective::getTenantId, currentTenantId())
                        .eq(HrPerformanceObjective::getStatus, "PUBLISHED")
                        .eq(HrPerformanceObjective::getDeleted, 0)));
        if (objectivePublished == null || objectivePublished == 0) {
            throw new HrBusinessException("OBJECTIVE_NOT_PUBLISHED",
                    "目标计划未发布（status != PUBLISHED），无法拉取业绩快照");
        }
        List<HrPerformanceResult> results = performanceResultMapper.selectList(
                new LambdaQueryWrapper<HrPerformanceResult>()
                        .eq(HrPerformanceResult::getObjectiveId, objectiveId)
                        .eq(HrPerformanceResult::getTenantId, currentTenantId()));
        int inserted = 0;
        Long tenantId = currentTenantId();
        for (HrPerformanceResult row : results) {
            Long empId = row.getEmployeeId();
            BigDecimal score = row.getScore();
            String band = performanceBand(score);
            QueryWrapper<HrTalentReviewParticipant> dup = new QueryWrapper<>();
            dup.eq("tenant_id", tenantId).eq("review_id", reviewId).eq("employee_id", empId).eq("deleted", 0);
            if (participantMapper.selectCount(dup) > 0) {
                continue;
            }
            HrTalentReviewParticipant p = new HrTalentReviewParticipant();
            p.setTenantId(tenantId);
            p.setReviewId(reviewId);
            p.setEmployeeId(empId);
            p.setPerformanceScore(score);
            p.setPerformanceBand(band);
            p.setPotentialBand("MEDIUM");
            p.setGridCell(computeGridCell(band, "MEDIUM"));
            p.setDeleted(0);
            p.setCreateBy(currentUserName());
            p.setUpdateBy(currentUserName());
            participantMapper.insert(p);
            inserted++;
        }
        UpdateWrapper<HrTalentReview> uw = new UpdateWrapper<>();
        uw.eq("id", reviewId).eq("tenant_id", tenantId)
                .set("performance_source_objective_id", objectiveId)
                .set("status", "IN_PROGRESS")
                .set("update_time", LocalDateTime.now());
        reviewMapper.update(null, uw);
        log.info("拉取业绩快照完成，reviewId={}, objectiveId={}, inserted={}", reviewId, objectiveId, inserted);
        return inserted;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void upsertParticipant(Long reviewId, Long employeeId, HrTalentParticipantDTO dto) {
        QueryWrapper<HrTalentReviewParticipant> qw = new QueryWrapper<>();
        qw.eq("tenant_id", currentTenantId()).eq("review_id", reviewId).eq("employee_id", employeeId).eq("deleted", 0);
        HrTalentReviewParticipant existing = participantMapper.selectOne(qw);
        if (existing == null) {
            existing = new HrTalentReviewParticipant();
            existing.setTenantId(currentTenantId());
            existing.setReviewId(reviewId);
            existing.setEmployeeId(employeeId);
            existing.setDeleted(0);
            existing.setCreateBy(currentUserName());
            applyParticipantPayload(existing, dto);
            existing.setGridCell(computeGridCell(existing.getPerformanceBand(), existing.getPotentialBand()));
            existing.setUpdateBy(currentUserName());
            participantMapper.insert(existing);
            return;
        }
        applyParticipantPayload(existing, dto);
        existing.setGridCell(computeGridCell(existing.getPerformanceBand(), existing.getPotentialBand()));
        existing.setDecidedBy(UserContext.getUserId());
        existing.setDecidedAt(LocalDateTime.now());
        existing.setUpdateBy(currentUserName());
        participantMapper.updateById(existing);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void moveGridCell(Long reviewId, Long employeeId, Integer gridCell) {
        if (gridCell == null || gridCell < 1 || gridCell > 9) {
            throw new HrBusinessException("INVALID_GRID_CELL", "gridCell 必须在 1-9 之间");
        }
        UpdateWrapper<HrTalentReviewParticipant> uw = new UpdateWrapper<>();
        uw.eq("review_id", reviewId)
                .eq("employee_id", employeeId)
                .eq("tenant_id", currentTenantId())
                .eq("deleted", 0)
                .set("grid_cell", gridCell)
                .set("performance_band", performanceBandFromCell(gridCell))
                .set("potential_band", potentialBandFromCell(gridCell))
                .set("decided_by", UserContext.getUserId())
                .set("decided_at", LocalDateTime.now())
                .set("update_by", currentUserName())
                .set("update_time", LocalDateTime.now());
        int rows = participantMapper.update(null, uw);
        if (rows == 0) {
            throw new HrBusinessException("PARTICIPANT_NOT_FOUND",
                    "盘点参与人不存在：reviewId=" + reviewId + ", employeeId=" + employeeId);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public String publish(Long reviewId) {
        HrTalentReview review = reviewMapper.selectById(reviewId);
        if (review == null) {
            throw new HrBusinessException("REVIEW_NOT_FOUND", "盘点活动不存在：" + reviewId);
        }
        if (!"IN_PROGRESS".equals(review.getStatus()) && !"CALIBRATING".equals(review.getStatus())) {
            throw new HrBusinessException("REVIEW_STATUS_INVALID",
                    "盘点状态 " + review.getStatus() + " 不允许发起发布审批");
        }
        ProcessStartDTO dto = new ProcessStartDTO();
        dto.setTenantId(currentTenantId());
        dto.setProcessDefinitionKey(reviewProcessKey);
        dto.setBusinessType("HR_TALENT_REVIEW");
        dto.setBusinessId(reviewId);
        dto.setBusinessNo(review.getReviewNo());
        dto.setProcessTitle("人才盘点发布-" + review.getReviewName());
        dto.setStartUserId(UserContext.getUserId());
        Map<String, Object> vars = new LinkedHashMap<>();
        vars.put("reviewId", reviewId);
        vars.put("reviewName", review.getReviewName());
        vars.put("scopeType", review.getScopeType());
        dto.setVariables(vars);
        R<String> response = workflowServiceClient.startProcess(dto);
        if (response == null || !response.isSuccess() || !StringUtils.hasText(response.getData())) {
            String msg = response == null ? "Workflow 服务无响应" : response.getMsg();
            throw new HrBusinessException("WORKFLOW_START_FAILED", "盘点发布流程启动失败：" + msg);
        }
        UpdateWrapper<HrTalentReview> uw = new UpdateWrapper<>();
        uw.eq("id", reviewId).eq("tenant_id", currentTenantId())
                .set("process_instance_id", response.getData())
                .set("status", "CALIBRATING")
                .set("update_time", LocalDateTime.now());
        reviewMapper.update(null, uw);
        log.info("人才盘点发布已提交，reviewId={}, processInstanceId={}", reviewId, response.getData());
        return response.getData();
    }

    @Override
    public Map<Integer, List<HrTalentParticipantVO>> loadNineBox(Long reviewId) {
        QueryWrapper<HrTalentReviewParticipant> qw = new QueryWrapper<>();
        qw.eq("review_id", reviewId).eq("tenant_id", currentTenantId()).eq("deleted", 0);
        List<HrTalentReviewParticipant> participants = participantMapper.selectList(qw);
        Map<Integer, List<HrTalentParticipantVO>> result = new TreeMap<>();
        for (int i = 1; i <= 9; i++) {
            result.put(i, new ArrayList<>());
        }
        for (HrTalentReviewParticipant p : participants) {
            Integer cell = p.getGridCell();
            if (cell == null || cell < 1 || cell > 9) {
                continue;
            }
            result.get(cell).add(objectMapper.convertValue(p, HrTalentParticipantVO.class));
        }
        return result;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createCalibrationSession(Long reviewId, HrTalentCalibrationSessionDTO dto) {
        HrTalentCalibrationSession session = objectMapper.convertValue(dto, HrTalentCalibrationSession.class);
        session.setTenantId(currentTenantId());
        session.setReviewId(reviewId);
        session.setStatus(StringUtils.hasText(session.getStatus()) ? session.getStatus() : "PLANNED");
        session.setDeleted(0);
        session.setCreateBy(currentUserName());
        session.setUpdateBy(currentUserName());
        if (!StringUtils.hasText(session.getSessionNo())) {
            session.setSessionNo("CAL-" + reviewId + "-" + System.currentTimeMillis());
        }
        calibrationSessionMapper.insert(session);
        return session.getId();
    }

    @Override
    public PageResult<HrTalentCalibrationSessionVO> listCalibrationSessions(Long reviewId) {
        Map<String, Object> q = new LinkedHashMap<>();
        q.put("reviewId", reviewId);
        Map<String, Object> raw = crudService.page(HrTalentCalibrationSession.class, q);
        return MapConverters.toPageResult(raw, HrTalentCalibrationSessionVO.class, objectMapper);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "更新校准会议")
    public void updateCalibrationSession(Long sessionId, HrTalentCalibrationSessionDTO dto) {
        crudService.updateProperties(HrTalentCalibrationSession.class, sessionId,
                MapConverters.toMap(dto, objectMapper));
    }

    private void applyParticipantPayload(HrTalentReviewParticipant target, HrTalentParticipantDTO dto) {
        if (dto.getPerformanceScore() != null) {
            target.setPerformanceScore(dto.getPerformanceScore());
            target.setPerformanceBand(performanceBand(target.getPerformanceScore()));
        }
        if (StringUtils.hasText(dto.getPerformanceBand())) {
            target.setPerformanceBand(dto.getPerformanceBand());
        }
        if (dto.getPotentialScore() != null) {
            target.setPotentialScore(dto.getPotentialScore());
            target.setPotentialBand(potentialBand(target.getPotentialScore()));
        }
        if (StringUtils.hasText(dto.getPotentialBand())) {
            target.setPotentialBand(dto.getPotentialBand());
        }
        if (dto.getCalibrationNotes() != null) {
            target.setCalibrationNotes(dto.getCalibrationNotes());
        }
        if (dto.getDevelopActionSummary() != null) {
            target.setDevelopActionSummary(dto.getDevelopActionSummary());
        }
    }

    private String performanceBand(BigDecimal score) {
        if (score == null) {
            return "MEDIUM";
        }
        if (score.compareTo(new BigDecimal("85")) >= 0) {
            return "HIGH";
        }
        if (score.compareTo(new BigDecimal("70")) >= 0) {
            return "MEDIUM";
        }
        return "LOW";
    }

    private String potentialBand(Integer score) {
        if (score == null) {
            return "MEDIUM";
        }
        if (score >= 4) {
            return "HIGH";
        }
        if (score == 3) {
            return "MEDIUM";
        }
        return "LOW";
    }

    private Integer computeGridCell(String performanceBand, String potentialBand) {
        int row = bandRow(performanceBand);
        int col = bandCol(potentialBand);
        return (row - 1) * 3 + col;
    }

    private int bandRow(String band) {
        if ("HIGH".equals(band)) {
            return 1;
        }
        if ("LOW".equals(band)) {
            return 3;
        }
        return 2;
    }

    private int bandCol(String band) {
        if ("HIGH".equals(band)) {
            return 1;
        }
        if ("LOW".equals(band)) {
            return 3;
        }
        return 2;
    }

    private String performanceBandFromCell(Integer cell) {
        if (cell == null) {
            return "MEDIUM";
        }
        int row = (cell - 1) / 3 + 1;
        return row == 1 ? "HIGH" : row == 2 ? "MEDIUM" : "LOW";
    }

    private String potentialBandFromCell(Integer cell) {
        if (cell == null) {
            return "MEDIUM";
        }
        int col = (cell - 1) % 3 + 1;
        return col == 1 ? "HIGH" : col == 2 ? "MEDIUM" : "LOW";
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
