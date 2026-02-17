package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.BusinessTrip;
import com.cloudflow.oa.mapper.BusinessTripMapper;
import com.cloudflow.oa.service.IBusinessTripService;
import com.cloudflow.oa.service.remote.RemoteWorkflowService;
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

    @Override
    public IPage<BusinessTrip> queryPage(BusinessTrip query, int pageNum, int pageSize) {
        LambdaQueryWrapper<BusinessTrip> wrapper = new LambdaQueryWrapper<>();
        if (query.getUserId() != null) {
            wrapper.eq(BusinessTrip::getUserId, query.getUserId());
        }
        if (StringUtils.hasText(query.getStatus())) {
            wrapper.eq(BusinessTrip::getStatus, query.getStatus());
        }
        if (StringUtils.hasText(query.getDestination())) {
            wrapper.like(BusinessTrip::getDestination, query.getDestination());
        }
        wrapper.and(w -> w.isNull(BusinessTrip::getDelFlag).or().ne(BusinessTrip::getDelFlag, "2"));
        wrapper.orderByDesc(BusinessTrip::getCreateTime);
        return page(new Page<>(pageNum, pageSize), wrapper);
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
        trip.setStatus("PENDING");

        try {
            Map<String, Object> req = new HashMap<>();
            req.put("processDefKey", "business_trip");
            req.put("businessKey", "BUSINESS_TRIP:" + trip.getId());
            // 流程变量 - 包含完整业务字段，供审批人在审批卡片和详情中查看
            Map<String, Object> variables = new HashMap<>();
            variables.put("tripId", trip.getId());
            variables.put("tripNo", trip.getTripNo());
            variables.put("destination", trip.getDestination());
            variables.put("tripDays", trip.getTripDays());
            variables.put("estimatedCost", trip.getEstimatedCost());
            variables.put("userId", trip.getUserId());
            variables.put("userName", trip.getUserName());
            variables.put("startDate", trip.getStartDate() != null
                    ? new java.text.SimpleDateFormat("yyyy-MM-dd").format(trip.getStartDate()) : null);
            variables.put("endDate", trip.getEndDate() != null
                    ? new java.text.SimpleDateFormat("yyyy-MM-dd").format(trip.getEndDate()) : null);
            variables.put("transportType", trip.getTransportType());
            variables.put("reason", trip.getReason());
            variables.put("deptName", trip.getDeptName());
            req.put("variables", variables);

            R<?> result = remoteWorkflowService.startProcess(req);
            if (result != null && result.getCode() == 200 && result.getData() != null) {
                String instanceId = extractInstanceId(result.getData());
                if (instanceId != null) {
                    trip.setInstanceId(instanceId);
                }
                log.info("出差申请 {} 工作流启动成功", trip.getTripNo());
            }
        } catch (Exception e) {
            log.error("出差申请 {} 启动工作流失败", trip.getTripNo(), e);
        }

        return updateById(trip);
    }

    @Override
    @Audit(name = "取消出差申请", spel = "#id")
    @Transactional(rollbackFor = Exception.class)
    public boolean cancelTrip(Long id) {
        BusinessTrip trip = getById(id);
        if (trip == null) {
            return false;
        }
        if (!"DRAFT".equals(trip.getStatus()) && !"PENDING".equals(trip.getStatus())) {
            log.warn("出差申请 {} 当前状态 {} 不允许取消", trip.getTripNo(), trip.getStatus());
            return false;
        }
        trip.setStatus("CANCELLED");
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
