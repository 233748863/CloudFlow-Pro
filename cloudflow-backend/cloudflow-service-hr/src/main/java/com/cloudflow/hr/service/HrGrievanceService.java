package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.holiday.api.HolidayCalendarService;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.message.constant.MessageCategory;
import com.cloudflow.common.redis.config.RuntimeSysConfigService;
import com.cloudflow.hr.domain.dto.HrGrievanceAction;
import com.cloudflow.hr.domain.dto.HrGrievanceQuery;
import com.cloudflow.hr.domain.dto.HrGrievanceRequest;
import com.cloudflow.hr.domain.dto.dispute.HrDisputeEvidenceDTO;
import com.cloudflow.hr.domain.dto.dispute.HrLaborDisputeDTO;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrGrievance;
import com.cloudflow.hr.domain.entity.HrGrievanceRecord;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrFileStorageMapper;
import com.cloudflow.hr.mapper.HrGrievanceMapper;
import com.cloudflow.hr.mapper.HrGrievanceRecordMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class HrGrievanceService {
    private final HrGrievanceMapper grievanceMapper;
    private final HrGrievanceRecordMapper recordMapper;
    private final HrGrievanceAccessService access;
    private final HrEssSupport essSupport;
    private final HrRuleSupport support;
    private final HrFileStorage storage;
    private final HrFileStorageMapper fileMapper;
    private final HrMessageService employeeMessages;
    private final MessageSender messageSender;
    private final HolidayCalendarService calendars;
    private final RuntimeSysConfigService config;
    private final IHrLaborDisputeService disputes;
    private final ObjectMapper objectMapper;

    public Long submit(HrGrievanceRequest request) {
        HrEmployee employee = support.employee(essSupport.currentEmployeeId());
        requireValue(request.getGrievanceType(), Set.of("SALARY", "PERFORMANCE", "MANAGEMENT", "WORKPLACE", "POLICY", "OTHER"), "申诉类型");
        String againstType = StringUtils.hasText(request.getAgainstType()) ? request.getAgainstType() : "NONE";
        requireValue(againstType, Set.of("USER", "DEPT", "POLICY", "NONE"), "指向类型");
        String priority = StringUtils.hasText(request.getPriority()) ? request.getPriority() : "NORMAL";
        requireValue(priority, Set.of("LOW", "NORMAL", "HIGH", "URGENT"), "优先级");
        requireText(request.getSubject(), "标题");
        requireText(request.getDescription(), "描述");
        if ((request.getRelatedBizId() == null) != !StringUtils.hasText(request.getRelatedBizType())) {
            throw new HrBusinessException("INVALID_PARAMETER", "关联业务类型和单据编号须同时填写");
        }
        String attachments = ownedAttachments(request.getFileIds());
        return support.transaction(() -> {
            HrGrievance grievance = new HrGrievance();
            grievance.setTenantId(HrRuleSupport.tenantId());
            grievance.setGrievanceNo("GR-" + UUID.randomUUID().toString().replace("-", ""));
            grievance.setEmployeeId(employee.getId());
            grievance.setEmployeeName(employee.getName());
            grievance.setDeptId(employee.getDeptId());
            grievance.setGrievanceType(request.getGrievanceType());
            grievance.setSubject(request.getSubject().trim());
            grievance.setDescription(request.getDescription().trim());
            grievance.setCause(request.getCause());
            grievance.setExpectation(request.getExpectation());
            grievance.setAgainstType(againstType);
            if ("USER".equals(againstType)) {
                Map<String, Object> target = activeUser(request.getAgainstId());
                if (Objects.equals(request.getAgainstId(), UserContext.getUserId())) {
                    throw new HrBusinessException("INVALID_PARAMETER", "申诉不能指向本人");
                }
                grievance.setAgainstId(request.getAgainstId());
                grievance.setAgainstName(String.valueOf(target.get("userName")));
            } else if ("DEPT".equals(againstType)) {
                String deptName = grievanceMapper.selectDeptName(HrRuleSupport.tenantId(), request.getAgainstId());
                if (deptName == null) throw new HrBusinessException("INVALID_PARAMETER", "指向部门不存在");
                grievance.setAgainstId(request.getAgainstId());
                grievance.setAgainstName(deptName);
            } else if ("POLICY".equals(againstType)) {
                requireText(request.getAgainstName(), "制度名称");
                grievance.setAgainstId(request.getAgainstId());
                grievance.setAgainstName(request.getAgainstName());
            }
            grievance.setRelatedBizType(request.getRelatedBizType());
            grievance.setRelatedBizId(request.getRelatedBizId());
            grievance.setAttachmentUrl(attachments);
            grievance.setPriority(priority);
            grievance.setStatus("SUBMITTED");
            grievance.setDeleted(0);
            grievance.setVersion(0);
            grievance.setCreateBy(HrRuleSupport.userName());
            grievance.setCreateTime(LocalDateTime.now());
            grievance.setUpdateBy(HrRuleSupport.userName());
            grievance.setUpdateTime(grievance.getCreateTime());
            grievanceMapper.insert(grievance);
            record(grievance, "STATUS_CHANGE", "提交申诉", null, true, true);
            noticeHr(grievance, "有新的员工申诉待受理");
            support.audit("GRIEVANCE", grievance.getGrievanceId(), "SUBMIT", Map.of("status", grievance.getStatus()));
            return grievance.getGrievanceId();
        });
    }

    public PageResult<HrGrievance> page(HrGrievanceQuery query, boolean mine) {
        LambdaQueryWrapper<HrGrievance> wrapper = filtered(query, mine).orderByDesc(HrGrievance::getCreateTime);
        Page<HrGrievance> page = grievanceMapper.selectPage(query.build(), wrapper);
        if (!mine) support.audit("GRIEVANCE", null, "VIEW_LIST", Map.of("ids", page.getRecords().stream().map(HrGrievance::getGrievanceId).toList()));
        return PageResult.build(page);
    }

    public Map<String, Object> detail(Long grievanceId, boolean mine) {
        HrGrievance grievance = access.require(grievanceId, mine);
        if (!mine) support.audit("GRIEVANCE", grievanceId, "VIEW", Map.of());
        return Map.of("grievance", grievance, "records", records(grievanceId, mine), "canAssign", !mine && access.humanResources());
    }

    public void action(Long grievanceId, String action, HrGrievanceAction request, boolean mine) {
        if (request == null || action == null) throw new HrBusinessException("INVALID_PARAMETER", "请指定申诉操作及内容");
        if (mine && !Set.of("withdraw", "confirm", "comment").contains(action)
                || !mine && !Set.of("accept", "assign", "investigate", "resolve", "escalate", "comment").contains(action)) {
            throw new HrBusinessException("FORBIDDEN", "当前入口不允许该操作");
        }
        String attachments = ownedAttachments(request.getFileIds());
        support.locked("grievance:" + grievanceId, () -> {
            HrGrievance grievance = access.require(grievanceId, mine);
            if (HrGrievanceRules.terminal(grievance.getStatus())) throw new HrBusinessException("GRIEVANCE_CLOSED", "申诉已结束，不能继续修改");
            if ("comment".equals(action)) {
                requireText(request.getContent(), "补充说明");
                record(grievance, "COMMENT", request.getContent(), attachments,
                        mine || !Boolean.FALSE.equals(request.getVisibleToEmployee()), mine);
            } else if ("assign".equals(action)) {
                if (!access.humanResources()) throw new HrBusinessException("FORBIDDEN", "仅人力资源角色可分派处理人");
                if (!Set.of("SUBMITTED", "ACCEPTED", "INVESTIGATING").contains(grievance.getStatus())) {
                    throw new HrBusinessException("GRIEVANCE_STATUS_INVALID", "当前状态不能分派");
                }
                Map<String, Object> handler = handlers(grievanceId).stream()
                        .filter(user -> Objects.equals(((Number) user.get("userId")).longValue(), request.getHandlerId()))
                        .findFirst().orElseThrow(() -> new HrBusinessException("INVALID_PARAMETER", "处理人无处理权限或与申诉存在利益冲突"));
                grievance.setHandlerId(request.getHandlerId());
                grievance.setHandlerName(String.valueOf(handler.get("userName")));
                record(grievance, "ASSIGN", "已分派处理人：" + grievance.getHandlerName(), null, true, false);
                noticeUser(grievance.getHandlerId(), grievance, "有员工申诉分派给您");
            } else {
                String previous = grievance.getStatus();
                String next = HrGrievanceRules.nextStatus(grievance, action, request.getSatisfied());
                if ("resolve".equals(action)) {
                    requireText(request.getContent(), "处理结论");
                    grievance.setResolutionDetail(request.getContent());
                    grievance.setResolutionDate(LocalDate.now());
                } else if ("accept".equals(action)) {
                    grievance.setAcceptTime(LocalDateTime.now());
                    if (grievance.getHandlerId() == null) {
                        grievance.setHandlerId(UserContext.getUserId());
                        grievance.setHandlerName(HrRuleSupport.userName());
                    }
                } else if ("confirm".equals(action)) {
                    if (!request.getSatisfied()) requireText(request.getContent(), "不认可原因");
                    grievance.setSatisfiedFlag(request.getSatisfied() ? 1 : 0);
                } else if ("escalate".equals(action)) {
                    if (!access.humanResources()) throw new HrBusinessException("FORBIDDEN", "仅人力资源角色可升级劳动争议");
                    requireText(request.getContent(), "升级原因");
                    grievance.setEscalatedDisputeId(escalate(grievance, request.getContent()));
                }
                grievance.setStatus(next);
                record(grievance, "escalate".equals(action) ? "ESCALATE" : "STATUS_CHANGE",
                        previous + " → " + next + (StringUtils.hasText(request.getContent()) ? "\n" + request.getContent() : ""), attachments, true, mine);
                if (Set.of("accept", "resolve", "escalate").contains(action)) noticeEmployee(grievance, "您的申诉处理进度已更新");
            }
            grievance.setUpdateBy(HrRuleSupport.userName());
            grievance.setUpdateTime(LocalDateTime.now());
            grievanceMapper.updateById(grievance);
            support.audit("GRIEVANCE", grievanceId, action.toUpperCase(java.util.Locale.ROOT), Map.of("status", grievance.getStatus()));
            return null;
        });
    }

    public List<Map<String, Object>> handlers(Long grievanceId) {
        HrGrievance grievance = access.require(grievanceId, false);
        if (!access.humanResources()) throw new HrBusinessException("FORBIDDEN", "仅人力资源角色可分派处理人");
        Long applicantUser = support.employee(grievance.getEmployeeId()).getUserId();
        return grievanceMapper.selectHandlers(HrRuleSupport.tenantId()).stream().filter(user -> {
            Long userId = ((Number) user.get("userId")).longValue();
            return !Objects.equals(userId, applicantUser) && !HrGrievanceRules.targeted(grievance, userId);
        }).toList();
    }

    public Map<String, Object> upload(MultipartFile file, boolean mine) {
        if (mine) essSupport.currentEmployeeId();
        else if (UserContext.getUserId() == null) throw new HrBusinessException("UNAUTHORIZED", "请先登录");
        if (file == null || file.isEmpty() || file.getSize() > 10 * 1024 * 1024) {
            throw new HrBusinessException("INVALID_PARAMETER", "请选择不超过 10 MB 的附件");
        }
        String originalName = file.getOriginalFilename() == null ? "attachment.bin" : file.getOriginalFilename();
        String safeName = originalName.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
        if (safeName.length() > 128) safeName = safeName.substring(safeName.length() - 128);
        if (!safeName.matches(".*\\.[A-Za-z0-9]{1,10}$")) safeName += ".bin";
        try {
            Long fileId = storage.save(file.getBytes(), safeName, "HR_GRIEVANCE");
            support.audit("GRIEVANCE", null, "UPLOAD", Map.of("fileId", fileId));
            return Map.of("fileId", fileId, "fileName", safeName);
        } catch (IOException exception) {
            throw new HrBusinessException("FILE_READ_FAILED", "读取附件失败", exception);
        }
    }

    public String authorizeDownload(Long grievanceId, Long fileId, boolean mine) {
        HrGrievance grievance = access.require(grievanceId, mine);
        Set<Long> allowed = new LinkedHashSet<>(attachmentIds(grievance.getAttachmentUrl()));
        records(grievanceId, mine).forEach(record -> allowed.addAll(attachmentIds(record.getAttachmentUrl())));
        if (!allowed.contains(fileId)) throw new HrBusinessException("FORBIDDEN", "无权访问该附件");
        Map<String, Object> metadata = fileMapper.selectFileMetadata(fileId, HrRuleSupport.tenantId());
        if (metadata == null || !Set.of("HR_GRIEVANCE", "HR_GRIEVANCE_EVIDENCE").contains(String.valueOf(metadata.get("fileType")))) {
            throw new HrBusinessException("FORBIDDEN", "申诉附件不存在或用途不匹配");
        }
        return metadata.get("fileType").toString();
    }

    public String authorizeDisputeDownload(Long disputeId, Long fileId) {
        HrGrievance grievance = access.linkedDispute(disputeId);
        return authorizeDownload(grievance.getGrievanceId(), fileId, false);
    }

    public org.springframework.http.ResponseEntity<byte[]> download(Long grievanceId, Long fileId, boolean mine) {
        String purpose = authorizeDownload(grievanceId, fileId, mine);
        support.audit("GRIEVANCE", grievanceId, "DOWNLOAD", Map.of("fileId", fileId));
        return org.springframework.http.ResponseEntity.ok().contentType(org.springframework.http.MediaType.APPLICATION_OCTET_STREAM)
                .header(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION, org.springframework.http.ContentDisposition.attachment()
                        .filename(storage.fileName(fileId, purpose), java.nio.charset.StandardCharsets.UTF_8).build().toString())
                .header(org.springframework.http.HttpHeaders.CACHE_CONTROL, "no-store").header("X-Content-Type-Options", "nosniff")
                .body(storage.loadPrivate(fileId, purpose));
    }

    public org.springframework.http.ResponseEntity<byte[]> downloadDisputeFile(Long disputeId, Long fileId) {
        HrGrievance grievance = access.linkedDispute(disputeId);
        return download(grievance.getGrievanceId(), fileId, false);
    }

    public Map<String, Object> statistics(HrGrievanceQuery query) {
        List<HrGrievance> rows = grievanceMapper.selectList(filtered(query, false));
        Map<String, Long> types = rows.stream().collect(Collectors.groupingBy(HrGrievance::getGrievanceType, LinkedHashMap::new, Collectors.counting()));
        Map<String, Long> departments = rows.stream().collect(Collectors.groupingBy(row -> {
            String name = row.getDeptId() == null ? null : grievanceMapper.selectDeptName(HrRuleSupport.tenantId(), row.getDeptId());
            return name == null ? "未分配部门" : name;
        }, LinkedHashMap::new, Collectors.counting()));
        Map<String, Long> durations = new LinkedHashMap<>(Map.of("0–3天", 0L, "4–7天", 0L, "8天及以上", 0L));
        rows.stream().filter(row -> row.getResolutionDate() != null).forEach(row -> {
            long days = ChronoUnit.DAYS.between(row.getCreateTime().toLocalDate(), row.getResolutionDate());
            durations.merge(days <= 3 ? "0–3天" : days <= 7 ? "4–7天" : "8天及以上", 1L, Long::sum);
        });
        support.audit("GRIEVANCE", null, "VIEW_STATISTICS", Map.of("count", rows.size()));
        return Map.of("total", rows.size(), "byType", chart(types), "byDept", chart(departments), "byDuration", chart(durations));
    }

    public int remindUnaccepted(LocalDate date) {
        int threshold = config.getInt("sys.hr.grievance.acceptWorkdays", 3);
        if (threshold < 1 || threshold > 365) throw new HrBusinessException("CONFIG_INVALID", "申诉提醒工作日数必须为 1 至 365");
        int reminded = 0;
        for (HrGrievance candidate : grievanceMapper.selectList(new LambdaQueryWrapper<HrGrievance>()
                .eq(HrGrievance::getTenantId, HrRuleSupport.tenantId()).eq(HrGrievance::getDeleted, 0).eq(HrGrievance::getStatus, "SUBMITTED"))) {
            boolean sent = support.locked("grievance:" + candidate.getGrievanceId(), () -> {
                HrGrievance grievance = grievanceMapper.selectById(candidate.getGrievanceId());
                if (!"SUBMITTED".equals(grievance.getStatus())) return false;
                String reminder = "超时未受理提醒（" + date + "）";
                if (recordMapper.selectCount(new LambdaQueryWrapper<HrGrievanceRecord>()
                        .eq(HrGrievanceRecord::getTenantId, HrRuleSupport.tenantId()).eq(HrGrievanceRecord::getGrievanceId, grievance.getGrievanceId())
                        .eq(HrGrievanceRecord::getRecordType, "COMMENT").eq(HrGrievanceRecord::getContent, reminder)) > 0) return false;
                int workdays = 0;
                for (LocalDate current = grievance.getCreateTime().toLocalDate().plusDays(1); !current.isAfter(date); current = current.plusDays(1)) {
                    if (calendars.isWorkday(calendars.resolveCalendarId(grievance.getEmployeeId(), current), current)) workdays++;
                    if (workdays >= threshold) break;
                }
                if (workdays < threshold) return false;
                noticeHr(grievance, "有员工申诉超过受理提醒时限");
                record(grievance, "COMMENT", reminder, null, false, false);
                support.audit("GRIEVANCE", grievance.getGrievanceId(), "REMIND", Map.of("date", date.toString()));
                return true;
            });
            if (sent) reminded++;
        }
        return reminded;
    }

    private Long escalate(HrGrievance grievance, String reason) {
        HrLaborDisputeDTO dispute = new HrLaborDisputeDTO();
        dispute.setDisputeNo("LD-" + UUID.randomUUID().toString().replace("-", ""));
        dispute.setApplicantEmployeeId(grievance.getEmployeeId());
        dispute.setDisputeType("SALARY".equals(grievance.getGrievanceType()) ? "SALARY" : "OTHER");
        dispute.setClaimDescription("来源员工申诉 " + grievance.getGrievanceNo() + "，完整描述、附件和处理轨迹见受限证据。");
        dispute.setRemark("来源申诉：" + grievance.getGrievanceNo());
        Long disputeId = disputes.registerDispute(dispute);
        List<HrGrievanceRecord> history = records(grievance.getGrievanceId(), false);
        Set<Long> files = new LinkedHashSet<>(attachmentIds(grievance.getAttachmentUrl()));
        history.forEach(record -> files.addAll(attachmentIds(record.getAttachmentUrl())));
        try {
            Long archiveId = storage.save(objectMapper.writeValueAsBytes(Map.of("grievance", grievance, "records", history, "escalationReason", reason)),
                    "grievance-" + grievance.getGrievanceId() + ".json", "HR_GRIEVANCE_EVIDENCE");
            files.add(archiveId);
            record(grievance, "COMMENT", "升级劳动争议的完整材料归档", objectMapper.writeValueAsString(List.of(archiveId)), false, false);
        } catch (IOException exception) {
            throw new HrBusinessException("GRIEVANCE_EXPORT_FAILED", "申诉材料归档失败", exception);
        }
        for (Long fileId : files) {
            HrDisputeEvidenceDTO evidence = new HrDisputeEvidenceDTO();
            evidence.setEvidenceType("OTHER");
            evidence.setFileId(fileId);
            evidence.setRemark("申诉材料，沿用来源申诉访问限制");
            disputes.attachEvidence(disputeId, evidence);
        }
        return disputeId;
    }

    private LambdaQueryWrapper<HrGrievance> filtered(HrGrievanceQuery query, boolean mine) {
        return access.query(mine).eq(StringUtils.hasText(query.getStatus()), HrGrievance::getStatus, query.getStatus())
                .eq(StringUtils.hasText(query.getGrievanceType()), HrGrievance::getGrievanceType, query.getGrievanceType())
                .eq(query.getDeptId() != null, HrGrievance::getDeptId, query.getDeptId())
                .eq(query.getHandlerId() != null, HrGrievance::getHandlerId, query.getHandlerId());
    }

    private List<HrGrievanceRecord> records(Long grievanceId, boolean mine) {
        return recordMapper.selectList(new LambdaQueryWrapper<HrGrievanceRecord>()
                .eq(HrGrievanceRecord::getTenantId, HrRuleSupport.tenantId()).eq(HrGrievanceRecord::getGrievanceId, grievanceId)
                .eq(mine, HrGrievanceRecord::getVisibleToEmployeeFlag, 1).orderByAsc(HrGrievanceRecord::getRecordId));
    }

    private void record(HrGrievance grievance, String type, String content, String attachments, boolean visible, boolean mine) {
        HrGrievanceRecord record = new HrGrievanceRecord();
        record.setTenantId(HrRuleSupport.tenantId());
        record.setGrievanceId(grievance.getGrievanceId());
        record.setRecordType(type);
        record.setOperatorId(UserContext.getUserId());
        record.setOperatorName(HrRuleSupport.userName());
        record.setOperatorRole(mine ? "EMPLOYEE" : access.humanResources() ? "HR" : "MANAGER");
        record.setContent(content);
        record.setAttachmentUrl(attachments);
        record.setVisibleToEmployeeFlag(visible ? 1 : 0);
        record.setCreateBy(HrRuleSupport.userName());
        record.setCreateTime(LocalDateTime.now());
        recordMapper.insert(record);
    }

    private String ownedAttachments(List<Long> fileIds) {
        if (fileIds == null || fileIds.isEmpty()) return null;
        if (fileIds.size() > 10 || fileIds.stream().anyMatch(Objects::isNull)) throw new HrBusinessException("INVALID_PARAMETER", "附件清单不合法");
        List<Long> distinct = fileIds.stream().distinct().toList();
        if (fileMapper.countOwnedGrievanceFiles(HrRuleSupport.tenantId(), HrRuleSupport.userName(), distinct) != distinct.size()) {
            throw new HrBusinessException("FORBIDDEN", "附件须通过申诉入口由本人上传");
        }
        try { return objectMapper.writeValueAsString(distinct); }
        catch (IOException exception) { throw new HrBusinessException("INVALID_PARAMETER", "附件清单不合法", exception); }
    }

    private List<Long> attachmentIds(String attachments) {
        if (!StringUtils.hasText(attachments)) return List.of();
        try { return objectMapper.readValue(attachments, new TypeReference<List<Long>>() { }); }
        catch (IOException exception) { throw new HrBusinessException("GRIEVANCE_ATTACHMENT_INVALID", "附件记录格式不正确", exception); }
    }

    private Map<String, Object> activeUser(Long userId) {
        Map<String, Object> user = userId == null ? null : grievanceMapper.selectActiveUser(HrRuleSupport.tenantId(), userId);
        if (user == null) throw new HrBusinessException("INVALID_PARAMETER", "指定用户不存在或已停用");
        return user;
    }

    private void noticeHr(HrGrievance grievance, String title) {
        Long applicantUser = support.employee(grievance.getEmployeeId()).getUserId();
        grievanceMapper.selectHrUsers(HrRuleSupport.tenantId()).stream().map(user -> ((Number) user.get("userId")).longValue())
                .filter(userId -> !Objects.equals(userId, applicantUser) && !HrGrievanceRules.targeted(grievance, userId))
                .forEach(userId -> noticeUser(userId, grievance, title));
    }

    private void noticeUser(Long userId, HrGrievance grievance, String title) {
        messageSender.send(MessageSendRequest.builder().templateCode("HR_GRIEVANCE_NOTICE")
                .receivers(List.of(MessageReceiver.ofUser(userId))).category(MessageCategory.BIZ_REMINDER)
                .bizType("HR_GRIEVANCE").bizId(String.valueOf(grievance.getGrievanceId()))
                .title(title).content("请登录申诉管理查看，消息不包含申诉内容。")
                .params(Map.of("title", title, "content", "请登录申诉管理查看，消息不包含申诉内容。"))
                .linkUrl("/hr/grievances?id=" + grievance.getGrievanceId()).build());
    }

    private void noticeEmployee(HrGrievance grievance, String title) {
        employeeMessages.sendToEmployee(HrRuleSupport.tenantId(), grievance.getEmployeeId(), "BIZ_REMINDER", title,
                "请登录员工自助查看处理进度。", "/hr/ess/grievances?id=" + grievance.getGrievanceId(), "HR_GRIEVANCE", grievance.getGrievanceId());
    }

    private List<Map<String, Object>> chart(Map<String, Long> values) {
        List<Map<String, Object>> result = new ArrayList<>();
        values.forEach((name, value) -> result.add(Map.of("name", name, "value", value)));
        return result;
    }

    private void requireValue(String value, Set<String> allowed, String label) {
        if (value == null || !allowed.contains(value)) throw new HrBusinessException("INVALID_PARAMETER", label + "不合法");
    }

    private void requireText(String value, String label) {
        if (!StringUtils.hasText(value)) throw new HrBusinessException("INVALID_PARAMETER", label + "不能为空");
    }
}
