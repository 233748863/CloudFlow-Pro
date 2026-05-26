package com.cloudflow.hr.service;

import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.hr.domain.dto.HrLifecycleApplicationPayload;
import com.cloudflow.hr.domain.dto.recruitment.HrRecruitmentCommonQueryDTO;
import com.cloudflow.hr.domain.entity.HrCandidate;
import com.cloudflow.hr.domain.entity.HrInterview;
import com.cloudflow.hr.domain.entity.HrOffer;
import com.cloudflow.hr.domain.entity.HrRecruitmentRequisition;
import com.cloudflow.hr.domain.vo.recruitment.HrCandidateVO;
import com.cloudflow.hr.domain.vo.recruitment.HrInterviewVO;
import com.cloudflow.hr.domain.vo.recruitment.HrOfferVO;
import com.cloudflow.hr.domain.vo.recruitment.HrRecruitmentRequisitionVO;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class HrRecruitmentService {

    private final HrTypedCrudService crudService;
    private final HrLifecycleService lifecycleService;
    private final HrViewSupport viewSupport;
    private final ObjectMapper objectMapper;

    public PageResult<HrRecruitmentRequisitionVO> pageRequisitions(HrRecruitmentCommonQueryDTO query) {
        Map<String, Object> raw = MapConverters.toServiceQuery(query, objectMapper);
        Map<String, Object> mapPage = viewSupport.mapPage(
                crudService.page(HrRecruitmentRequisition.class, raw),
                this::enrichRecruitmentRequisition);
        return MapConverters.toPageResult(mapPage, HrRecruitmentRequisitionVO.class, objectMapper);
    }

    public void changeRequisitionStatus(Long id, String action) {
        String status = switch (String.valueOf(action).toLowerCase()) {
            case "submit" -> "APPROVING";
            case "approve" -> "RECRUITING";
            case "complete" -> "COMPLETED";
            case "cancel" -> "CANCELLED";
            case "reject" -> "REJECTED";
            default -> String.valueOf(action).toUpperCase();
        };
        crudService.updateProperties(HrRecruitmentRequisition.class, id, Map.of("status", status));
    }

    public PageResult<HrCandidateVO> pageCandidates(HrRecruitmentCommonQueryDTO query) {
        Map<String, Object> raw = MapConverters.toServiceQuery(query, objectMapper);
        Map<String, Object> mapPage = viewSupport.mapPage(
                crudService.page(HrCandidate.class, raw),
                this::enrichCandidate);
        return MapConverters.toPageResult(mapPage, HrCandidateVO.class, objectMapper);
    }

    public void updateCandidateStatus(Long id, String status, String rejectReason) {
        Map<String, Object> updates = new LinkedHashMap<>();
        updates.put("status", status);
        updates.put("rejectReason", rejectReason == null ? "" : rejectReason);
        crudService.updateProperties(HrCandidate.class, id, updates);
    }

    public List<HrInterviewVO> listInterviews(HrRecruitmentCommonQueryDTO query) {
        Map<String, Object> raw = MapConverters.toServiceQuery(query, objectMapper);
        return crudService.list(HrInterview.class, raw).stream()
                .map(this::enrichInterview)
                .map(row -> objectMapper.convertValue(row, HrInterviewVO.class))
                .toList();
    }

    public List<HrOfferVO> listOffers(HrRecruitmentCommonQueryDTO query) {
        Map<String, Object> raw = MapConverters.toServiceQuery(query, objectMapper);
        return crudService.list(HrOffer.class, raw).stream()
                .map(this::enrichOffer)
                .map(row -> objectMapper.convertValue(row, HrOfferVO.class))
                .toList();
    }

    public Long convertOfferToOnboarding(Long offerId) {
        Map<String, Object> offer = enrichOffer(crudService.get(HrOffer.class, offerId));
        if (offer.isEmpty()) {
            throw new IllegalArgumentException("Offer不存在");
        }

        Long candidateId = viewSupport.toLong(offer.get("candidateId"));
        if (candidateId != null) {
            Long existedId = lifecycleService.findApplicationIdByCandidate(candidateId, "ONBOARDING");
            if (existedId != null) {
                return existedId;
            }
        }

        HrLifecycleApplicationPayload payload = new HrLifecycleApplicationPayload();
        payload.setApplicationNo(viewSupport.nextNo("HRLC"));
        payload.setType("ONBOARDING");
        payload.setCandidateId(candidateId);
        payload.setName(String.valueOf(offer.getOrDefault("candidateName", "")));
        payload.setDeptId(viewSupport.toLong(offer.get("deptId")));
        payload.setPositionId(viewSupport.toLong(offer.get("positionId")));
        payload.setEffectiveDate((java.time.LocalDate) viewSupport.firstValue(offer, "expectedDate", "expectedArrivalDate"));
        payload.setStatus("DRAFT");
        payload.setRemark("Offer转入入职办理");
        return lifecycleService.createApplication(payload);
    }

    private Map<String, Object> enrichRecruitmentRequisition(Map<String, Object> row) {
        if (row.isEmpty()) {
            return row;
        }
        Map<String, Object> result = new LinkedHashMap<>(row);
        result.put("requestNo", viewSupport.firstValue(result, "requestNo", "requisitionNo"));
        result.put("expectedDate", viewSupport.firstValue(result, "expectedDate", "expectedArrivalDate"));
        result.put("jobRequirements", viewSupport.firstValue(result, "jobRequirements", "requirements"));
        viewSupport.putStatusDesc(result);
        viewSupport.putDeptName(result);
        viewSupport.putPositionSnapshot(result);
        return result;
    }

    private Map<String, Object> enrichCandidate(Map<String, Object> row) {
        if (row.isEmpty()) {
            return row;
        }
        Map<String, Object> result = new LinkedHashMap<>(row);
        result.put("requestId", viewSupport.firstValue(result, "requestId", "requisitionId"));
        viewSupport.putStatusDesc(result);
        result.put("sourceDesc", viewSupport.sourceDesc(result.get("source")));
        Long requisitionId = viewSupport.toLong(viewSupport.firstValue(result, "requisitionId", "requestId"));
        if (requisitionId != null) {
            Map<String, Object> requisition = enrichRecruitmentRequisition(crudService.get(HrRecruitmentRequisition.class, requisitionId));
            result.putIfAbsent("requisitionNo", requisition.get("requisitionNo"));
            result.putIfAbsent("requestNo", requisition.get("requestNo"));
            result.putIfAbsent("deptId", requisition.get("deptId"));
            result.putIfAbsent("deptName", requisition.get("deptName"));
            result.putIfAbsent("positionId", requisition.get("positionId"));
            result.putIfAbsent("positionName", requisition.get("positionName"));
            result.putIfAbsent("expectedDate", requisition.get("expectedDate"));
        }
        return result;
    }

    private Map<String, Object> enrichInterview(Map<String, Object> row) {
        if (row.isEmpty()) {
            return row;
        }
        Map<String, Object> result = new LinkedHashMap<>(row);
        viewSupport.putStatusDesc(result);
        result.put("interviewRoundName", viewSupport.interviewRoundName(result.get("interviewRound")));
        result.put("interviewTypeName", viewSupport.interviewTypeName(result.get("interviewType")));
        result.put("meetingRoomName", viewSupport.firstValue(result, "meetingRoomName", "location"));
        Long candidateId = viewSupport.toLong(result.get("candidateId"));
        if (candidateId != null) {
            Map<String, Object> candidate = enrichCandidate(crudService.get(HrCandidate.class, candidateId));
            result.putIfAbsent("candidateName", candidate.get("name"));
            result.putIfAbsent("positionName", candidate.get("positionName"));
        }
        return result;
    }

    private Map<String, Object> enrichOffer(Map<String, Object> row) {
        if (row.isEmpty()) {
            return row;
        }
        Map<String, Object> result = new LinkedHashMap<>(row);
        result.put("expectedDate", viewSupport.firstValue(result, "expectedDate", "expectedArrivalDate"));
        result.put("expiryDate", viewSupport.firstValue(result, "expiryDate", "expireDate"));
        viewSupport.putStatusDesc(result);
        viewSupport.putPositionSnapshot(result);
        Long candidateId = viewSupport.toLong(result.get("candidateId"));
        if (candidateId != null) {
            Map<String, Object> candidate = enrichCandidate(crudService.get(HrCandidate.class, candidateId));
            result.putIfAbsent("candidateName", candidate.get("name"));
            result.putIfAbsent("deptId", candidate.get("deptId"));
            result.putIfAbsent("deptName", candidate.get("deptName"));
            if (result.get("positionId") == null) {
                result.put("positionId", candidate.get("positionId"));
                viewSupport.putPositionSnapshot(result);
            }
            result.putIfAbsent("positionName", candidate.get("positionName"));
        }
        return result;
    }
}
