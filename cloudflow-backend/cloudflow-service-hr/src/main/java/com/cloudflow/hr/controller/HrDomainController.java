package com.cloudflow.hr.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.service.HrDomainCrudService;
import com.cloudflow.hr.service.HrPerformanceService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping
@RequiredArgsConstructor
public class HrDomainController {

    private final HrDomainCrudService crudService;
    private final HrPerformanceService performanceService;

    @GetMapping("/employees/current")
    public R<Map<String, Object>> currentEmployee() {
        return R.ok(crudService.list("hr_employee", Map.of()).stream().findFirst().orElse(Map.of()));
    }

    @GetMapping("/employees")
    public R<?> listEmployees(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list("hr_employee", query));
    }

    @PostMapping("/employees")
    public R<Long> createEmployee(@RequestBody Map<String, Object> payload) {
        return R.ok(crudService.create("hr_employee", payload));
    }

    @GetMapping("/employees/{id}")
    public R<Map<String, Object>> getEmployee(@PathVariable Long id) {
        return R.ok(crudService.get("hr_employee", id));
    }

    @PutMapping("/employees/{id}")
    public R<Void> updateEmployee(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        crudService.update("hr_employee", id, payload);
        return R.ok();
    }

    @DeleteMapping("/employees/{id}")
    public R<Void> deleteEmployee(@PathVariable Long id) {
        crudService.delete("hr_employee", id);
        return R.ok();
    }

    @GetMapping("/employees/{employeeId}/contracts")
    public R<?> listContracts(@PathVariable Long employeeId) {
        return R.ok(crudService.list("hr_employee_contract", Map.of("employeeId", employeeId)));
    }

    @PostMapping("/employees/contracts")
    public R<Long> createContract(@RequestBody Map<String, Object> payload) {
        return R.ok(crudService.create("hr_employee_contract", payload));
    }

    @PutMapping("/employees/contracts/{id}")
    public R<Void> updateContract(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        crudService.update("hr_employee_contract", id, payload);
        return R.ok();
    }

    @DeleteMapping("/employees/contracts/{id}")
    public R<Void> deleteContract(@PathVariable Long id) {
        crudService.delete("hr_employee_contract", id);
        return R.ok();
    }

    @GetMapping("/employees/{employeeId}/documents")
    public R<?> listDocuments(@PathVariable Long employeeId) {
        return R.ok(crudService.list("hr_employee_document", Map.of("employeeId", employeeId)));
    }

    @PostMapping("/employees/documents")
    public R<Long> createDocument(@RequestBody Map<String, Object> payload) {
        return R.ok(crudService.create("hr_employee_document", payload));
    }

    @PutMapping("/employees/documents/{id}")
    public R<Void> updateDocument(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        crudService.update("hr_employee_document", id, payload);
        return R.ok();
    }

    @DeleteMapping("/employees/documents/{id}")
    public R<Void> deleteDocument(@PathVariable Long id) {
        crudService.delete("hr_employee_document", id);
        return R.ok();
    }

    @GetMapping("/employees/{employeeId}/emergency-contacts")
    public R<?> listContacts(@PathVariable Long employeeId) {
        return R.ok(crudService.list("hr_emergency_contact", Map.of("employeeId", employeeId)));
    }

    @PostMapping("/employees/emergency-contacts")
    public R<Long> createContact(@RequestBody Map<String, Object> payload) {
        return R.ok(crudService.create("hr_emergency_contact", payload));
    }

    @PutMapping("/employees/emergency-contacts/{id}")
    public R<Void> updateContact(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        crudService.update("hr_emergency_contact", id, payload);
        return R.ok();
    }

    @DeleteMapping("/employees/emergency-contacts/{id}")
    public R<Void> deleteContact(@PathVariable Long id) {
        crudService.delete("hr_emergency_contact", id);
        return R.ok();
    }

    @GetMapping("/organization/families")
    public R<?> listFamilies(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list("hr_position_family", query));
    }

    @PostMapping("/organization/families")
    public R<Long> createFamily(@RequestBody Map<String, Object> payload) {
        return R.ok(crudService.create("hr_position_family", payload));
    }

    @PutMapping("/organization/families/{id}")
    public R<Void> updateFamily(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        crudService.update("hr_position_family", id, payload);
        return R.ok();
    }

    @DeleteMapping("/organization/families/{id}")
    public R<Void> deleteFamily(@PathVariable Long id) {
        crudService.delete("hr_position_family", id);
        return R.ok();
    }

    @GetMapping("/organization/levels")
    public R<?> listLevels(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list("hr_job_level", query));
    }

    @PostMapping("/organization/levels")
    public R<Long> createLevel(@RequestBody Map<String, Object> payload) {
        return R.ok(crudService.create("hr_job_level", payload));
    }

    @PutMapping("/organization/levels/{id}")
    public R<Void> updateLevel(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        crudService.update("hr_job_level", id, payload);
        return R.ok();
    }

    @DeleteMapping("/organization/levels/{id}")
    public R<Void> deleteLevel(@PathVariable Long id) {
        crudService.delete("hr_job_level", id);
        return R.ok();
    }

    @GetMapping("/organization/positions")
    public R<?> listPositions(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list("hr_position", query));
    }

    @PostMapping("/organization/positions")
    public R<Long> createPosition(@RequestBody Map<String, Object> payload) {
        return R.ok(crudService.create("hr_position", payload));
    }

    @PutMapping("/organization/positions/{id}")
    public R<Void> updatePosition(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        crudService.update("hr_position", id, payload);
        return R.ok();
    }

    @DeleteMapping("/organization/positions/{id}")
    public R<Void> deletePosition(@PathVariable Long id) {
        crudService.delete("hr_position", id);
        return R.ok();
    }

    @GetMapping("/organization/headcounts")
    public R<?> listHeadcounts(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list("hr_headcount", query));
    }

    @PostMapping("/organization/headcounts")
    public R<Long> createHeadcount(@RequestBody Map<String, Object> payload) {
        return R.ok(crudService.create("hr_headcount", payload));
    }

    @PutMapping("/organization/headcounts/{id}")
    public R<Void> updateHeadcount(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        crudService.update("hr_headcount", id, payload);
        return R.ok();
    }

    @PutMapping("/organization/headcounts/{id}/actual-count")
    public R<Void> updateHeadcountActualCount(@PathVariable Long id, @RequestParam Integer actualCount) {
        crudService.setHeadcountActualCount(id, actualCount);
        return R.ok();
    }

    @GetMapping("/organization/headcounts/{id}/statistics")
    public R<Map<String, Object>> getHeadcountStatistics(@PathVariable Long id) {
        return R.ok(crudService.getHeadcountStatistics(id));
    }

    @GetMapping("/recruitment/requisitions")
    public R<?> listRequisitions(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.pageRecruitmentRequisitions(query));
    }

    @PostMapping("/recruitment/requisitions")
    public R<Long> createRequisition(@RequestBody Map<String, Object> payload) {
        return R.ok(crudService.create("hr_recruitment_requisition", payload));
    }

    @PutMapping("/recruitment/requisitions/{id}")
    public R<Void> updateRequisition(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        crudService.update("hr_recruitment_requisition", id, payload);
        return R.ok();
    }

    @PostMapping("/recruitment/requisitions/{id}/{action}")
    public R<Void> changeRequisitionStatus(@PathVariable Long id, @PathVariable String action) {
        crudService.changeRecruitmentRequisitionStatus(id, action);
        return R.ok();
    }

    @GetMapping("/recruitment/candidates")
    public R<?> listCandidates(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.pageCandidates(query));
    }

    @PostMapping("/recruitment/candidates")
    public R<Long> createCandidate(@RequestBody Map<String, Object> payload) {
        return R.ok(crudService.create("hr_candidate", payload));
    }

    @PutMapping("/recruitment/candidates/{id}")
    public R<Void> updateCandidate(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        crudService.update("hr_candidate", id, payload);
        return R.ok();
    }

    @PutMapping("/recruitment/candidates/{id}/status")
    public R<Void> updateCandidateStatus(@PathVariable Long id, @RequestParam String status, @RequestParam(required = false) String rejectReason) {
        crudService.update("hr_candidate", id, Map.of("status", status, "rejectReason", rejectReason == null ? "" : rejectReason));
        return R.ok();
    }

    @GetMapping("/recruitment/interviews")
    public R<?> listInterviews(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.listInterviews(query));
    }

    @PostMapping("/recruitment/interviews")
    public R<Long> createInterview(@RequestBody Map<String, Object> payload) {
        return R.ok(crudService.create("hr_interview", payload));
    }

    @PutMapping("/recruitment/interviews/{id}")
    public R<Void> updateInterview(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        crudService.update("hr_interview", id, payload);
        return R.ok();
    }

    @PostMapping("/recruitment/interviews/{id}/{action}")
    public R<Void> changeInterviewStatus(@PathVariable Long id, @PathVariable String action) {
        crudService.changeStatus("hr_interview", id, action);
        return R.ok();
    }

    @GetMapping("/recruitment/offers")
    public R<?> listOffers(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.listOffers(query));
    }

    @PostMapping("/recruitment/offers")
    public R<Long> createOffer(@RequestBody Map<String, Object> payload) {
        return R.ok(crudService.create("hr_offer", payload));
    }

    @PutMapping("/recruitment/offers/{id}")
    public R<Void> updateOffer(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        crudService.update("hr_offer", id, payload);
        return R.ok();
    }

    @PostMapping("/recruitment/offers/{id}/convert-to-onboarding")
    public R<Long> convertOfferToOnboarding(@PathVariable Long id) {
        return R.ok(crudService.convertOfferToOnboarding(id));
    }

    @PostMapping("/recruitment/offers/{id}/{action}")
    public R<Void> changeOfferStatus(@PathVariable Long id, @PathVariable String action) {
        crudService.changeStatus("hr_offer", id, action);
        return R.ok();
    }

    @GetMapping("/lifecycle/applications")
    public R<?> listLifecycleApplications(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.listLifecycleApplications(query));
    }

    @PostMapping("/lifecycle/applications")
    public R<Long> createLifecycleApplication(@RequestBody Map<String, Object> payload) {
        return R.ok(crudService.createLifecycleApplication(payload));
    }

    @PutMapping("/lifecycle/applications/{id}")
    public R<Void> updateLifecycleApplication(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        crudService.updateLifecycleApplication(id, payload);
        return R.ok();
    }

    @PostMapping("/lifecycle/applications/{id}/{action}")
    public R<Void> changeLifecycleStatus(@PathVariable Long id, @PathVariable String action, @RequestBody(required = false) Map<String, Object> payload) {
        crudService.changeLifecycleStatus(id, action, payload);
        return R.ok();
    }

    @GetMapping("/lifecycle/applications/{id}/details")
    public R<?> listLifecycleDetails(@PathVariable Long id) {
        return R.ok(crudService.list("hr_lifecycle_detail", Map.of("applicationId", id)));
    }

    @GetMapping("/lifecycle/applications/{id}/tasks")
    public R<?> listLifecycleTasks(@PathVariable Long id) {
        return R.ok(crudService.list("hr_lifecycle_task", Map.of("applicationId", id)));
    }

    @PostMapping("/lifecycle/tasks/{id}/complete")
    public R<Void> completeLifecycleTask(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> payload) {
        crudService.completeLifecycleTask(id, payload);
        return R.ok();
    }

    @GetMapping("/attendance/shifts")
    public R<?> listShifts(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list("hr_shift", query));
    }

    @PostMapping("/attendance/shifts")
    public R<Long> createShift(@RequestBody Map<String, Object> payload) {
        return R.ok(crudService.create("hr_shift", payload));
    }

    @PutMapping("/attendance/shifts/{id}")
    public R<Void> updateShift(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        crudService.update("hr_shift", id, payload);
        return R.ok();
    }

    @DeleteMapping("/attendance/shifts/{id}")
    public R<Void> deleteShift(@PathVariable Long id) {
        crudService.delete("hr_shift", id);
        return R.ok();
    }

    @GetMapping("/attendance/rules")
    public R<?> listAttendanceRules(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list("hr_attendance_rule", query));
    }

    @PostMapping("/attendance/rules")
    public R<Long> createAttendanceRule(@RequestBody Map<String, Object> payload) {
        return R.ok(crudService.create("hr_attendance_rule", payload));
    }

    @PutMapping("/attendance/rules/{id}")
    public R<Void> updateAttendanceRule(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        crudService.update("hr_attendance_rule", id, payload);
        return R.ok();
    }

    @DeleteMapping("/attendance/rules/{id}")
    public R<Void> deleteAttendanceRule(@PathVariable Long id) {
        crudService.delete("hr_attendance_rule", id);
        return R.ok();
    }

    @GetMapping("/attendance/schedules")
    public R<?> listSchedules(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list("hr_schedule_assignment", query));
    }

    @PostMapping("/attendance/schedules")
    public R<Long> createSchedule(@RequestBody Map<String, Object> payload) {
        return R.ok(crudService.create("hr_schedule_assignment", payload));
    }

    @PutMapping("/attendance/schedules/{id}")
    public R<Void> updateSchedule(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        crudService.update("hr_schedule_assignment", id, payload);
        return R.ok();
    }

    @DeleteMapping("/attendance/schedules/{id}")
    public R<Void> deleteSchedule(@PathVariable Long id) {
        crudService.delete("hr_schedule_assignment", id);
        return R.ok();
    }

    @GetMapping("/attendance/records")
    public R<?> listAttendanceRecords(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list("hr_attendance_record", query));
    }

    @PostMapping("/attendance/records")
    public R<Long> createAttendanceRecord(@RequestBody Map<String, Object> payload) {
        return R.ok(crudService.create("hr_attendance_record", payload));
    }

    @GetMapping("/attendance/monthly")
    public R<?> listAttendanceMonthly(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list("hr_attendance_monthly", query));
    }

    @GetMapping("/attendance/leave-types")
    public R<?> listLeaveTypes(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list("hr_leave_type", query));
    }

    @PostMapping("/attendance/leave-types")
    public R<Long> createLeaveType(@RequestBody Map<String, Object> payload) {
        return R.ok(crudService.create("hr_leave_type", payload));
    }

    @GetMapping("/attendance/leave-quotas")
    public R<?> listLeaveQuotas(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list("hr_leave_quota", query));
    }

    @PostMapping("/attendance/leave-quotas")
    public R<Long> createLeaveQuota(@RequestBody Map<String, Object> payload) {
        return R.ok(crudService.create("hr_leave_quota", payload));
    }

    @PutMapping("/attendance/leave-quotas/{id}")
    public R<Void> updateLeaveQuota(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        crudService.update("hr_leave_quota", id, payload);
        return R.ok();
    }

    @GetMapping("/attendance/time-requests")
    public R<?> listTimeRequests(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list("hr_time_request", query));
    }

    @PostMapping("/attendance/time-requests")
    public R<Long> createTimeRequest(@RequestBody Map<String, Object> payload) {
        return R.ok(crudService.create("hr_time_request", payload));
    }

    @PutMapping("/attendance/time-requests/{id}")
    public R<Void> updateTimeRequest(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        crudService.update("hr_time_request", id, payload);
        return R.ok();
    }

    @DeleteMapping("/attendance/time-requests/{id}")
    public R<Void> deleteTimeRequest(@PathVariable Long id) {
        crudService.delete("hr_time_request", id);
        return R.ok();
    }

    @PostMapping("/attendance/time-requests/{id}/{action}")
    public R<Void> changeTimeRequestStatus(@PathVariable Long id, @PathVariable String action) {
        crudService.changeStatus("hr_time_request", id, action);
        return R.ok();
    }

    @GetMapping("/compensation/components")
    public R<?> listCompComponents(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list("hr_comp_component", query));
    }

    @PostMapping("/compensation/components")
    public R<Long> createCompComponent(@RequestBody Map<String, Object> payload) {
        return R.ok(crudService.create("hr_comp_component", payload));
    }

    @PutMapping("/compensation/components/{id}")
    public R<Void> updateCompComponent(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        crudService.update("hr_comp_component", id, payload);
        return R.ok();
    }

    @DeleteMapping("/compensation/components/{id}")
    public R<Void> deleteCompComponent(@PathVariable Long id) {
        crudService.delete("hr_comp_component", id);
        return R.ok();
    }

    @GetMapping("/compensation/structures")
    public R<?> listCompStructures(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list("hr_comp_structure", query));
    }

    @PostMapping("/compensation/structures")
    public R<Long> createCompStructure(@RequestBody Map<String, Object> payload) {
        return R.ok(crudService.create("hr_comp_structure", payload));
    }

    @PutMapping("/compensation/structures/{id}")
    public R<Void> updateCompStructure(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        crudService.update("hr_comp_structure", id, payload);
        return R.ok();
    }

    @DeleteMapping("/compensation/structures/{id}")
    public R<Void> deleteCompStructure(@PathVariable Long id) {
        crudService.delete("hr_comp_structure", id);
        return R.ok();
    }

    @GetMapping("/compensation/grades")
    public R<?> listCompGrades(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list("hr_comp_grade", query));
    }

    @PostMapping("/compensation/grades")
    public R<Long> createCompGrade(@RequestBody Map<String, Object> payload) {
        return R.ok(crudService.create("hr_comp_grade", payload));
    }

    @DeleteMapping("/compensation/grades/{id}")
    public R<Void> deleteCompGrade(@PathVariable Long id) {
        crudService.delete("hr_comp_grade", id);
        return R.ok();
    }

    @GetMapping("/compensation/employee-compensations")
    public R<?> listEmployeeCompensations(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list("hr_employee_comp", query));
    }

    @PostMapping("/compensation/employee-compensations")
    public R<Long> createEmployeeCompensation(@RequestBody Map<String, Object> payload) {
        return R.ok(crudService.create("hr_employee_comp", payload));
    }

    @PutMapping("/compensation/employee-compensations/{id}")
    public R<Void> updateEmployeeCompensation(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        crudService.update("hr_employee_comp", id, payload);
        return R.ok();
    }

    @GetMapping("/compensation/changes")
    public R<?> listCompChanges(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.page("hr_comp_change", query));
    }

    @PostMapping("/compensation/changes")
    public R<Long> createCompChange(@RequestBody Map<String, Object> payload) {
        return R.ok(crudService.create("hr_comp_change", payload));
    }

    @PostMapping("/compensation/changes/{id}/{action}")
    public R<Void> changeCompChangeStatus(@PathVariable Long id, @PathVariable String action) {
        crudService.changeStatus("hr_comp_change", id, action);
        return R.ok();
    }

    @GetMapping("/compensation/benefits")
    public R<?> listBenefits(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list("hr_benefit_scheme", query));
    }

    @PostMapping("/compensation/benefits")
    public R<Long> createBenefit(@RequestBody Map<String, Object> payload) {
        return R.ok(crudService.create("hr_benefit_scheme", payload));
    }

    @PutMapping("/compensation/benefits/{id}")
    public R<Void> updateBenefit(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        crudService.update("hr_benefit_scheme", id, payload);
        return R.ok();
    }

    @GetMapping("/compensation/employee-benefits")
    public R<?> listEmployeeBenefits(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list("hr_employee_benefit", query));
    }

    @PostMapping("/compensation/employee-benefits")
    public R<Long> createEmployeeBenefit(@RequestBody Map<String, Object> payload) {
        return R.ok(crudService.create("hr_employee_benefit", payload));
    }

    @GetMapping("/compensation/tax-profiles")
    public R<?> listTaxProfiles(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list("hr_tax_profile", query));
    }

    @PostMapping("/compensation/tax-profiles")
    public R<Long> createTaxProfile(@RequestBody Map<String, Object> payload) {
        return R.ok(crudService.create("hr_tax_profile", payload));
    }

    @PutMapping("/compensation/tax-profiles/{id}")
    public R<Void> updateTaxProfile(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        crudService.update("hr_tax_profile", id, payload);
        return R.ok();
    }

    @GetMapping("/compensation/tax-deductions")
    public R<?> listTaxDeductions(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list("hr_tax_deduction", query));
    }

    @PostMapping("/compensation/tax-deductions")
    public R<Long> createTaxDeduction(@RequestBody Map<String, Object> payload) {
        return R.ok(crudService.create("hr_tax_deduction", payload));
    }

    @PutMapping("/compensation/tax-deductions/{id}")
    public R<Void> updateTaxDeduction(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        crudService.update("hr_tax_deduction", id, payload);
        return R.ok();
    }

    @DeleteMapping("/compensation/tax-deductions/{id}")
    public R<Void> deleteTaxDeduction(@PathVariable Long id) {
        crudService.delete("hr_tax_deduction", id);
        return R.ok();
    }

    @GetMapping("/performance/objectives")
    public R<?> listPerformanceObjectives(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.page("hr_performance_objective", query));
    }

    @PostMapping("/performance/objectives")
    public R<Long> createPerformanceObjective(@RequestBody Map<String, Object> payload) {
        return R.ok(crudService.create("hr_performance_objective", payload));
    }

    @PostMapping("/performance/objectives/{id}/{action}")
    public R<Void> changePerformanceObjectiveStatus(@PathVariable Long id, @PathVariable String action) {
        crudService.changeStatus("hr_performance_objective", id, action);
        return R.ok();
    }

    @GetMapping("/performance/assignments")
    public R<?> listPerformanceAssignments(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list("hr_performance_assignment", query));
    }

    @PostMapping("/performance/assignments")
    public R<Long> createPerformanceAssignment(@RequestBody Map<String, Object> payload) {
        return R.ok(crudService.create("hr_performance_assignment", payload));
    }

    @GetMapping("/performance/results")
    public R<?> listPerformanceResults(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list("hr_performance_result", query));
    }

    @PostMapping("/performance/results")
    public R<Long> createPerformanceResult(@RequestBody Map<String, Object> payload) {
        return R.ok(crudService.create("hr_performance_result", payload));
    }

    @GetMapping("/performance/salary-adjustments")
    public R<?> listPerformanceSalaryAdjustments(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list("hr_performance_salary_adjustment", query));
    }

    @PostMapping("/performance/salary-adjustments")
    public R<Long> createPerformanceSalaryAdjustment(@RequestBody Map<String, Object> payload) {
        return R.ok(crudService.create("hr_performance_salary_adjustment", payload));
    }

    @PostMapping("/performance/objective")
    public R<Long> createPerformanceObjectiveV2(@RequestBody Map<String, Object> payload) {
        return R.ok(performanceService.createObjective(payload));
    }

    @GetMapping("/performance/objective/list")
    public R<?> listPerformanceObjectiveV2(@RequestParam Map<String, Object> query) {
        return R.ok(performanceService.listObjectives(query));
    }

    @GetMapping("/performance/objective/{id}")
    public R<?> getPerformanceObjective(@PathVariable Long id) {
        return R.ok(performanceService.getObjectiveTree(id));
    }

    @GetMapping("/performance/objective/{id}/tree")
    public R<?> getPerformanceObjectiveTree(@PathVariable Long id) {
        return R.ok(performanceService.getObjectiveTree(id));
    }

    @GetMapping("/performance/overview")
    public R<?> getPerformanceOverview() {
        return R.ok(performanceService.getOverview());
    }

    @PostMapping("/performance/assignment/{parentId}/children")
    public R<Void> savePerformanceAssignmentChildren(@PathVariable Long parentId, @RequestBody Map<String, Object> payload) {
        performanceService.saveAssignmentChildren(parentId, payload);
        return R.ok();
    }

    @PostMapping("/performance/result")
    public R<Void> updatePerformanceResultV2(@RequestBody Map<String, Object> payload) {
        performanceService.updateResult(payload);
        return R.ok();
    }

    @PostMapping("/performance/objective/{id}/submit-plan")
    public R<Void> submitPerformancePlan(@PathVariable Long id) {
        performanceService.submitPlan(id);
        return R.ok();
    }

    @PostMapping("/performance/objective/{id}/submit-result")
    public R<Void> submitPerformanceResultV2(@PathVariable Long id) {
        performanceService.submitResult(id);
        return R.ok();
    }

    @PostMapping("/performance/objective/{id}/salary-adjustment")
    public R<Long> createPerformanceSalaryAdjustmentV2(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        return R.ok(performanceService.createSalaryAdjustment(id, payload));
    }
}
