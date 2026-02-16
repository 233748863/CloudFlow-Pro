package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.AttendanceAppeal;
import com.cloudflow.oa.mapper.AttendanceAppealMapper;
import com.cloudflow.oa.service.IAttendanceAppealService;
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
 * 补卡/外勤申请 Service 实现类
 */
@Slf4j
@Service
public class AttendanceAppealServiceImpl extends ServiceImpl<AttendanceAppealMapper, AttendanceAppeal>
        implements IAttendanceAppealService {

    @Autowired
    private RemoteWorkflowService remoteWorkflowService;

    @Override
    public IPage<AttendanceAppeal> queryPage(AttendanceAppeal query, int pageNum, int pageSize) {
        LambdaQueryWrapper<AttendanceAppeal> wrapper = new LambdaQueryWrapper<>();
        if (query.getUserId() != null) {
            wrapper.eq(AttendanceAppeal::getUserId, query.getUserId());
        }
        if (StringUtils.hasText(query.getAppealType())) {
            wrapper.eq(AttendanceAppeal::getAppealType, query.getAppealType());
        }
        if (StringUtils.hasText(query.getStatus())) {
            wrapper.eq(AttendanceAppeal::getStatus, query.getStatus());
        }
        // 排除已删除
        wrapper.and(w -> w.isNull(AttendanceAppeal::getDelFlag).or().ne(AttendanceAppeal::getDelFlag, "2"));
        wrapper.orderByDesc(AttendanceAppeal::getCreateTime);
        return page(new Page<>(pageNum, pageSize), wrapper);
    }

    @Override
    public String generateAppealNo() {
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        Integer maxSeq = baseMapper.getTodayMaxSeq();
        int nextSeq = (maxSeq == null ? 0 : maxSeq) + 1;
        return String.format("BK%s%04d", today, nextSeq);
    }

    @Override
    @Audit(name = "创建补卡/外勤申请", spel = "#appeal")
    @Transactional(rollbackFor = Exception.class)
    public boolean createAppeal(AttendanceAppeal appeal) {
        appeal.setAppealNo(generateAppealNo());
        appeal.setStatus("DRAFT");
        return save(appeal);
    }

    @Override
    @Audit(name = "提交补卡/外勤申请", spel = "#id")
    @Transactional(rollbackFor = Exception.class)
    public boolean submitAppeal(Long id) {
        AttendanceAppeal appeal = getById(id);
        if (appeal == null) {
            return false;
        }
        appeal.setStatus("PENDING");

        // 启动工作流
        try {
            Map<String, Object> req = new HashMap<>();
            req.put("processDefinitionKey", "attendance_appeal");
            req.put("businessKey", "ATTENDANCE_APPEAL:" + appeal.getId());
            Map<String, Object> variables = new HashMap<>();
            variables.put("appealId", appeal.getId());
            variables.put("appealNo", appeal.getAppealNo());
            variables.put("appealType", appeal.getAppealType());
            variables.put("userId", appeal.getUserId());
            req.put("variables", variables);

            R<?> result = remoteWorkflowService.startProcess(req);
            if (result != null && result.getCode() == 200 && result.getData() != null) {
                String instanceId = extractInstanceId(result.getData());
                if (instanceId != null) {
                    appeal.setInstanceId(instanceId);
                }
                log.info("补卡/外勤申请 {} 工作流启动成功", appeal.getAppealNo());
            }
        } catch (Exception e) {
            log.error("补卡/外勤申请 {} 启动工作流失败", appeal.getAppealNo(), e);
        }

        return updateById(appeal);
    }

    @Override
    @Audit(name = "取消补卡/外勤申请", spel = "#id")
    @Transactional(rollbackFor = Exception.class)
    public boolean cancelAppeal(Long id) {
        AttendanceAppeal appeal = getById(id);
        if (appeal == null) {
            return false;
        }
        if (!"DRAFT".equals(appeal.getStatus()) && !"PENDING".equals(appeal.getStatus())) {
            log.warn("补卡/外勤申请 {} 当前状态 {} 不允许取消", appeal.getAppealNo(), appeal.getStatus());
            return false;
        }
        appeal.setStatus("CANCELLED");
        return updateById(appeal);
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
