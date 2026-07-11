package com.cloudflow.oa.service.impl;

import cn.hutool.extra.qrcode.QrCodeUtil;
import cn.hutool.extra.qrcode.QrConfig;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.oa.config.properties.OaProperties;
import com.cloudflow.oa.constant.OaBusinessTypes;
import com.cloudflow.oa.domain.Visitor;
import com.cloudflow.oa.domain.dto.InternalWorkflowStartDTO;
import com.cloudflow.oa.domain.dto.BusinessProcessInvalidateDTO;
import com.cloudflow.oa.mapper.ContactMapper;
import com.cloudflow.oa.mapper.VisitorMapper;
import com.cloudflow.oa.service.IVisitorService;
import com.cloudflow.oa.service.remote.RemoteWorkflowService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.io.OutputStream;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * 访客管理 Service 实现类
 */
@Slf4j
@Service
public class VisitorServiceImpl extends ServiceImpl<VisitorMapper, Visitor>
        implements IVisitorService {

    private static final ObjectMapper QR_OBJECT_MAPPER = new ObjectMapper();
    private static final String CALLBACK_STREAM_KEY = "workflow:stream:approval-callback:oa";

    private final ContactMapper contactMapper;
    private final OaProperties oaProperties;
    private final RemoteWorkflowService remoteWorkflowService;

    public VisitorServiceImpl(ContactMapper contactMapper,
                              OaProperties oaProperties,
                              RemoteWorkflowService remoteWorkflowService) {
        this.contactMapper = contactMapper;
        this.oaProperties = oaProperties;
        this.remoteWorkflowService = remoteWorkflowService;
    }

    @Override
    public IPage<Visitor> queryPage(Visitor query, int pageNum, int pageSize) {
        LambdaQueryWrapper<Visitor> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(query.getVisitorName())) {
            wrapper.like(Visitor::getVisitorName, query.getVisitorName());
        }
        if (query.getHostId() != null) {
            wrapper.eq(Visitor::getHostId, query.getHostId());
        }
        if (StringUtils.hasText(query.getStatus())) {
            wrapper.eq(Visitor::getStatus, query.getStatus());
        }
        if (query.getVisitDate() != null) {
            wrapper.eq(Visitor::getVisitDate, query.getVisitDate());
        }
        wrapper.and(w -> w.isNull(Visitor::getDeleted).or().ne(Visitor::getDeleted, "2"));
        wrapper.orderByDesc(Visitor::getCreateTime);
        return page(new Page<>(pageNum, pageSize), wrapper);
    }

    @Override
    @Audit(name = "新增访客预约", spel = "#visitor.visitorName")
    @Transactional(rollbackFor = Exception.class)
    public boolean createVisitor(Visitor visitor) {
        validateVisitor(visitor);
        Map<String, Object> host = requireActiveHost(visitor.getHostId());

        Long tenantId = UserContext.getTenantId() == null ? 100000L : UserContext.getTenantId();
        visitor.setTenantId(tenantId);
        visitor.setHostName(firstText(host, "nick_name", "nickName", "user_name", "userName"));
        visitor.setHostDept(firstText(host, "dept_name", "deptName"));
        visitor.setPassCode(null);
        visitor.setProcessInstanceId(null);

        boolean workflowEnabled = Boolean.TRUE.equals(oaProperties.getVisitor().getWorkflowEnabled());
        visitor.setStatus(workflowEnabled ? "APPROVING" : "PENDING");
        if (!save(visitor)) {
            return false;
        }
        if (workflowEnabled) {
            startVisitorWorkflow(visitor);
        }
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean updateVisitor(Visitor visitor) {
        validateVisitor(visitor);
        Visitor existing = getById(visitor.getVisitorId());
        if (existing == null) {
            throw new IllegalArgumentException("访客预约不存在");
        }
        if (!"PENDING".equals(existing.getStatus())) {
            throw new IllegalArgumentException("仅待确认预约允许修改");
        }
        Map<String, Object> host = requireActiveHost(visitor.getHostId());
        visitor.setTenantId(existing.getTenantId());
        visitor.setHostName(firstText(host, "nick_name", "nickName", "user_name", "userName"));
        visitor.setHostDept(firstText(host, "dept_name", "deptName"));
        visitor.setStatus(existing.getStatus());
        visitor.setPassCode(existing.getPassCode());
        visitor.setProcessInstanceId(existing.getProcessInstanceId());
        visitor.setCreateBy(existing.getCreateBy());
        visitor.setCreateTime(existing.getCreateTime());
        visitor.setUpdateBy(UserContext.getUserName());
        return updateById(visitor);
    }

    @Override
    @Audit(name = "确认访客预约", spel = "#visitorId")
    @Transactional(rollbackFor = Exception.class)
    public boolean confirmVisitor(Long visitorId) {
        Visitor visitor = getById(visitorId);
        if (visitor == null || !"PENDING".equals(visitor.getStatus())) {
            return false;
        }
        visitor.setStatus("CONFIRMED");
        // 生成通行证编号
        visitor.setPassCode(generatePassCode());
        return updateById(visitor);
    }

    @Override
    @Audit(name = "访客签到", spel = "#visitorId")
    @Transactional(rollbackFor = Exception.class)
    public boolean checkInVisitor(Long visitorId) {
        Visitor visitor = getById(visitorId);
        if (visitor == null) {
            return false;
        }
        if (!"CONFIRMED".equals(visitor.getStatus())) {
            log.warn("访客 {} 当前状态 {} 不允许签到", visitor.getVisitorName(), visitor.getStatus());
            return false;
        }
        visitor.setStatus("ARRIVED");
        visitor.setActualArrive(LocalDateTime.now());
        // 如果还没有通行证编号，自动生成
        if (!StringUtils.hasText(visitor.getPassCode())) {
            visitor.setPassCode(generatePassCode());
        }
        return updateById(visitor);
    }

    @Override
    @Audit(name = "访客签退", spel = "#visitorId")
    @Transactional(rollbackFor = Exception.class)
    public boolean checkOutVisitor(Long visitorId) {
        Visitor visitor = getById(visitorId);
        if (visitor == null || !"ARRIVED".equals(visitor.getStatus())) {
            return false;
        }
        visitor.setStatus("COMPLETED");
        visitor.setActualLeave(LocalDateTime.now());
        return updateById(visitor);
    }

    @Override
    @Audit(name = "取消访客预约", spel = "#visitorId", highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public boolean cancelVisitor(Long visitorId) {
        Visitor visitor = getById(visitorId);
        if (visitor == null) {
            return false;
        }
        if ("ARRIVED".equals(visitor.getStatus()) || "COMPLETED".equals(visitor.getStatus())
                || "REJECTED".equals(visitor.getStatus()) || "CANCELLED".equals(visitor.getStatus())) {
            log.warn("访客 {} 当前状态 {} 不允许取消", visitor.getVisitorName(), visitor.getStatus());
            return false;
        }
        if ("APPROVING".equals(visitor.getStatus()) && StringUtils.hasText(visitor.getProcessInstanceId())) {
            BusinessProcessInvalidateDTO invalidate = new BusinessProcessInvalidateDTO();
            invalidate.setTenantId(visitor.getTenantId());
            invalidate.setProcessInstanceId(visitor.getProcessInstanceId());
            invalidate.setBusinessType(OaBusinessTypes.VISITOR_APPROVAL);
            invalidate.setBusinessId(visitor.getVisitorId());
            invalidate.setReason("访客预约已取消");
            R<?> result = remoteWorkflowService.invalidateByBusiness(invalidate);
            if (result == null || !result.isSuccess()) {
                throw new ServiceException(result == null ? "审批流程撤回失败" : result.getMsg());
            }
        }
        visitor.setStatus("CANCELLED");
        return updateById(visitor);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void handleWorkflowResult(Long visitorId, String processInstanceId, boolean approved) {
        Visitor visitor = getById(visitorId);
        if (visitor == null) {
            throw new IllegalStateException("访客预约不存在，visitorId=" + visitorId);
        }
        if (!StringUtils.hasText(processInstanceId)
                || !processInstanceId.equals(visitor.getProcessInstanceId())) {
            log.warn("忽略访客预约旧流程回调: visitorId={}, current={}, callback={}",
                    visitorId, visitor.getProcessInstanceId(), processInstanceId);
            return;
        }
        if (approved && "CONFIRMED".equals(visitor.getStatus())) {
            return;
        }
        if (!approved && "REJECTED".equals(visitor.getStatus())) {
            return;
        }
        if (!"APPROVING".equals(visitor.getStatus())) {
            log.warn("忽略访客预约非审批中状态回调: visitorId={}, status={}", visitorId, visitor.getStatus());
            return;
        }
        visitor.setStatus(approved ? "CONFIRMED" : "REJECTED");
        if (approved && !StringUtils.hasText(visitor.getPassCode())) {
            visitor.setPassCode(generatePassCode());
        }
        visitor.setUpdateBy(WorkflowCallbackConstants.WORKFLOW_UPDATE_BY);
        if (!updateById(visitor)) {
            throw new IllegalStateException("访客预约审批结果回写失败，visitorId=" + visitorId);
        }
    }

    @Override
    public String generatePassCode() {
        // 生成8位通行证编号：VIS + 随机5位
        return "VIS" + UUID.randomUUID().toString().substring(0, 5).toUpperCase();
    }

    @Override
    public void generateQrCode(Long visitorId, OutputStream outputStream) {
        Visitor visitor = getById(visitorId);
        if (visitor == null) {
            throw new ServiceException("访客记录不存在");
        }
        if (!StringUtils.hasText(visitor.getPassCode())) {
            throw new ServiceException("通行码不存在，请先确认预约");
        }

        Map<String, Object> content = new LinkedHashMap<>();
        content.put("type", "VISITOR_PASS");
        content.put("visitorId", visitor.getVisitorId());
        content.put("passCode", visitor.getPassCode());
        content.put("visitorName", visitor.getVisitorName());
        content.put("visitorCompany", visitor.getVisitorCompany());
        content.put("hostName", visitor.getHostName());
        content.put("visitDate", visitor.getVisitDate() == null ? null : visitor.getVisitDate().toString());

        QrConfig config = new QrConfig(300, 300);
        config.setMargin(2);
        config.setErrorCorrection(ErrorCorrectionLevel.M);
        QrCodeUtil.generate(toQrContent(content), config, "png", outputStream);
    }

    private String toQrContent(Map<String, Object> content) {
        try {
            return QR_OBJECT_MAPPER.writeValueAsString(content);
        } catch (JsonProcessingException e) {
            throw new ServiceException("访客通行二维码内容生成失败");
        }
    }

    private void validateVisitor(Visitor visitor) {
        if (visitor == null || !StringUtils.hasText(visitor.getVisitorName())
                || !StringUtils.hasText(visitor.getVisitReason()) || visitor.getVisitDate() == null) {
            throw new IllegalArgumentException("请填写访客姓名、来访日期和来访事由");
        }
        if (visitor.getHostId() == null || visitor.getHostId() <= 0) {
            throw new IllegalArgumentException("请选择被访者");
        }
        if (visitor.getVisitorCount() == null || visitor.getVisitorCount() < 1) {
            visitor.setVisitorCount(1);
        }
    }

    private Map<String, Object> requireActiveHost(Long hostId) {
        Map<String, Object> host = contactMapper.selectUserDetail(hostId);
        if (host == null || host.isEmpty() || !"0".equals(String.valueOf(mapValue(host, "status")))) {
            throw new IllegalArgumentException("请选择有效的在职被访者");
        }
        return host;
    }

    private void startVisitorWorkflow(Visitor visitor) {
        InternalWorkflowStartDTO dto = new InternalWorkflowStartDTO();
        dto.setTenantId(visitor.getTenantId());
        String processKey = oaProperties.getVisitor().getWorkflowProcessKey();
        dto.setProcessDefKey(StringUtils.hasText(processKey) ? processKey : "visitor_approval");
        dto.setBusinessKey("VISITOR:" + visitor.getVisitorId());
        dto.setStartUserId(UserContext.getUserId());
        dto.setStartUserName(UserContext.getUserName());

        Map<String, Object> variables = new HashMap<>();
        variables.put("visitorId", visitor.getVisitorId());
        variables.put("visitorName", visitor.getVisitorName());
        variables.put("visitorCompany", visitor.getVisitorCompany());
        variables.put("visitorCount", visitor.getVisitorCount());
        variables.put("visitDate", visitor.getVisitDate().toString());
        variables.put("visitReason", visitor.getVisitReason());
        variables.put("hostId", visitor.getHostId());
        variables.put("hostName", visitor.getHostName());
        variables.put("hostDept", visitor.getHostDept());
        WorkflowCallbackConstants.applyCallbackMetadata(
                variables, OaBusinessTypes.VISITOR_APPROVAL, visitor.getVisitorId(),
                "VISITOR:" + visitor.getVisitorId(), CALLBACK_STREAM_KEY);
        dto.setVariables(variables);

        R<?> result = remoteWorkflowService.startProcessInternal(dto);
        String instanceId = result != null && result.isSuccess() ? extractInstanceId(result.getData()) : null;
        LambdaUpdateWrapper<Visitor> update = new LambdaUpdateWrapper<>();
        update.eq(Visitor::getVisitorId, visitor.getVisitorId())
                .and(w -> w.isNull(Visitor::getProcessInstanceId).or().eq(Visitor::getProcessInstanceId, ""));
        if (StringUtils.hasText(instanceId)) {
            update.set(Visitor::getProcessInstanceId, instanceId)
                    .set(Visitor::getStatus, "APPROVING");
        } else {
            update.eq(Visitor::getStatus, "APPROVING")
                    .set(Visitor::getStatus, "APPROVAL_FAILED");
        }
        update(update);
    }

    private String extractInstanceId(Object data) {
        if (data instanceof Map<?, ?> map) {
            Object value = map.get("processInstanceId");
            if (value == null) {
                value = map.get("instanceId");
            }
            return value == null ? null : String.valueOf(value);
        }
        return null;
    }

    private Object mapValue(Map<String, Object> map, String key) {
        return map.get(key);
    }

    private String firstText(Map<String, Object> map, String... keys) {
        for (String key : keys) {
            Object value = mapValue(map, key);
            if (value != null && StringUtils.hasText(String.valueOf(value))) {
                return String.valueOf(value);
            }
        }
        return null;
    }
}
