package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.oa.constant.OaBusinessTypes;
import com.cloudflow.oa.domain.BusinessTrip;
import com.cloudflow.oa.event.BusinessTripSubmittedEvent;
import com.cloudflow.oa.mapper.BusinessTripMapper;
import com.cloudflow.oa.service.IBusinessTripService;
import com.cloudflow.common.statemachine.core.StateMachine;
import com.cloudflow.common.statemachine.core.StateMachineRegistry;
import com.cloudflow.oa.enums.BusinessTripStatus;
import com.cloudflow.oa.enums.BusinessTripEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * 出差申请 Service 实现类
 */
@Slf4j
@Service
public class BusinessTripServiceImpl extends ServiceImpl<BusinessTripMapper, BusinessTrip>
        implements IBusinessTripService {

    @Autowired
    private StateMachineRegistry stateMachineRegistry;

    @Autowired
    private OutboxPublisher outboxPublisher;

    @Autowired
    private ObjectMapper objectMapper;

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
        if (updated) {
            BusinessTripSubmittedEvent event = new BusinessTripSubmittedEvent();
            event.setTripId(trip.getId());
            event.setTripNo(trip.getTripNo());
            event.setUserId(trip.getUserId());
            event.setUserName(trip.getUserName());
            event.setDeptName(trip.getDeptName());
            event.setDestination(trip.getDestination());
            event.setTripDays(trip.getTripDays());
            event.setEstimatedCost(trip.getEstimatedCost());
            event.setStartDate(trip.getStartDate());
            event.setEndDate(trip.getEndDate());
            event.setTransportType(trip.getTransportType());
            event.setReason(trip.getReason());
            event.setSubmittedAt(LocalDateTime.now());
            publishTripSubmittedEvent(trip, event);
        }
        return updated;
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
    private void publishTripSubmittedEvent(BusinessTrip trip, BusinessTripSubmittedEvent event) {
        try {
            BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                    .eventType("BUSINESS_TRIP_SUBMITTED")
                    .sourceModule("cloudflow-oa")
                    .sourceId(trip.getId())
                    .tenantId(trip.getTenantId())
                    .payload(objectMapper.writeValueAsString(event))
                    .build();
            outboxPublisher.publish(envelope);
        } catch (Exception e) {
            log.warn("出差申请提交事件发布失败, tripId={}, error={}", trip.getId(), e.getMessage());
        }
    }
}
