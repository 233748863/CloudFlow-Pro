package com.cloudflow.hr.service;

import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.hr.domain.dto.HrLifecycleApplicationPayload;
import com.cloudflow.hr.domain.dto.recruitment.HrRecruitmentCommonQueryDTO;
import com.cloudflow.hr.domain.entity.HrCandidate;
import com.cloudflow.hr.domain.entity.HrInterview;
import com.cloudflow.hr.domain.entity.HrOffer;
import com.cloudflow.hr.domain.entity.HrPosition;
import com.cloudflow.hr.domain.entity.HrRecruitmentRequisition;
import com.cloudflow.hr.mapper.HrLookupMapper;
import com.cloudflow.hr.domain.vo.recruitment.HrCandidateVO;
import com.cloudflow.hr.domain.vo.recruitment.HrInterviewVO;
import com.cloudflow.hr.domain.vo.recruitment.HrOfferVO;
import com.cloudflow.hr.domain.vo.recruitment.HrRecruitmentRequisitionVO;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class HrRecruitmentService {

    private final HrTypedCrudService crudService;
    private final HrLifecycleService lifecycleService;
    private final HrViewSupport viewSupport;
    private final ObjectMapper objectMapper;
    private final HrLookupMapper lookupMapper;

    public PageResult<HrRecruitmentRequisitionVO> pageRequisitions(HrRecruitmentCommonQueryDTO query) {
        Map<String, Object> raw = MapConverters.toServiceQuery(query, objectMapper);
        Map<String, Object> mapPage = crudService.page(HrRecruitmentRequisition.class, raw);
        enrich(rows(mapPage), HrRecruitmentRequisition.class);
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
        Map<String, Object> mapPage = crudService.page(HrCandidate.class, raw);
        enrich(rows(mapPage), HrCandidate.class);
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
        List<Map<String, Object>> rows = crudService.list(HrInterview.class, raw);
        enrich(rows, HrInterview.class);
        return rows.stream()
                .map(row -> objectMapper.convertValue(row, HrInterviewVO.class))
                .toList();
    }

    public List<HrOfferVO> listOffers(HrRecruitmentCommonQueryDTO query) {
        Map<String, Object> raw = MapConverters.toServiceQuery(query, objectMapper);
        List<Map<String, Object>> rows = crudService.list(HrOffer.class, raw);
        enrich(rows, HrOffer.class);
        return rows.stream()
                .map(row -> objectMapper.convertValue(row, HrOfferVO.class))
                .toList();
    }

    public Long convertOfferToOnboarding(Long offerId) {
        Map<String, Object> offer = crudService.get(HrOffer.class, offerId);
        if (offer.isEmpty()) {
            throw new IllegalArgumentException("Offer不存在");
        }
        enrich(List.of(offer), HrOffer.class);

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
        payload.setEffectiveDate(objectMapper.convertValue(offer.get("expectedArrivalDate"), java.time.LocalDate.class));
        payload.setStatus("DRAFT");
        payload.setRemark("Offer转入入职办理");
        return lifecycleService.createApplication(payload);
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> rows(Map<String, Object> page) {
        return (List<Map<String, Object>>) page.get("records");
    }

    /** 本次列表的关联记录统一读取，沿用通用 CRUD 的权限和脱敏规则。 */
    private void enrich(List<Map<String, Object>> rows, Class<?> rowType) {
        if (rows.isEmpty()) return;
        Map<Long, Map<String, Object>> candidates = rowType == HrCandidate.class ? index(rows)
                : crudService.getMany(HrCandidate.class, ids(rows, "candidateId"));
        Map<Long, Map<String, Object>> requisitions = rowType == HrRecruitmentRequisition.class ? index(rows)
                : crudService.getMany(HrRecruitmentRequisition.class, ids(candidates.values(), "requisitionId"));
        List<Map<String, Object>> related = new ArrayList<>(rows);
        related.addAll(requisitions.values());
        Map<Long, Map<String, Object>> positions = crudService.getMany(HrPosition.class, ids(related, "positionId"));
        Map<Long, String> departments = new LinkedHashMap<>();
        List<Long> deptIds = ids(related, "deptId");
        if (!deptIds.isEmpty()) {
            for (HrLookupMapper.NamedReference department : lookupMapper.findDeptNames(HrRuleSupport.tenantId(), deptIds)) {
                departments.put(department.id(), department.name());
            }
        }
        for (Map<String, Object> requisition : requisitions.values()) {
            viewSupport.putStatusDesc(requisition);
            requisition.putIfAbsent("deptName", departments.get(viewSupport.toLong(requisition.get("deptId"))));
            putPosition(requisition, positions);
        }
        for (Map<String, Object> candidate : candidates.values()) {
            viewSupport.putStatusDesc(candidate);
            candidate.put("sourceDesc", viewSupport.sourceDesc(candidate.get("source")));
            Map<String, Object> requisition = requisitions.get(viewSupport.toLong(candidate.get("requisitionId")));
            if (requisition != null) {
                for (String field : List.of("requisitionNo", "deptId", "deptName", "positionId", "positionName", "expectedArrivalDate")) {
                    candidate.putIfAbsent(field, requisition.get(field));
                }
            }
        }
        if (rowType != HrInterview.class && rowType != HrOffer.class) return;
        for (Map<String, Object> row : rows) {
            viewSupport.putStatusDesc(row);
            if (rowType == HrInterview.class) {
                row.put("interviewRoundName", viewSupport.interviewRoundName(row.get("interviewRound")));
                row.put("interviewTypeName", viewSupport.interviewTypeName(row.get("interviewType")));
                row.putIfAbsent("meetingRoomName", row.get("location"));
            }
            Map<String, Object> candidate = candidates.get(viewSupport.toLong(row.get("candidateId")));
            if (candidate != null) {
                row.putIfAbsent("candidateName", candidate.get("name"));
                if (rowType == HrOffer.class) {
                    for (String field : List.of("deptId", "deptName", "positionId")) row.putIfAbsent(field, candidate.get(field));
                }
            }
            if (rowType == HrOffer.class) putPosition(row, positions);
            if (candidate != null) row.putIfAbsent("positionName", candidate.get("positionName"));
        }
    }

    private void putPosition(Map<String, Object> row, Map<Long, Map<String, Object>> positions) {
        Map<String, Object> position = positions.get(viewSupport.toLong(row.get("positionId")));
        if (position == null) return;
        for (String field : List.of("positionName", "positionCode", "postId")) row.putIfAbsent(field, position.get(field));
    }

    private Map<Long, Map<String, Object>> index(Collection<Map<String, Object>> rows) {
        Map<Long, Map<String, Object>> indexed = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) indexed.put(viewSupport.toLong(row.get("id")), row);
        return indexed;
    }

    private List<Long> ids(Collection<Map<String, Object>> rows, String field) {
        LinkedHashSet<Long> identifiers = new LinkedHashSet<>();
        for (Map<String, Object> row : rows) {
            Long id = viewSupport.toLong(row.get(field));
            if (id != null) identifiers.add(id);
        }
        return List.copyOf(identifiers);
    }
}
