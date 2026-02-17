package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.datascope.DataScopeHelper;
import com.cloudflow.oa.domain.OvertimeRequest;
import com.cloudflow.oa.mapper.OvertimeRequestMapper;
import com.cloudflow.oa.service.IOvertimeRequestService;
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
 * 加班申请 Service 实现类
 */
@Slf4j
@Service
public class OvertimeRequestServiceImpl extends ServiceImpl<OvertimeRequestMapper, OvertimeRequest>
        implements IOvertimeRequestService {

    @Autowired
    private RemoteWorkflowService remoteWorkflowService;

    @Override
    public IPage<OvertimeRequest> queryPage(OvertimeRequest query, int pageNum, int pageSize) {
        LambdaQueryWrapper<OvertimeRequest> wrapper = new LambdaQueryWrapper<>();
        if (query.getUserId() != null) {
            wrapper.eq(OvertimeRequest::getUserId, query.getUserId());
        }
        if (StringUtils.hasText(query.getOvertimeType())) {
            wrapper.eq(OvertimeRequest::getOvertimeType, query.getOvertimeType());
        }
        if (StringUtils.hasText(query.getStatus())) {
            wrapper.eq(OvertimeRequest::getStatus, query.getStatus());
        }
        wrapper.and(w -> w.isNull(OvertimeRequest::getDelFlag).or().ne(OvertimeRequest::getDelFlag, "2"));

        // 数据权限过滤：根据当前用户的权限类型，自动追加部门/用户过滤条件
        DataScopeHelper.apply(wrapper, OvertimeRequest::getUserId, OvertimeRequest::getDeptId);

        wrapper.orderByDesc(OvertimeRequest::getCreateTime);
        return page(new Page<>(pageNum, pageSize), wrapper);
    }

    @Override
    public String generateOvertimeNo() {
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        Integer maxSeq = baseMapper.getTodayMaxSeq();
        int nextSeq = (maxSeq == null ? 0 : maxSeq) + 1;
        return String.format("JB%s%04d", today, nextSeq);
    }

    @Override
    @Audit(name = "创建加班申请", spel = "#overtime")
    @Transactional(rollbackFor = Exception.class)
    public boolean createOvertime(OvertimeRequest overtime) {
        // 从当前登录用户上下文中填充用户信息
        overtime.setUserId(UserContext.getUserId());
        overtime.setUserName(UserContext.getUserName());
        overtime.setDeptId(UserContext.getDeptId());
        overtime.setDeptName(UserContext.getDeptName());
        overtime.setCreateBy(UserContext.getUserName());
        overtime.setOvertimeNo(generateOvertimeNo());
        overtime.setStatus("DRAFT");
        return save(overtime);
    }

    @Override
    @Audit(name = "提交加班申请", spel = "#id")
    @Transactional(rollbackFor = Exception.class)
    public boolean submitOvertime(Long id) {
        OvertimeRequest overtime = getById(id);
        if (overtime == null) {
            return false;
        }
        // 补偿逻辑：历史数据可能缺少用户信息，从当前登录上下文补充
        if (!StringUtils.hasText(overtime.getDeptName())) {
            overtime.setDeptName(UserContext.getDeptName());
        }
        if (overtime.getDeptId() == null) {
            overtime.setDeptId(UserContext.getDeptId());
        }
        if (!StringUtils.hasText(overtime.getUserName())) {
            overtime.setUserName(UserContext.getUserName());
        }
        if (overtime.getUserId() == null) {
            overtime.setUserId(UserContext.getUserId());
        }
        overtime.setStatus("PENDING");

        try {
            Map<String, Object> req = new HashMap<>();
            req.put("processDefKey", "overtime_request");
            req.put("businessKey", "OVERTIME_REQUEST:" + overtime.getId());
            // 流程变量 - 包含完整业务字段，供审批人在审批卡片和详情中查看
            Map<String, Object> variables = new HashMap<>();
            variables.put("overtimeId", overtime.getId());
            variables.put("overtimeNo", overtime.getOvertimeNo());
            variables.put("overtimeType", overtime.getOvertimeType());
            variables.put("overtimeHours", overtime.getOvertimeHours());
            variables.put("userId", overtime.getUserId());
            variables.put("userName", overtime.getUserName());
            variables.put("startTime", overtime.getStartTime() != null
                    ? new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm").format(overtime.getStartTime()) : null);
            variables.put("endTime", overtime.getEndTime() != null
                    ? new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm").format(overtime.getEndTime()) : null);
            variables.put("compensateType", overtime.getCompensateType());
            variables.put("reason", overtime.getReason());
            variables.put("deptName", overtime.getDeptName());
            req.put("variables", variables);

            R<?> result = remoteWorkflowService.startProcess(req);
            if (result != null && result.getCode() == 200 && result.getData() != null) {
                String instanceId = extractInstanceId(result.getData());
                if (instanceId != null) {
                    overtime.setInstanceId(instanceId);
                }
                log.info("加班申请 {} 工作流启动成功", overtime.getOvertimeNo());
            }
        } catch (Exception e) {
            log.error("加班申请 {} 启动工作流失败", overtime.getOvertimeNo(), e);
        }

        return updateById(overtime);
    }

    @Override
    @Audit(name = "取消加班申请", spel = "#id")
    @Transactional(rollbackFor = Exception.class)
    public boolean cancelOvertime(Long id) {
        OvertimeRequest overtime = getById(id);
        if (overtime == null) {
            return false;
        }
        if (!"DRAFT".equals(overtime.getStatus()) && !"PENDING".equals(overtime.getStatus())) {
            log.warn("加班申请 {} 当前状态 {} 不允许取消", overtime.getOvertimeNo(), overtime.getStatus());
            return false;
        }
        overtime.setStatus("CANCELLED");
        return updateById(overtime);
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
