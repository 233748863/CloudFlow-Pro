package com.cloudflow.workflow.service;

import com.cloudflow.workflow.domain.dto.SimulationRequest;
import com.cloudflow.workflow.domain.dto.SimulationResult;

public interface ISimulationService {

    SimulationResult simulateProcess(SimulationRequest request);

    SimulationResult validateDefinition(String definitionId);
}
