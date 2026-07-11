package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.hr.domain.dto.HrEmergencyContactPayload;
import com.cloudflow.hr.domain.dto.HrEmployeeContractPayload;
import com.cloudflow.hr.domain.dto.HrEmployeeDocumentPayload;
import com.cloudflow.hr.domain.dto.HrEmployeePayload;
import com.cloudflow.hr.domain.dto.employee.HrEmployeeCommonQueryDTO;
import com.cloudflow.hr.domain.entity.HrEmergencyContact;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrEmployeeContract;
import com.cloudflow.hr.domain.entity.HrEmployeeDocument;
import com.cloudflow.hr.domain.vo.employee.HrEmergencyContactVO;
import com.cloudflow.hr.domain.vo.employee.HrEmployeeContractVO;
import com.cloudflow.hr.domain.vo.employee.HrEmployeeDocumentVO;
import com.cloudflow.hr.domain.vo.employee.HrEmployeeVO;
import com.cloudflow.hr.domain.vo.employee.HrEmployeeOnboardingResultVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.service.HrEmployeeOnboardingService;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/employees")
@RequiredArgsConstructor
class HrEmployeeController {

    private final HrTypedCrudService crudService;
    private final HrEmployeeOnboardingService onboardingService;
    private final ObjectMapper objectMapper;

    @GetMapping("/current")
    @SaCheckPermission("hr:employees:view")
    public R<HrEmployeeVO> currentEmployee() {
        Long userId = UserContext.getUserId();
        Map<String, Object> query = userId == null ? Map.of() : Map.of("userId", userId);
        Map<String, Object> row = crudService.list(HrEmployee.class, query).stream().findFirst().orElse(null);
        return R.ok(row == null ? null : MapConverters.toVO(row, HrEmployeeVO.class, objectMapper));
    }

    @GetMapping
    @SaCheckPermission("hr:employees:list")
    public R<PageResult<HrEmployeeVO>> listEmployees(@Validated @ModelAttribute HrEmployeeCommonQueryDTO query) {
        return R.ok(MapConverters.toPageResult(
                crudService.page(HrEmployee.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrEmployeeVO.class, objectMapper));
    }

    @SysLog("新增HR员工")
    @RepeatSubmit
    @PostMapping
    @SaCheckPermission("hr:employees:add")
    public R<Long> createEmployee(@RequestBody HrEmployeePayload payload) {
        return R.ok(crudService.create(HrEmployee.class, payload));
    }

    @SysLog("发起HR员工入职审批")
    @RepeatSubmit
    @PostMapping("/onboarding-requests")
    @SaCheckPermission("hr:employees:add")
    public R<HrEmployeeOnboardingResultVO> createEmployeeOnboardingRequest(
            @RequestBody HrEmployeePayload payload) {
        return R.ok(onboardingService.submit(payload));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("hr:employees:view")
    public R<HrEmployeeVO> getEmployee(@PathVariable Long id) {
        return R.ok(MapConverters.toVO(crudService.get(HrEmployee.class, id), HrEmployeeVO.class, objectMapper));
    }

    @SysLog("修改HR员工")
    @PutMapping("/{id}")
    @SaCheckPermission("hr:employees:edit")
    public R<Void> updateEmployee(@PathVariable Long id, @RequestBody HrEmployeePayload payload) {
        crudService.update(HrEmployee.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR员工")
    @DeleteMapping("/{id}")
    @SaCheckPermission("hr:employees:remove")
    public R<Void> deleteEmployee(@PathVariable Long id) {
        crudService.delete(HrEmployee.class, id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/employees")
@RequiredArgsConstructor
class HrEmployeeContractController {

    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @GetMapping("/{employeeId}/contracts")
    @SaCheckPermission("hr:employees:view")
    public R<List<HrEmployeeContractVO>> listContracts(@PathVariable Long employeeId) {
        HrEmployeeResourceAccess.assertEmployeeVisible(crudService, employeeId);
        return R.ok(MapConverters.toVOList(
                crudService.list(HrEmployeeContract.class, HrEmployeeResourceAccess.employeeQuery(employeeId)),
                HrEmployeeContractVO.class, objectMapper));
    }

    @SysLog("新增HR员工合同")
    @RepeatSubmit
    @PostMapping("/contracts")
    @SaCheckPermission("hr:employees:edit")
    public R<Long> createContract(@RequestBody HrEmployeeContractPayload payload) {
        HrEmployeeResourceAccess.prepareCreate(crudService, payload);
        return R.ok(crudService.create(HrEmployeeContract.class, payload));
    }

    @SysLog("修改HR员工合同")
    @PutMapping("/contracts/{id}")
    @SaCheckPermission("hr:employees:edit")
    public R<Void> updateContract(@PathVariable Long id, @RequestBody HrEmployeeContractPayload payload) {
        HrEmployeeResourceAccess.prepareUpdate(crudService, HrEmployeeContract.class, id, payload);
        crudService.update(HrEmployeeContract.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR员工合同")
    @DeleteMapping("/contracts/{id}")
    @SaCheckPermission("hr:employees:edit")
    public R<Void> deleteContract(@PathVariable Long id) {
        HrEmployeeResourceAccess.assertChildEmployeeVisible(crudService, HrEmployeeContract.class, id);
        crudService.delete(HrEmployeeContract.class, id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/employees")
@RequiredArgsConstructor
class HrEmployeeDocumentController {

    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @GetMapping("/{employeeId}/documents")
    @SaCheckPermission("hr:employees:view")
    public R<List<HrEmployeeDocumentVO>> listDocuments(@PathVariable Long employeeId) {
        HrEmployeeResourceAccess.assertEmployeeVisible(crudService, employeeId);
        return R.ok(MapConverters.toVOList(
                crudService.list(HrEmployeeDocument.class, HrEmployeeResourceAccess.employeeQuery(employeeId)),
                HrEmployeeDocumentVO.class, objectMapper));
    }

    @SysLog("新增HR员工证件")
    @RepeatSubmit
    @PostMapping("/documents")
    @SaCheckPermission("hr:employees:edit")
    public R<Long> createDocument(@RequestBody HrEmployeeDocumentPayload payload) {
        HrEmployeeResourceAccess.prepareCreate(crudService, payload);
        return R.ok(crudService.create(HrEmployeeDocument.class, payload));
    }

    @SysLog("修改HR员工证件")
    @PutMapping("/documents/{id}")
    @SaCheckPermission("hr:employees:edit")
    public R<Void> updateDocument(@PathVariable Long id, @RequestBody HrEmployeeDocumentPayload payload) {
        HrEmployeeResourceAccess.prepareUpdate(crudService, HrEmployeeDocument.class, id, payload);
        crudService.update(HrEmployeeDocument.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR员工证件")
    @DeleteMapping("/documents/{id}")
    @SaCheckPermission("hr:employees:edit")
    public R<Void> deleteDocument(@PathVariable Long id) {
        HrEmployeeResourceAccess.assertChildEmployeeVisible(crudService, HrEmployeeDocument.class, id);
        crudService.delete(HrEmployeeDocument.class, id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/employees")
@RequiredArgsConstructor
class HrEmergencyContactController {

    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @GetMapping("/{employeeId}/emergency-contacts")
    @SaCheckPermission("hr:employees:view")
    public R<List<HrEmergencyContactVO>> listContacts(@PathVariable Long employeeId) {
        HrEmployeeResourceAccess.assertEmployeeVisible(crudService, employeeId);
        return R.ok(MapConverters.toVOList(
                crudService.list(HrEmergencyContact.class, HrEmployeeResourceAccess.employeeQuery(employeeId)),
                HrEmergencyContactVO.class, objectMapper));
    }

    @SysLog("新增HR紧急联系人")
    @RepeatSubmit
    @PostMapping("/emergency-contacts")
    @SaCheckPermission("hr:employees:edit")
    public R<Long> createContact(@RequestBody HrEmergencyContactPayload payload) {
        HrEmployeeResourceAccess.prepareCreate(crudService, payload);
        return R.ok(crudService.create(HrEmergencyContact.class, payload));
    }

    @SysLog("修改HR紧急联系人")
    @PutMapping("/emergency-contacts/{id}")
    @SaCheckPermission("hr:employees:edit")
    public R<Void> updateContact(@PathVariable Long id, @RequestBody HrEmergencyContactPayload payload) {
        HrEmployeeResourceAccess.prepareUpdate(crudService, HrEmergencyContact.class, id, payload);
        crudService.update(HrEmergencyContact.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR紧急联系人")
    @DeleteMapping("/emergency-contacts/{id}")
    @SaCheckPermission("hr:employees:edit")
    public R<Void> deleteContact(@PathVariable Long id) {
        HrEmployeeResourceAccess.assertChildEmployeeVisible(crudService, HrEmergencyContact.class, id);
        crudService.delete(HrEmergencyContact.class, id);
        return R.ok();
    }
}

final class HrEmployeeResourceAccess {

    private HrEmployeeResourceAccess() {
    }

    static Map<String, Object> employeeQuery(Long employeeId) {
        return Map.of("employeeId", requireId(employeeId, "employeeId"), "tenantId", requireTenantId());
    }

    static void assertEmployeeVisible(HrTypedCrudService crudService, Long employeeId) {
        Long id = requireId(employeeId, "employeeId");
        Map<String, Object> employee = crudService.get(HrEmployee.class, id);
        if (employee == null || employee.isEmpty()) {
            throw new HrBusinessException("FORBIDDEN_EMPLOYEE", "员工不存在或无权访问：" + id);
        }
    }

    static <T> void assertChildEmployeeVisible(HrTypedCrudService crudService, Class<T> childClass, Long childId) {
        Map<String, Object> child = crudService.get(childClass, requireId(childId, "id"));
        if (child == null || child.isEmpty()) {
            throw new HrBusinessException("FORBIDDEN_EMPLOYEE_RESOURCE", "员工子资源不存在或无权访问：" + childId);
        }
        assertEmployeeVisible(crudService, toLong(child.get("employeeId")));
    }

    static void prepareCreate(HrTypedCrudService crudService, HrEmployeeContractPayload payload) {
        assertPayload(payload);
        assertEmployeeVisible(crudService, payload.getEmployeeId());
        payload.setTenantId(requireTenantId());
    }

    static void prepareCreate(HrTypedCrudService crudService, HrEmployeeDocumentPayload payload) {
        assertPayload(payload);
        assertEmployeeVisible(crudService, payload.getEmployeeId());
        payload.setTenantId(requireTenantId());
    }

    static void prepareCreate(HrTypedCrudService crudService, HrEmergencyContactPayload payload) {
        assertPayload(payload);
        assertEmployeeVisible(crudService, payload.getEmployeeId());
        payload.setTenantId(requireTenantId());
    }

    static <T> void prepareUpdate(HrTypedCrudService crudService, Class<T> childClass, Long childId,
                                  HrEmployeeContractPayload payload) {
        assertPayload(payload);
        Long employeeId = existingEmployeeId(crudService, childClass, childId);
        assertEmployeeVisible(crudService, employeeId);
        payload.setEmployeeId(employeeId);
        payload.setTenantId(requireTenantId());
    }

    static <T> void prepareUpdate(HrTypedCrudService crudService, Class<T> childClass, Long childId,
                                  HrEmployeeDocumentPayload payload) {
        assertPayload(payload);
        Long employeeId = existingEmployeeId(crudService, childClass, childId);
        assertEmployeeVisible(crudService, employeeId);
        payload.setEmployeeId(employeeId);
        payload.setTenantId(requireTenantId());
    }

    static <T> void prepareUpdate(HrTypedCrudService crudService, Class<T> childClass, Long childId,
                                  HrEmergencyContactPayload payload) {
        assertPayload(payload);
        Long employeeId = existingEmployeeId(crudService, childClass, childId);
        assertEmployeeVisible(crudService, employeeId);
        payload.setEmployeeId(employeeId);
        payload.setTenantId(requireTenantId());
    }

    private static <T> Long existingEmployeeId(HrTypedCrudService crudService, Class<T> childClass, Long childId) {
        Map<String, Object> child = crudService.get(childClass, requireId(childId, "id"));
        if (child == null || child.isEmpty()) {
            throw new HrBusinessException("FORBIDDEN_EMPLOYEE_RESOURCE", "员工子资源不存在或无权访问：" + childId);
        }
        return requireId(toLong(child.get("employeeId")), "employeeId");
    }

    private static Long requireId(Long id, String name) {
        if (id == null) {
            throw new HrBusinessException("INVALID_PARAMETER", name + "不能为空");
        }
        return id;
    }

    private static void assertPayload(Object payload) {
        if (payload == null) {
            throw new HrBusinessException("INVALID_PARAMETER", "请求体不能为空");
        }
    }

    private static Long requireTenantId() {
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null) {
            throw new HrBusinessException("INVALID_TENANT", "tenantId不能为空");
        }
        return tenantId;
    }

    private static Long toLong(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        return Long.parseLong(String.valueOf(value));
    }
}
