package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.oa.constant.OaBusinessTypes;
import com.cloudflow.oa.domain.BusinessTrip;
import com.cloudflow.oa.domain.dto.WorkflowProcessStartDTO;
import com.cloudflow.oa.mapper.BusinessTripMapper;
import com.cloudflow.oa.service.IBusinessTripService;
import com.cloudflow.oa.service.remote.RemoteWorkflowService;
import com.cloudflow.common.statemachine.core.StateMachine;
import com.cloudflow.common.statemachine.core.StateMachineRegistry;
import com.cloudflow.oa.enums.BusinessTripStatus;
import com.cloudflow.oa.enums.BusinessTripEvent;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;

/**
 * 出差申请 Service 实现类
 */
@Slf4j
@Service
public class BusinessTripServiceImpl extends ServiceImpl<BusinessTripMapper, BusinessTrip>
        implements IBusinessTripService {

    @Autowired
    private RemoteWorkflowService remoteWorkflowService;

    @Autowired
    private OaWorkflowFailureHelper workflowFailureHelper;

    @Autowired
    private StateMachineRegistry stateMachineRegistry;

    @Override
    public IPage<BusinessTrip> queryPage(BusinessTrip query, int pageNum, int pageSize) {
        return baseMapper.selectPageByDataScope(new Page<>(pageNum, pageSize), query, DataScopeUtils.listScope());
    }

    @Override
    public String generateTripNo() {
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        Integer maxSeq = baseMapper.getTodayMaxSeq();
        int nextSeq = (maxSeq == null ? 0 : maxSeq) + 1;
        return String.format("CC%s%04d", today, nextSeq);
    }

    @Override
    @Audit(name = "创建出差申请", spel = "#trip")
    @Transactional(rollbackFor = Exception.class)
    public boolean createTrip(BusinessTrip trip) {
        // 从当前登录用户上下文中填充用户信息
        trip.setUserId(UserContext.getUserId());
        trip.setUserName(UserContext.getUserName());
        trip.setDeptId(UserContext.getDeptId());
        trip.setDeptName(UserContext.getDeptName());
        trip.setCreateBy(UserContext.getUserName());
        trip.setTripNo(generateTripNo());
        trip.setStatus("DRAFT");
        return save(trip);
    }

    @Override
    @Audit(name = "提交出差申请", spel = "#id")
    @Transactional(rollbackFor = Exception.class)
    public boolean submitTrip(Long id) {
        BusinessTrip trip = getById(id);
        if (trip == null) {
            return false;
        }
        // M1-4: 所有权校验
        DataScopeUtils.assertOwnership(trip, BusinessTrip::getUserId, "出差申请");
        // 补偿逻辑：历史数据可能缺少用户信息，从当前登录上下文补充
        if (!StringUtils.hasText(trip.getDeptName())) {
            trip.setDeptName(UserContext.getDeptName());
        }
        if (trip.getDeptId() == null) {
            trip.setDeptId(UserContext.getDeptId());
        }
        if (!StringUtils.hasText(trip.getUserName())) {
            trip.setUserName(UserContext.getUserName());
        }
        if (trip.getUserId() == null) {
            trip.setUserId(UserContext.getUserId());
        }

        // M1-6: 使用状态机进行状态转换
        StateMachine<BusinessTripStatus, BusinessTripEvent> stateMachine = stateMachineRegistry.require("BusinessTrip");
        BusinessTripStatus currentStatus = BusinessTripStatus.valueOf(trip.getStatus());
        BusinessTripStatus newStatus = stateMachine.fire(currentStatus, BusinessTripEvent.SUBMIT);
        trip.setStatus(newStatus.name());

        boolean updated = updateById(trip);
        startTripWorkflowAfterCommit(trip);
        return updated;
    }

    private void startTripWorkflowAfterCommit(BusinessTrip trip) {
        OaTransactionHooks.afterCommit(() -> startTripWorkflow(trip));
    }

    private void startTripWorkflow(BusinessTrip trip) {
        try {
            WorkflowProcessStartDTO req = new WorkflowProcessStartDTO();
            req.setProcessDefKey("business_trip");
            req.setBusinessKey("BUSINESS_TRIP:" + trip.getId());
            Map<String, Object> variables = new HashMap<>();
            variables.put("tripId", trip.getId());
            variables.put("tripNo", trip.getTripNo());
            variables.put("destination", trip.getDestination());
            variables.put("tripDays", trip.getTripDays());
            variables.put("estimatedCost", trip.getEstimatedCost());
            variables.put("userId", trip.getUserId());
            variables.put("userName", trip.getUserName());
            variables.put("startDate", trip.getStartDate() != null
                    ? DateTimeFormatter.ofPattern("yyyy-MM-dd").format(trip.getStartDate()) : null);
            variables.put("endDate", trip.getEndDate() != null
                    ? DateTimeFormatter.ofPattern("yyyy-MM-dd").format(trip.getEndDate()) : null);
            variables.put("transportType", trip.getTransportType());
            variables.put("reason", trip.getReason());
            variables.put("deptName", trip.getDeptName());
            WorkflowCallbackConstants.applyCallbackMetadata(
                    variables,
                    OaBusinessTypes.BUSINESS_TRIP,
                    trip.getId(),
                    trip.getTripNo(),
                    "workflow:stream:approval-callback:oa"
            );
            req.setVariables(variables);

            R<?> result = remoteWorkflowService.startProcess(req);
            if (result != null && result.getCode() == 200 && result.getData() != null) {
                String instanceId = extractInstanceId(result.getData());
                if (instanceId != null) {
                    BusinessTrip update = new BusinessTrip();
                    update.setId(trip.getId());
                    update.setInstanceId(instanceId);
                    updateById(update);
                }
                log.info("出差申请 {} 工作流启动成功", trip.getTripNo());
            }
        } catch (Exception e) {
            log.error("出差申请 {} 启动工作流失败", trip.getTripNo(), e);
            workflowFailureHelper.handleWorkflowStartFailure(
                    OaBusinessTypes.BUSINESS_TRIP, trip.getId(), trip.getTripNo(),
                    trip.getUserName(), trip.getUserId(), e);
        }
    }

    @Override
    @Audit(name = "取消出差申请", spel = "#id", highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public boolean cancelTrip(Long id) {
        BusinessTrip trip = getById(id);
        if (trip == null) {
            return false;
        }
        // M1-4: 所有权校验
        DataScopeUtils.assertOwnership(trip, BusinessTrip::getUserId, "出差申请");

        // M1-6: 使用状态机进行状态转换
        StateMachine<BusinessTripStatus, BusinessTripEvent> stateMachine = stateMachineRegistry.require("BusinessTrip");
        BusinessTripStatus currentStatus = BusinessTripStatus.valueOf(trip.getStatus());
        BusinessTripStatus newStatus = stateMachine.fire(currentStatus, BusinessTripEvent.CANCEL);
        trip.setStatus(newStatus.name());

        return updateById(trip);
    }

    @SuppressWarnings("unchecked")
    private String extractInstanceId(Object data) {
        if (data instanceof Map) {
            Map<String, Object> dataMap = (Map<String, Object>) data;
            Object instanceId = dataMap.get("processInstanceId");
            if (instanceId == null) {
                instanceId = dataMap.get("instanceId");
            }
            return instanceId != null ? String.valueOf(instanceId) : null;
        }
        return data instanceof String ? (String) data : null;
    }
}
