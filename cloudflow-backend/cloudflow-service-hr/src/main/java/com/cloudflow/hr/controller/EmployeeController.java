package com.cloudflow.hr.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.domain.dto.EmployeeCreateDTO;
import com.cloudflow.hr.domain.dto.EmployeeQueryDTO;
import com.cloudflow.hr.domain.dto.EmployeeUpdateDTO;
import com.cloudflow.hr.domain.dto.EmergencyContactCreateDTO;
import com.cloudflow.hr.domain.dto.EmergencyContactUpdateDTO;
import com.cloudflow.hr.domain.vo.EmployeeVO;
import com.cloudflow.hr.domain.vo.EmergencyContactVO;
import com.cloudflow.hr.service.EmployeeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Slf4j
@RestController
@RequestMapping("/employee")
@RequiredArgsConstructor
@Tag(name = "Employee", description = "Employee profile and emergency contact APIs")
public class EmployeeController {

    private final EmployeeService employeeService;

    @PostMapping
    @Operation(summary = "Create employee")
    public R<Long> createEmployee(@Valid @RequestBody EmployeeCreateDTO dto) {
        Long id = employeeService.createEmployee(dto);
        return R.ok(id);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update employee")
    public R<Void> updateEmployee(@PathVariable Long id, @Valid @RequestBody EmployeeUpdateDTO dto) {
        employeeService.updateEmployee(id, dto);
        return R.ok();
    }

    @GetMapping("/current")
    @Operation(summary = "Get current employee")
    public R<EmployeeVO> getCurrentEmployee() {
        return R.ok(employeeService.getCurrentEmployee());
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get employee")
    public R<EmployeeVO> getEmployee(@PathVariable Long id) {
        return R.ok(employeeService.getEmployee(id));
    }

    @GetMapping("/list")
    @Operation(summary = "List employees")
    public R<List<EmployeeVO>> listEmployees(EmployeeQueryDTO query) {
        return R.ok(employeeService.listEmployees(query));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete employee")
    public R<Void> deleteEmployee(@PathVariable Long id) {
        employeeService.deleteEmployee(id);
        return R.ok();
    }

    @PostMapping("/emergency-contact")
    @Operation(summary = "Create emergency contact")
    public R<Long> addEmergencyContact(@Valid @RequestBody EmergencyContactCreateDTO dto) {
        return R.ok(employeeService.addEmergencyContact(dto));
    }

    @PutMapping("/emergency-contact/{id}")
    @Operation(summary = "Update emergency contact")
    public R<Void> updateEmergencyContact(@PathVariable Long id, @Valid @RequestBody EmergencyContactUpdateDTO dto) {
        employeeService.updateEmergencyContact(id, dto);
        return R.ok();
    }

    @GetMapping("/{employeeId}/emergency-contacts")
    @Operation(summary = "List emergency contacts")
    public R<List<EmergencyContactVO>> listEmergencyContacts(@PathVariable Long employeeId) {
        return R.ok(employeeService.listEmergencyContacts(employeeId));
    }

    @GetMapping("/emergency-contact/{id}")
    @Operation(summary = "Get emergency contact")
    public R<EmergencyContactVO> getEmergencyContact(@PathVariable Long id) {
        return R.ok(employeeService.getEmergencyContact(id));
    }

    @DeleteMapping("/emergency-contact/{id}")
    @Operation(summary = "Delete emergency contact")
    public R<Void> deleteEmergencyContact(@PathVariable Long id) {
        employeeService.deleteEmergencyContact(id);
        return R.ok();
    }
}
