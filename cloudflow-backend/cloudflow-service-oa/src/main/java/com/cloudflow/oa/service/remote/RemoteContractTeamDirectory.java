package com.cloudflow.oa.service.remote;

import com.cloudflow.common.core.domain.R;
import java.util.List;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

@FeignClient(name = "cloudflow-service-hr", contextId = "contractTeamDirectory")
public interface RemoteContractTeamDirectory {
    record Employee(Long tenantId, Long employeeId, Long userId, String employeeName, Long deptId,
            String deptName, boolean active, boolean userEnabled, boolean departmentEnabled) { }

    @GetMapping("/inner/hr/employees/by-users")
    R<List<Employee>> employees(@RequestParam("userIds") List<Long> userIds);
}
