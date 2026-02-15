package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.LeaveRequest;
import com.cloudflow.oa.mapper.LeaveRequestMapper;
import com.cloudflow.oa.service.ILeaveRequestService;
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
 * 请假申请 Service 实现类
 */
@Slf4j
@Service
public class LeaveRequestServiceImpl extends ServiceImpl<LeaveRequestMapper, LeaveRequest>
        implements ILeaveRequestService {

    @Autowired
    private RemoteWorkflowService remoteWorkflowService;

    @Override
    public IPage<LeaveRequest> queryPage(LeaveRequest query, int pageNum, int pageSize) {
        LambdaQueryWrapper<LeaveRequest> wrapper = new LambdaQueryWrapper<>();

        // 按申请人筛选
        if (query.getUserId() != null) {
            wrapper.eq(LeaveRequest::getUserId, query.getUserId());
        }
        // 按请假类型筛选
        if (StringUtils.hasText(query.getLeaveType())) {
            wrapper.eq(LeaveRequest::getLeaveType, query.getLeaveType());
        }
        // 按状态筛选
        if (StringUtils.hasText(query.getStatus())) {
            wrapper.eq(LeaveRequest::getStatus, query.getStatus());
        }
        // 排除已删除
        wrapper.and(w -> w.isNull(LeaveRequest::getDelFlag).or().ne(LeaveRequest::getDelFlag, "2"));
        // 按创建时间倒序
        wrapper.orderByDesc(LeaveRequest::getCreateTime);

        return page(new Page<>(pageNum, pageSize), wrapper);
    }

    @Override
    public String generateLeaveNo() {
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        Integer maxSeq = baseMapper.getTodayMaxSeq();
        int nextSeq = (maxSeq == null ? 0 : maxSeq) + 1;
        return String.format("QJ%s%04d", today, nextSeq);
    }

    @Override
    @Audit(name = "创建请假申请", spel = "#leave")
    @Transactional(rollbackFor = Exception.class)
    public boolean createLeave(LeaveRequest leave) {
        // 生成请假单号
        leave.setLeaveNo(generateLeaveNo());
        leave.setStatus("DRAFT");
        return save(leave);
    }

    @Override
    @Audit(name = "提交请假申请", spel = "#id", oldVal = "@leaveRequestServiceImpl.getById(#id)")
    @Transactional(rollbackFor = Exception.class)
    public boolean submitLeave(Long id) {
        LeaveRequest leave = getById(id);
        if (leave == null) {
            return false;
        }

        // 更新状态为审批中
        leave.setStatus("PENDING");

        // 启动工作流
        try {
            Map<String, Object> req = new HashMap<>();
            req.put("processDefinitionKey", "leave_request");
            req.put("businessKey", "LEAVE_REQUEST:" + leave.getId());

            // 流程变量
            Map<String, Object> variables = new HashMap<>();
            variables.put("leaveId", leave.getId());
            variables.put("leaveNo", leave.getLeaveNo());
            variables.put("leaveType", leave.getLeaveType());
            variables.put("leaveDays", leave.getLeaveDays());
            variables.put("userId", leave.getUserId());
            req.put("variables", variables);

            R<?> result = remoteWorkflowService.startProcess(req);
            if (result != null && result.getCode() == 200 && result.getData() != null) {
                // 提取流程实例ID
                String instanceId = extractInstanceId(result.getData());
                if (instanceId != null) {
                    leave.setInstanceId(instanceId);
                }
                log.info("请假申请 {} 工作流启动成功，流程实例ID: {}", leave.getLeaveNo(), instanceId);
            } else {
                log.warn("请假申请 {} 工作流启动返回异常: {}", leave.getLeaveNo(),
                        result != null ? result.getMsg() : "null");
            }
        } catch (Exception e) {
            // 工作流启动失败不影响提交
            log.error("请假申请 {} 启动工作流失败，但提交状态已更新", leave.getLeaveNo(), e);
        }

        return updateById(leave);
    }

    @Override
    @Audit(name = "取消请假申请", spel = "#id", oldVal = "@leaveRequestServiceImpl.getById(#id)")
    @Transactional(rollbackFor = Exception.class)
    public boolean cancelLeave(Long id) {
        LeaveRequest leave = getById(id);
        if (leave == null) {
            return false;
        }
        // 只有草稿和审批中状态可以取消
        if (!"DRAFT".equals(leave.getStatus()) && !"PENDING".equals(leave.getStatus())) {
            log.warn("请假申请 {} 当前状态 {} 不允许取消", leave.getLeaveNo(), leave.getStatus());
            return false;
        }
        leave.setStatus("CANCELLED");
        return updateById(leave);
    }

    /**
     * 从工作流启动结果中提取流程实例ID
     */
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
        if (data instanceof String) {
            return (String) data;
        }
        return null;
    }
}
