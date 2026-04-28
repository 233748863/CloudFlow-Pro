package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.EmployeeCreateDTO;
import com.cloudflow.hr.domain.dto.EmployeeQueryDTO;
import com.cloudflow.hr.domain.dto.EmployeeUpdateDTO;
import com.cloudflow.hr.domain.dto.EmergencyContactCreateDTO;
import com.cloudflow.hr.domain.dto.EmergencyContactUpdateDTO;
import com.cloudflow.hr.domain.vo.EmployeeVO;
import com.cloudflow.hr.domain.vo.EmergencyContactVO;

import java.util.List;

public interface EmployeeService {

    Long createEmployee(EmployeeCreateDTO dto);

    void updateEmployee(Long id, EmployeeUpdateDTO dto);

    EmployeeVO getEmployee(Long id);

    EmployeeVO getCurrentEmployee();

    List<EmployeeVO> listEmployees(EmployeeQueryDTO query);

    void deleteEmployee(Long id);

    Long addEmergencyContact(EmergencyContactCreateDTO dto);

    void updateEmergencyContact(Long id, EmergencyContactUpdateDTO dto);

    List<EmergencyContactVO> listEmergencyContacts(Long employeeId);

    EmergencyContactVO getEmergencyContact(Long id);

    void deleteEmergencyContact(Long id);
}
