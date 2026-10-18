package com.cloudflow.workflow.service;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.workflow.domain.WfGatewayActivation;
import com.cloudflow.workflow.domain.WfParallelJoin;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.vo.WorkflowGatewayTrace;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfGatewayActivationMapper;
import com.cloudflow.workflow.mapper.WfParallelJoinMapper;
import com.cloudflow.workflow.model.WorkflowGatewayTopology;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class WorkflowGatewayService {
    private final WfGatewayActivationMapper activations;
    private final WfParallelJoinMapper arrivals;
    private final ObjectMapper json;
    private final WorkflowGatewayFailureService failures;

    public record Arrival(boolean proceed, WorkflowExecutionContext.Frame context) {
    }

    public List<WorkflowGatewayTrace> trace(WfProcessInstance instance) {
        assertTenant(instance);
        return activations.selectTrace(instance.getTenantId(), instance.getInstanceId());
    }

    public WorkflowException noMatch(WfProcessInstance instance, WfNodeConfig node) {
        assertTenant(instance);
        Runnable report = () -> failures.report(instance.getTenantId(), instance.getInstanceId(), instance.getProcessDefKey(), node.getId(), node.getTitle());
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCompletion(int status) {
                    if (status == TransactionSynchronization.STATUS_ROLLED_BACK) report.run();
                }
            });
        } else {
            report.run();
        }
        return new WorkflowException("GATEWAY_NO_MATCH", "网关没有命中出口且未配置默认出口，本次操作未生效");
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public WfGatewayActivation activate(WfProcessInstance instance, WorkflowGatewayTopology.Split split, List<String> branches) {
        assertTenant(instance);
        assertActive(instance, WorkflowExecutionContext.current());
        if (branches.isEmpty() || new HashSet<>(branches).size() != branches.size()
                || !split.branches().stream().map(edge -> edge.getId()).toList().containsAll(branches)) {
            throw WorkflowExecutionContext.invalid();
        }
        WfGatewayActivation activation = new WfGatewayActivation();
        activation.setActivationId(UUID.randomUUID().toString());
        activation.setTenantId(instance.getTenantId());
        activation.setInstanceId(instance.getInstanceId());
        activation.setGatewayId(split.gatewayId());
        activation.setJoinNodeKey(split.joinNodeKey());
        activation.setJoinType(split.type());
        activation.setParentContext(WorkflowExecutionContext.capture());
        activation.setExpectedCount(branches.size());
        activation.setStatus("WAITING");
        activation.setVersion(0);
        activation.setCreateTime(LocalDateTime.now());
        activation.setUpdateTime(activation.getCreateTime());
        try {
            activation.setActivatedBranches(json.writeValueAsString(branches));
        } catch (Exception failure) {
            throw WorkflowExecutionContext.invalid();
        }
        if (activations.insert(activation) != 1) throw WorkflowExecutionContext.invalid();
        return activation;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public Arrival arrive(WfProcessInstance instance, String nodeKey, boolean pairedJoin) {
        WorkflowExecutionContext.Frame frame = WorkflowExecutionContext.current();
        if (frame == null) {
            if (pairedJoin) throw WorkflowExecutionContext.invalid();
            return new Arrival(true, null);
        }
        WfGatewayActivation activation = resolve(instance, frame);
        if (!isActive(instance, frame)) return new Arrival(false, frame);
        if (!Objects.equals(nodeKey, activation.getJoinNodeKey())) {
            if (pairedJoin) throw WorkflowExecutionContext.invalid();
            return new Arrival(true, frame);
        }
        List<String> expected = branches(activation);
        List<WfParallelJoin> reached = arrivals.selectArrivalsForUpdate(instance.getTenantId(), activation.getActivationId());
        for (WfParallelJoin arrival : reached) {
            if (!expected.contains(arrival.getBranchKey()) || !Objects.equals(arrival.getInstanceId(), instance.getInstanceId())
                    || !Objects.equals(arrival.getGatewayId(), activation.getGatewayId())
                    || !Objects.equals(arrival.getJoinType(), activation.getJoinType())
                    || !Objects.equals(arrival.getExpectedCount(), activation.getExpectedCount())) throw WorkflowExecutionContext.invalid();
        }
        if (reached.stream().anyMatch(arrival -> frame.branchKey().equals(arrival.getBranchKey()))) {
            return new Arrival(false, frame);
        }
        WfParallelJoin arrival = new WfParallelJoin();
        arrival.setTenantId(instance.getTenantId());
        arrival.setInstanceId(instance.getInstanceId());
        arrival.setGatewayId(activation.getGatewayId());
        arrival.setActivationId(activation.getActivationId());
        arrival.setBranchKey(frame.branchKey());
        arrival.setJoinType(activation.getJoinType());
        arrival.setExpectedCount(activation.getExpectedCount());
        arrival.setCreateTime(LocalDateTime.now());
        if (arrivals.insert(arrival) != 1) throw WorkflowExecutionContext.invalid();
        int arrived = reached.size() + 1;
        if (arrived < activation.getExpectedCount()) return new Arrival(false, frame);
        if (arrived != activation.getExpectedCount() || activations.markReleased(instance.getTenantId(), instance.getInstanceId(),
                activation.getActivationId(), activation.getVersion()) != 1) throw WorkflowExecutionContext.invalid();
        return new Arrival(true, frame.parent());
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void assertActive(WfProcessInstance instance, WorkflowExecutionContext.Frame frame) {
        if (!isActive(instance, frame)) throw WorkflowExecutionContext.invalid();
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public boolean isActive(WfProcessInstance instance, WorkflowExecutionContext.Frame frame) {
        assertTenant(instance);
        ArrayDeque<WorkflowExecutionContext.Frame> parents = new ArrayDeque<>();
        for (WorkflowExecutionContext.Frame current = frame; current != null; current = current.parent()) parents.addFirst(current);
        for (WorkflowExecutionContext.Frame current : parents) {
            if (!"WAITING".equals(resolve(instance, current).getStatus())) return false;
        }
        return true;
    }

    private WfGatewayActivation resolve(WfProcessInstance instance, WorkflowExecutionContext.Frame frame) {
        assertTenant(instance);
        WfGatewayActivation activation = activations.selectForUpdate(instance.getTenantId(), instance.getInstanceId(), frame.activationId());
        if (activation == null || !Objects.equals(WorkflowExecutionContext.parse(activation.getParentContext()), frame.parent())
                || !branches(activation).contains(frame.branchKey())) throw WorkflowExecutionContext.invalid();
        return activation;
    }

    private List<String> branches(WfGatewayActivation activation) {
        try {
            List<String> branches = json.readValue(activation.getActivatedBranches(), new TypeReference<>() {});
            if (branches == null || branches.isEmpty() || branches.size() != activation.getExpectedCount()
                    || new HashSet<>(branches).size() != branches.size()
                    || branches.stream().anyMatch(branch -> branch == null || branch.isBlank() || branch.length() > 64)) {
                throw WorkflowExecutionContext.invalid();
            }
            return branches;
        } catch (Exception failure) {
            throw WorkflowExecutionContext.invalid();
        }
    }

    private void assertTenant(WfProcessInstance instance) {
        if (instance == null || instance.getTenantId() == null || !Objects.equals(instance.getTenantId(), TenantContext.getTenantId())) {
            throw WorkflowExecutionContext.invalid();
        }
    }

    @Audit(name = "清理已归档实例网关记录", highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public void deleteArchived(Long tenantId, String instanceId) {
        if (!Objects.equals(tenantId, TenantContext.getTenantId()) || tenantId == null) throw WorkflowExecutionContext.invalid();
        arrivals.deleteArchived(tenantId, instanceId);
        activations.deleteArchived(tenantId, instanceId);
    }
}
