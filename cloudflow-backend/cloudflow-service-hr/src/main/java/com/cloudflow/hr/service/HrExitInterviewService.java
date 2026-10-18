package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.utils.file.FileUploadUtils;
import com.cloudflow.hr.domain.dto.HrExitInterviewRequests;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrExitInterview;
import com.cloudflow.hr.domain.entity.HrFinalSettlement;
import com.cloudflow.hr.domain.entity.HrLifecycleApplication;
import com.cloudflow.hr.domain.vo.settlement.HrExitInterviewView;
import com.cloudflow.hr.mapper.HrEmployeeAdvanceMapper;
import com.cloudflow.hr.mapper.HrExitInterviewMapper;
import com.cloudflow.hr.mapper.HrFinalSettlementMapper;
import com.cloudflow.hr.mapper.HrHMapper;
import com.cloudflow.hr.mapper.HrLifecycleApplicationMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import static com.cloudflow.hr.service.HrHException.conflict;
import static com.cloudflow.hr.service.HrHException.forbidden;
import static com.cloudflow.hr.service.HrHException.invalid;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;
import static com.cloudflow.hr.service.HrRuleSupport.userName;

@Service
@RequiredArgsConstructor
public class HrExitInterviewService {
    private static final String PERMISSION = "hr:exit-interview:manage";
    private static final String PURPOSE = "HR_EXIT_INTERVIEW";
    private static final long MAX_FILE_SIZE = 10L * 1024 * 1024;
    private final HrExitInterviewMapper interviews;
    private final HrLifecycleApplicationMapper applications;
    private final HrFinalSettlementMapper settlements;
    private final HrEmployeeAdvanceMapper employees;
    private final HrHMapper identities;
    private final HrHSupport access;
    private final HrRuleSupport support;
    private final HrFileStorage storage;
    private final ObjectMapper json;

    public PageResult<HrExitInterviewView> list(HrExitInterviewRequests.Query query) {
        access.permission(PERMISSION); access.validate(query);
        if (query.getPageNum() == null || query.getPageSize() == null) throw invalid("分页参数不能为空");
        List<Long> employeeIds = access.scopedEmployees(query, false).stream().filter(identifier -> !access.owner(identifier)).toList();
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            employeeIds = employeeIds.stream().filter(identifier -> access.employee(identifier).getName().contains(query.getKeyword().trim())).toList();
        }
        if (employeeIds.isEmpty()) return new PageResult<>(List.of(), 0L, query.getPageNum(), query.getPageSize());
        Page<HrExitInterview> page = interviews.selectPage(new Page<>(query.getPageNum(), query.getPageSize()),
                new LambdaQueryWrapper<HrExitInterview>().eq(HrExitInterview::getTenantId, tenantId())
                        .in(HrExitInterview::getEmployeeId, employeeIds)
                        .eq(query.getLifecycleApplicationId() != null, HrExitInterview::getLifecycleApplicationId, query.getLifecycleApplicationId())
                        .eq(query.getStatus() != null, HrExitInterview::getStatus, query.getStatus())
                        .orderByDesc(HrExitInterview::getInterviewTime).orderByDesc(HrExitInterview::getInterviewId));
        return new PageResult<>(page.getRecords().stream().map(this::view).toList(), page.getTotal(), page.getCurrent(), page.getSize());
    }

    public HrExitInterviewView detail(Long interviewId) { return view(visible(interviewId)); }

    public PageResult<HrExitInterviewView.Option> applications(HrExitInterviewRequests.Query query) {
        access.permission(PERMISSION); access.validate(query);
        if (query.getPageNum() == null || query.getPageSize() == null) throw invalid("分页参数不能为空");
        List<Long> employeeIds = access.scopedEmployees(query, false).stream().filter(identifier -> !access.owner(identifier)).toList();
        if (employeeIds.isEmpty()) return new PageResult<>(List.of(), 0L, query.getPageNum(), query.getPageSize());
        LambdaQueryWrapper<HrLifecycleApplication> filter = new LambdaQueryWrapper<HrLifecycleApplication>()
                .eq(HrLifecycleApplication::getTenantId, tenantId()).eq(HrLifecycleApplication::getDeleted, 0)
                .eq(HrLifecycleApplication::getType, "RESIGNATION").in(HrLifecycleApplication::getEmployeeId, employeeIds);
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            String keyword = query.getKeyword().trim();
            List<Long> namedEmployees = employeeIds.stream().filter(identifier -> access.employee(identifier).getName().contains(keyword)).toList();
            filter.and(matches -> {
                matches.like(HrLifecycleApplication::getApplicationNo, keyword);
                if (!namedEmployees.isEmpty()) matches.or().in(HrLifecycleApplication::getEmployeeId, namedEmployees);
            });
        }
        Page<HrLifecycleApplication> page = applications.selectPage(new Page<>(query.getPageNum(), query.getPageSize()), filter.orderByDesc(HrLifecycleApplication::getId));
        return new PageResult<>(page.getRecords().stream().map(application -> new HrExitInterviewView.Option(application.getId(),
                access.employee(application.getEmployeeId()).getName() + " · " + application.getApplicationNo()
                        + (application.getEffectiveDate() == null ? "" : " · " + application.getEffectiveDate()))).toList(), page.getTotal(), page.getCurrent(), page.getSize());
    }

    public PageResult<HrExitInterviewView.Option> interviewers(HrExitInterviewRequests.Query query) {
        access.permission(PERMISSION); access.validate(query);
        if (query.getPageNum() == null || query.getPageSize() == null) throw invalid("分页参数不能为空");
        HrLifecycleApplication source = application(query.getLifecycleApplicationId()); access.operator(source.getEmployeeId(), PERMISSION);
        HrEmployee employee = access.employee(source.getEmployeeId());
        List<Long> identifiers = identities.permissionUsers(tenantId(), PERMISSION, employee.getDeptId()).stream()
                .filter(identifier -> !Objects.equals(identifier, employee.getUserId())).toList();
        List<HrExitInterviewView.Option> options = identifiers.isEmpty() ? List.of() : interviews.userOptions(tenantId(), identifiers);
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) options = options.stream().filter(option -> option.label().contains(query.getKeyword().trim())).toList();
        long offset = (long) (query.getPageNum() - 1) * query.getPageSize();
        return new PageResult<>(options.stream().skip(offset).limit(query.getPageSize()).toList(), options.size(), query.getPageNum(), query.getPageSize());
    }

    public Long create(HrExitInterviewRequests.Draft input) {
        access.permission(PERMISSION); access.validate(input);
        if (input.getVersion() != null) throw invalid("新建面谈不能指定版本");
        if (input.getAttachmentFileIds() != null && !input.getAttachmentFileIds().isEmpty()) throw invalid("请先保存面谈，再从该面谈上传私有附件");
        HrLifecycleApplication initial = application(input.getLifecycleApplicationId());
        access.operator(initial.getEmployeeId(), PERMISSION);
        return support.transaction(() -> {
            lockEmployee(initial.getEmployeeId());
            lockApplication(input.getLifecycleApplicationId());
            HrLifecycleApplication current = application(input.getLifecycleApplicationId());
            if (!Objects.equals(initial.getEmployeeId(), current.getEmployeeId())) throw conflict("EXIT_INTERVIEW_SOURCE_CHANGED", "离职申请已变化，请刷新");
            access.operator(current.getEmployeeId(), PERMISSION);
            HrExitInterview record = new HrExitInterview();
            record.setTenantId(tenantId()); record.setEmployeeId(current.getEmployeeId());
            record.setLifecycleApplicationId(current.getId()); record.setVersion(0);
            record.setAttachmentFileIds(json.createArrayNode());
            apply(record, input);
            record.setCreateBy(userName()); record.setCreateTime(HrHSupport.now());
            if (interviews.insert(record) != 1) throw conflict("EXIT_INTERVIEW_SAVE_FAILED", "面谈未保存，请刷新后重试");
            audit(record, "CREATE");
            return record.getInterviewId();
        });
    }

    public void update(Long interviewId, HrExitInterviewRequests.Draft input) {
        access.permission(PERMISSION); access.validate(input);
        locked(interviewId, record -> {
            editable(record); HrHSupport.version(input.getVersion(), record.getVersion());
            if (!Objects.equals(record.getLifecycleApplicationId(), input.getLifecycleApplicationId())) throw invalid("面谈不能改绑其他离职申请");
            lockApplication(record.getLifecycleApplicationId());
            HrLifecycleApplication source = application(record.getLifecycleApplicationId());
            if (!Objects.equals(source.getEmployeeId(), record.getEmployeeId())) throw conflict("EXIT_INTERVIEW_SOURCE_CHANGED", "离职申请员工已变化");
            if (input.getAttachmentFileIds() != null) {
                List<Long> existing = attachments(record);
                if (new HashSet<>(input.getAttachmentFileIds()).size() != input.getAttachmentFileIds().size()
                        || !existing.containsAll(input.getAttachmentFileIds())) throw invalid("只能保留或移除本面谈已有附件");
                record.setAttachmentFileIds(json.valueToTree(input.getAttachmentFileIds()));
            }
            apply(record, input); persist(record); audit(record, "UPDATE"); return null;
        });
    }

    public HrExitInterviewView.Attachment upload(Long interviewId, Integer version, MultipartFile file) {
        return locked(interviewId, record -> {
            editable(record); HrHSupport.version(version, record.getVersion());
            List<Long> fileIds = new ArrayList<>(attachments(record));
            if (fileIds.size() >= 50) throw invalid("一份面谈最多保存50个附件");
            FileUploadUtils.ValidatedFile validated;
            byte[] bytes;
            try {
                validated = FileUploadUtils.validate(file, MAX_FILE_SIZE, new String[]{"pdf", "png", "jpg", "jpeg"});
                bytes = file.getBytes();
                if (bytes.length == 0 || bytes.length > MAX_FILE_SIZE || bytes.length != file.getSize()) throw invalid("附件大小无效");
            } catch (Exception failure) { throw invalid("请选择内容与扩展名一致且不超过10MiB的PDF、PNG或JPEG附件"); }
            Long fileId = storage.save(bytes, validated.originalFileName(), PURPOSE);
            if (interviews.bindAttachment(tenantId(), interviewId, fileId, hash(bytes)) != 1) throw conflict("EXIT_INTERVIEW_FILE_BIND_FAILED", "面谈附件未绑定");
            fileIds.add(fileId); record.setAttachmentFileIds(json.valueToTree(fileIds)); persist(record);
            support.audit(PURPOSE, interviewId, "ATTACHMENT_UPLOAD", Map.of("fileId", fileId, "version", record.getVersion(), "fileSize", bytes.length));
            return new HrExitInterviewView.Attachment(fileId, validated.originalFileName(), bytes.length, record.getVersion());
        });
    }

    public ResponseEntity<byte[]> download(Long interviewId, Long fileId) {
        return locked(interviewId, record -> {
            if (fileId == null || !attachments(record).contains(fileId)) throw forbidden();
            HrExitInterviewMapper.AttachmentFile metadata = interviews.attachment(tenantId(), interviewId, fileId);
            if (metadata == null || metadata.fileSize() == null || metadata.fileSize() <= 0 || metadata.fileSize() > MAX_FILE_SIZE) throw forbidden();
            byte[] bytes = storage.loadPrivate(fileId, PURPOSE);
            if (bytes.length != metadata.fileSize() || !hash(bytes).equals(metadata.fileHash())) throw conflict("EXIT_INTERVIEW_FILE_CHANGED", "附件内容与原上传记录不一致");
            support.audit(PURPOSE, interviewId, "ATTACHMENT_DOWNLOAD", Map.of("fileId", fileId));
            return ResponseEntity.ok().contentType(MediaTypeFactory.getMediaType(metadata.fileName()).orElse(MediaType.APPLICATION_OCTET_STREAM))
                    .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(metadata.fileName(), StandardCharsets.UTF_8).build().toString())
                    .header(HttpHeaders.CACHE_CONTROL, "no-store").header("Content-Security-Policy", "default-src 'none'; sandbox")
                    .header("X-Content-Type-Options", "nosniff").body(bytes);
        });
    }

    public void authorizeDownload(Long interviewId, Long fileId) {
        locked(interviewId, record -> {
            if (fileId == null || !attachments(record).contains(fileId)) throw forbidden();
            HrExitInterviewMapper.AttachmentFile metadata = interviews.attachment(tenantId(), interviewId, fileId);
            if (metadata == null || metadata.fileSize() == null || metadata.fileSize() <= 0 || metadata.fileSize() > MAX_FILE_SIZE) throw forbidden();
            return null;
        });
    }

    private void apply(HrExitInterview record, HrExitInterviewRequests.Draft input) {
        HrEmployee employee = access.employee(record.getEmployeeId());
        if (Objects.equals(employee.getUserId(), input.getInterviewerId())
                || !identities.permissionUsers(tenantId(), PERMISSION, employee.getDeptId()).contains(input.getInterviewerId())) {
            throw conflict("EXIT_INTERVIEWER_INVALID", "面谈人须为有该员工管理权限的有效人员，不能为离职员工本人");
        }
        if (input.getSettlementId() != null) {
            HrFinalSettlement settlement = settlements.selectById(input.getSettlementId());
            if (settlement == null || !Objects.equals(settlement.getTenantId(), tenantId())
                    || !Objects.equals(settlement.getEmployeeId(), record.getEmployeeId())
                    || !Objects.equals(settlement.getLifecycleApplicationId(), record.getLifecycleApplicationId())
                    || !"NORMAL".equals(settlement.getSettlementKind())) throw invalid("结算单与本次离职申请不匹配");
        }
        if ("CONFIRMED".equals(input.getStatus()) && input.getInterviewTime().isAfter(HrHSupport.now())) throw invalid("尚未进行的面谈不能确认");
        record.setSettlementId(input.getSettlementId()); record.setInterviewerId(input.getInterviewerId());
        record.setInterviewTime(input.getInterviewTime()); record.setLocation(input.getLocation());
        record.setLeavingReason(input.getLeavingReason()); record.setEmployeeFeedback(input.getEmployeeFeedback());
        record.setManagerComment(input.getManagerComment()); record.setImprovementItems(json.valueToTree(input.getImprovementItems() == null ? List.of() : input.getImprovementItems()));
        record.setStatus(input.getStatus()); record.setUpdateBy(userName()); record.setUpdateTime(HrHSupport.now());
    }

    private void persist(HrExitInterview record) {
        Integer previous = record.getVersion(); record.setUpdateBy(userName()); record.setUpdateTime(HrHSupport.now());
        if (interviews.updateDraft(record, previous) != 1) throw conflict("VERSION_CONFLICT", "面谈已变化，请刷新后重试");
        record.setVersion(previous + 1);
    }

    private void audit(HrExitInterview record, String operation) {
        support.audit(PURPOSE, record.getInterviewId(), operation, Map.of("version", record.getVersion(), "status", record.getStatus(),
                "employeeId", record.getEmployeeId(), "interviewerId", record.getInterviewerId()));
    }

    private HrLifecycleApplication application(Long identifier) {
        HrLifecycleApplication application = identifier == null ? null : applications.selectById(identifier);
        if (application == null || !Objects.equals(application.getTenantId(), tenantId()) || !Integer.valueOf(0).equals(application.getDeleted())
                || !"RESIGNATION".equals(application.getType()) || application.getEmployeeId() == null) throw invalid("请选择本租户有效的离职申请");
        return application;
    }

    private HrExitInterview visible(Long identifier) {
        access.permission(PERMISSION);
        HrExitInterview record = identifier == null ? null : interviews.selectById(identifier);
        if (record == null || !Objects.equals(record.getTenantId(), tenantId())) throw new HrHException("EXIT_INTERVIEW_NOT_FOUND", "面谈不存在", 404);
        access.operator(record.getEmployeeId(), PERMISSION); return record;
    }

    private <T> T locked(Long identifier, Function<HrExitInterview, T> action) {
        HrExitInterview initial = visible(identifier);
        return support.transaction(() -> {
            lockEmployee(initial.getEmployeeId());
            if (interviews.lock(tenantId(), identifier) == null) throw conflict("EXIT_INTERVIEW_NOT_FOUND", "面谈不存在");
            HrExitInterview current = visible(identifier);
            if (!Objects.equals(initial.getEmployeeId(), current.getEmployeeId())) throw conflict("EXIT_INTERVIEW_SOURCE_CHANGED", "面谈员工已变化");
            return action.apply(current);
        });
    }

    private void lockEmployee(Long identifier) {
        if (employees.lockEmployee(tenantId(), identifier) == null) throw conflict("EMPLOYEE_NOT_FOUND", "员工不存在");
    }

    private void lockApplication(Long identifier) {
        if (interviews.lockApplication(tenantId(), identifier) == null) throw conflict("EXIT_INTERVIEW_SOURCE_CHANGED", "离职申请不存在或已删除");
    }

    private void editable(HrExitInterview record) {
        if (!"DRAFT".equals(record.getStatus())) throw conflict("EXIT_INTERVIEW_READ_ONLY", "已确认面谈保留原记录，不能继续修改");
    }

    private List<Long> attachments(HrExitInterview record) {
        JsonNode node = record.getAttachmentFileIds();
        if (node == null || node.isNull()) return List.of();
        if (!node.isArray()) throw conflict("EXIT_INTERVIEW_FILES_INVALID", "面谈附件记录无效");
        List<Long> result = new ArrayList<>();
        for (JsonNode entry : node) {
            if (!entry.isIntegralNumber() || !entry.canConvertToLong() || entry.longValue() <= 0 || result.contains(entry.longValue())) throw conflict("EXIT_INTERVIEW_FILES_INVALID", "面谈附件记录无效");
            result.add(entry.longValue());
        }
        return List.copyOf(result);
    }

    private HrExitInterviewView view(HrExitInterview record) {
        List<String> improvements = new ArrayList<>();
        if (record.getImprovementItems() != null && record.getImprovementItems().isArray()) record.getImprovementItems().forEach(item -> improvements.add(item.asText()));
        HrLifecycleApplication source = applications.selectById(record.getLifecycleApplicationId());
        List<HrExitInterviewView.Option> users = interviews.userOptions(tenantId(), List.of(record.getInterviewerId()));
        List<Long> fileIds = attachments(record);
        List<HrExitInterviewView.Option> files = interviews.fileOptions(tenantId(), record.getInterviewId()).stream().filter(file -> fileIds.contains(file.value())).toList();
        return new HrExitInterviewView(record.getInterviewId(), record.getEmployeeId(), access.employee(record.getEmployeeId()).getName(), record.getLifecycleApplicationId(),
                source != null && Objects.equals(source.getTenantId(), tenantId()) ? source.getApplicationNo() : "离职申请已失效", record.getSettlementId(),
                record.getInterviewerId(), users.isEmpty() ? "账号已失效" : users.get(0).label(), record.getInterviewTime(), record.getLocation(), record.getLeavingReason(), record.getEmployeeFeedback(),
                record.getManagerComment(), List.copyOf(improvements), fileIds, files, record.getStatus(), record.getVersion());
    }

    private static String hash(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (Exception failure) { throw conflict("EXIT_INTERVIEW_FILE_HASH_FAILED", "无法核验面谈附件内容"); }
    }
}
