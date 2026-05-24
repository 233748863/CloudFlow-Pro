package com.cloudflow.workflow.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.dto.SimulationRequest;
import com.cloudflow.workflow.domain.dto.SimulationResult;
import com.cloudflow.workflow.domain.dto.SimulationValidateRequest;
import com.cloudflow.workflow.service.ISimulationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import cn.dev33.satoken.annotation.SaCheckPermission;

@RestController
@RequestMapping("/simulation")
public class SimulationController {

    @Autowired
    private ISimulationService simulationService;

    @PostMapping("/run")
    @SaCheckPermission("workflow:definition:view")
    public R<SimulationResult> simulate(@RequestBody SimulationRequest request) {
        return R.ok(simulationService.simulateProcess(request));
    }

    @PostMapping("/validate")
    @SaCheckPermission("workflow:definition:view")
    public R<SimulationResult> validate(@Validated @RequestBody SimulationValidateRequest request) {
        return R.ok(simulationService.validateDefinition(request.getDefinitionId()));
    }
}
