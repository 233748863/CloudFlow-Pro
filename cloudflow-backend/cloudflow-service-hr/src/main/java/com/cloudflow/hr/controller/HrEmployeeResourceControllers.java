package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.hr.domain.dto.HrEmergencyContactPayload;
import com.cloudflow.hr.domain.dto.HrEmployeeContractPayload;
import com.cloudflow.hr.domain.dto.HrEmployeeDocumentPayload;
import com.cloudflow.hr.domain.dto.HrEmployeePayload;
import com.cloudflow.hr.domain.entity.HrEmergencyContact;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrEmployeeContract;
import com.cloudflow.hr.domain.entity.HrEmployeeDocument;
import com.cloudflow.hr.service.HrTypedCrudService;
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
@RequestMapping("/employees")
@RequiredArgsConstructor
class HrEmployeeController {

    private final HrTypedCrudService crudService;

    @GetMapping("/current")
    @SaCheckPermission("hr:employees:view")
    public R<Map<String, Object>> currentEmployee() {
        Long userId = UserContext.getUserId();
        Map<String, Object> query = userId == null ? Map.of() : Map.of("userId", userId);
        return R.ok(crudService.list(HrEmployee.class, query).stream().findFirst().orElse(Map.of()));
    }

    @GetMapping
    @SaCheckPermission("hr:employees:list")
    public R<?> listEmployees(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list(HrEmployee.class, query));
    }

    @SysLog("新增HR员工")
    @PostMapping
    @SaCheckPermission("hr:employees:add")
    public R<Long> createEmployee(@RequestBody HrEmployeePayload payload) {
        return R.ok(crudService.create(HrEmployee.class, payload));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("hr:employees:view")
    public R<Map<String, Object>> getEmployee(@PathVariable Long id) {
        return R.ok(crudService.get(HrEmployee.class, id));
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

    @GetMapping("/{employeeId}/contracts")
    @SaCheckPermission("hr:employees:view")
    public R<?> listContracts(@PathVariable Long employeeId) {
        return R.ok(crudService.list(HrEmployeeContract.class, Map.of("employeeId", employeeId)));
    }

    @SysLog("新增HR员工合同")
    @PostMapping("/contracts")
    @SaCheckPermission("hr:employees:edit")
    public R<Long> createContract(@RequestBody HrEmployeeContractPayload payload) {
        return R.ok(crudService.create(HrEmployeeContract.class, payload));
    }

    @SysLog("修改HR员工合同")
    @PutMapping("/contracts/{id}")
    @SaCheckPermission("hr:employees:edit")
    public R<Void> updateContract(@PathVariable Long id, @RequestBody HrEmployeeContractPayload payload) {
        crudService.update(HrEmployeeContract.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR员工合同")
    @DeleteMapping("/contracts/{id}")
    @SaCheckPermission("hr:employees:edit")
    public R<Void> deleteContract(@PathVariable Long id) {
        crudService.delete(HrEmployeeContract.class, id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/employees")
@RequiredArgsConstructor
class HrEmployeeDocumentController {

    private final HrTypedCrudService crudService;

    @GetMapping("/{employeeId}/documents")
    @SaCheckPermission("hr:employees:view")
    public R<?> listDocuments(@PathVariable Long employeeId) {
        return R.ok(crudService.list(HrEmployeeDocument.class, Map.of("employeeId", employeeId)));
    }

    @SysLog("新增HR员工证件")
    @PostMapping("/documents")
    @SaCheckPermission("hr:employees:edit")
    public R<Long> createDocument(@RequestBody HrEmployeeDocumentPayload payload) {
        return R.ok(crudService.create(HrEmployeeDocument.class, payload));
    }

    @SysLog("修改HR员工证件")
    @PutMapping("/documents/{id}")
    @SaCheckPermission("hr:employees:edit")
    public R<Void> updateDocument(@PathVariable Long id, @RequestBody HrEmployeeDocumentPayload payload) {
        crudService.update(HrEmployeeDocument.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR员工证件")
    @DeleteMapping("/documents/{id}")
    @SaCheckPermission("hr:employees:edit")
    public R<Void> deleteDocument(@PathVariable Long id) {
        crudService.delete(HrEmployeeDocument.class, id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/employees")
@RequiredArgsConstructor
class HrEmergencyContactController {

    private final HrTypedCrudService crudService;

    @GetMapping("/{employeeId}/emergency-contacts")
    @SaCheckPermission("hr:employees:view")
    public R<?> listContacts(@PathVariable Long employeeId) {
        return R.ok(crudService.list(HrEmergencyContact.class, Map.of("employeeId", employeeId)));
    }

    @SysLog("新增HR紧急联系人")
    @PostMapping("/emergency-contacts")
    @SaCheckPermission("hr:employees:edit")
    public R<Long> createContact(@RequestBody HrEmergencyContactPayload payload) {
        return R.ok(crudService.create(HrEmergencyContact.class, payload));
    }

    @SysLog("修改HR紧急联系人")
    @PutMapping("/emergency-contacts/{id}")
    @SaCheckPermission("hr:employees:edit")
    public R<Void> updateContact(@PathVariable Long id, @RequestBody HrEmergencyContactPayload payload) {
        crudService.update(HrEmergencyContact.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR紧急联系人")
    @DeleteMapping("/emergency-contacts/{id}")
    @SaCheckPermission("hr:employees:edit")
    public R<Void> deleteContact(@PathVariable Long id) {
        crudService.delete(HrEmergencyContact.class, id);
        return R.ok();
    }
}
