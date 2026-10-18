package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.utils.file.FileUploadUtils;
import com.cloudflow.hr.domain.dto.HrTrainingRecoveryRequests;
import com.cloudflow.hr.domain.entity.HrTrainingRecovery;
import com.cloudflow.hr.domain.vo.settlement.HrTrainingRecoveryView;
import com.cloudflow.hr.mapper.HrEmployeeAdvanceMapper;
import com.cloudflow.hr.mapper.HrTrainingRecoveryMapper;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
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
public class HrTrainingRecoveryService {
    private static final String PERMISSION = "hr:training-recovery:manage";
    private static final String PURPOSE = "HR_TRAINING_AGREEMENT";
    private static final String BUSINESS = "HR_TRAINING_RECOVERY";
    private static final long MAX_FILE_SIZE = 10L * 1024 * 1024;
    private final HrTrainingRecoveryMapper recoveries;
    private final HrEmployeeAdvanceMapper employees;
    private final HrHSupport access;
    private final HrRuleSupport support;
    private final HrFileStorage storage;

    public PageResult<HrTrainingRecoveryView> list(HrTrainingRecoveryRequests.Query query) {
        List<Long> employeeIds = scoped(query);
        if (employeeIds.isEmpty()) return new PageResult<>(List.of(), 0L, query.getPageNum(), query.getPageSize());
        Page<HrTrainingRecovery> page = recoveries.selectPage(new Page<>(query.getPageNum(), query.getPageSize()),
                new LambdaQueryWrapper<HrTrainingRecovery>().eq(HrTrainingRecovery::getTenantId, tenantId())
                        .in(HrTrainingRecovery::getEmployeeId, employeeIds)
                        .eq(query.getEnrollmentId() != null, HrTrainingRecovery::getEnrollmentId, query.getEnrollmentId())
                        .eq(query.getStatus() != null, HrTrainingRecovery::getStatus, query.getStatus())
                        .orderByDesc(HrTrainingRecovery::getRecoveryId));
        return new PageResult<>(page.getRecords().stream().map(this::view).toList(), page.getTotal(), page.getCurrent(), page.getSize());
    }

    public HrTrainingRecoveryView detail(Long recoveryId) { return view(visible(recoveryId)); }

    public PageResult<HrTrainingRecoveryView.Enrollment> enrollments(HrTrainingRecoveryRequests.Query query) {
        List<Long> employeeIds = scoped(query);
        List<HrTrainingRecoveryMapper.Source> sources = employeeIds.isEmpty() ? List.of() : recoveries.sources(tenantId(), employeeIds);
        long offset = (long) (query.getPageNum() - 1) * query.getPageSize();
        List<HrTrainingRecoveryView.Enrollment> rows = sources.stream().skip(offset).limit(query.getPageSize())
                .map(source -> new HrTrainingRecoveryView.Enrollment(source.enrollmentId(),
                        source.employeeName() + " · " + source.courseName() + " · " + source.sessionNo())).toList();
        return new PageResult<>(rows, (long) sources.size(), query.getPageNum(), query.getPageSize());
    }

    public HrTrainingRecoveryView.Agreement uploadAgreement(Long enrollmentId, MultipartFile file) {
        HrTrainingRecoveryMapper.Source initial = eligible(enrollmentId);
        return support.transaction(() -> {
            lockEmployee(initial.employeeId()); lockEnrollment(enrollmentId);
            sameEmployee(initial.employeeId(), eligible(enrollmentId));
            FileUploadUtils.ValidatedFile validated;
            byte[] bytes;
            try {
                validated = FileUploadUtils.validate(file, MAX_FILE_SIZE, new String[]{"pdf", "png", "jpg", "jpeg"});
                bytes = file.getBytes();
                if (bytes.length == 0 || bytes.length > MAX_FILE_SIZE || bytes.length != file.getSize()) throw invalid("协议大小无效");
            } catch (Exception failure) { throw invalid("请选择内容与扩展名一致且不超过10MiB的PDF、PNG或JPEG协议"); }
            String digest = hash(bytes);
            if (recoveries.assessedAgreement(tenantId(), enrollmentId, digest) != null) {
                throw conflict("TRAINING_AGREEMENT_USED", "该培训协议已有核定记录，请读取原记录");
            }
            Long stagedId = recoveries.stagedAgreement(tenantId(), enrollmentId, digest, userName());
            if (stagedId != null) {
                HrTrainingRecoveryMapper.AgreementFile staged = agreement(stagedId); verifiedBytes(staged);
                return new HrTrainingRecoveryView.Agreement(staged.fileId(), staged.fileName(), staged.fileSize());
            }
            Long fileId = storage.save(bytes, validated.originalFileName(), PURPOSE);
            if (recoveries.stageAgreement(tenantId(), fileId, enrollmentId, digest, userName()) != 1) {
                throw conflict("TRAINING_AGREEMENT_BIND_FAILED", "培训协议未绑定，上传已撤回");
            }
            support.audit(BUSINESS, enrollmentId, "AGREEMENT_UPLOAD", Map.of("fileId", fileId, "fileSize", bytes.length));
            return new HrTrainingRecoveryView.Agreement(fileId, validated.originalFileName(), bytes.length);
        });
    }

    public Long create(HrTrainingRecoveryRequests.Draft input) {
        access.permission(PERMISSION); access.validate(input);
        HrTrainingRecoveryMapper.Source initial = eligible(input.getEnrollmentId());
        return support.transaction(() -> {
            lockEmployee(initial.employeeId()); lockEnrollment(input.getEnrollmentId());
            sameEmployee(initial.employeeId(), eligible(input.getEnrollmentId()));
            HrTrainingRecoveryMapper.AgreementFile agreement = agreement(input.getAgreementFileId());
            if (!Objects.equals(agreement.createBy(), userName())) throw forbidden();
            if (BUSINESS.equals(agreement.bizType())) {
                HrTrainingRecovery existing = visible(agreement.bizId());
                if (Objects.equals(existing.getEnrollmentId(), input.getEnrollmentId())
                        && Objects.equals(existing.getAgreementFileId(), input.getAgreementFileId())
                        && existing.getAssessedAmount().compareTo(input.getAssessedAmount()) == 0
                        && Objects.equals(existing.getAssessmentReason(), input.getAssessmentReason().trim())) return existing.getRecoveryId();
                throw conflict("TRAINING_AGREEMENT_USED", "该协议已有核定记录，请读取原记录");
            }
            if (!PURPOSE.equals(agreement.bizType()) || !Objects.equals(agreement.bizId(), input.getEnrollmentId())) throw forbidden();
            verifiedBytes(agreement);
            if (recoveries.assessedAgreement(tenantId(), input.getEnrollmentId(), agreement.fileHash()) != null) {
                throw conflict("TRAINING_AGREEMENT_USED", "同一培训协议已建立核定记录，不能重复追偿");
            }
            HrTrainingRecovery record = new HrTrainingRecovery();
            record.setTenantId(tenantId()); record.setEmployeeId(initial.employeeId()); record.setEnrollmentId(input.getEnrollmentId());
            record.setAgreementFileId(input.getAgreementFileId()); record.setAssessedAmount(input.getAssessedAmount());
            record.setAssessmentReason(input.getAssessmentReason().trim()); record.setCollectedAmount(BigDecimal.ZERO);
            record.setStatus("DRAFT"); record.setVersion(0); record.setCreateBy(userName()); record.setUpdateBy(userName());
            record.setCreateTime(HrHSupport.now()); record.setUpdateTime(HrHSupport.now());
            if (recoveries.insert(record) != 1 || record.getRecoveryId() == null) throw conflict("TRAINING_RECOVERY_CREATE_FAILED", "培训追偿未保存");
            if (recoveries.bindAgreement(tenantId(), record.getAgreementFileId(), record.getEnrollmentId(), record.getRecoveryId(), userName()) != 1) {
                throw conflict("TRAINING_AGREEMENT_USED", "协议绑定已变化，请重新读取");
            }
            audit(record, "CREATE"); return record.getRecoveryId();
        });
    }

    public void update(Long recoveryId, HrTrainingRecoveryRequests.Update input) {
        access.validate(input);
        locked(recoveryId, record -> {
            editable(record); HrHSupport.version(input.getVersion(), record.getVersion());
            record.setAssessedAmount(input.getAssessedAmount()); record.setAssessmentReason(input.getAssessmentReason().trim());
            persist(record); audit(record, "UPDATE"); return null;
        });
    }

    public void confirm(Long recoveryId, HrTrainingRecoveryRequests.Confirm input) {
        access.validate(input);
        locked(recoveryId, record -> {
            editable(record); HrHSupport.version(input.getVersion(), record.getVersion());
            lockEnrollment(record.getEnrollmentId()); sameEmployee(record.getEmployeeId(), eligible(record.getEnrollmentId()));
            verifiedBytes(boundAgreement(record));
            record.setStatus("CONFIRMED"); record.setConfirmedBy(access.user()); record.setConfirmedTime(HrHSupport.now());
            persist(record); audit(record, "CONFIRM"); return null;
        });
    }

    public ResponseEntity<byte[]> download(Long recoveryId) {
        return download(recoveryId, null);
    }

    public ResponseEntity<byte[]> download(Long recoveryId, Long expectedFileId) {
        return locked(recoveryId, record -> {
            HrTrainingRecoveryMapper.AgreementFile agreement = boundAgreement(record);
            if (expectedFileId != null && !Objects.equals(agreement.fileId(), expectedFileId)) throw forbidden();
            byte[] bytes = verifiedBytes(agreement);
            support.audit(BUSINESS, recoveryId, "AGREEMENT_DOWNLOAD", Map.of("fileId", agreement.fileId()));
            return ResponseEntity.ok().contentType(MediaTypeFactory.getMediaType(agreement.fileName()).orElse(MediaType.APPLICATION_OCTET_STREAM))
                    .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(agreement.fileName(), StandardCharsets.UTF_8).build().toString())
                    .header(HttpHeaders.CACHE_CONTROL, "no-store").header("Content-Security-Policy", "default-src 'none'; sandbox")
                    .header("X-Content-Type-Options", "nosniff").body(bytes);
        });
    }

    public void authorizeDownload(Long recoveryId, Long fileId) {
        locked(recoveryId, record -> {
            if (!Objects.equals(boundAgreement(record).fileId(), fileId)) throw forbidden();
            return null;
        });
    }

    private List<Long> scoped(HrTrainingRecoveryRequests.Query query) {
        access.permission(PERMISSION); access.validate(query);
        if (query.getPageNum() == null || query.getPageSize() == null) throw invalid("分页参数不能为空");
        return access.scopedEmployees(query, false).stream().filter(identifier -> !access.owner(identifier))
                .filter(identifier -> query.getKeyword() == null || access.employee(identifier).getName().contains(query.getKeyword().trim())).toList();
    }

    private HrTrainingRecoveryMapper.Source eligible(Long enrollmentId) {
        access.permission(PERMISSION);
        HrTrainingRecoveryMapper.Source source = enrollmentId == null ? null : recoveries.source(tenantId(), enrollmentId);
        if (source == null || !"APPROVED".equals(source.status())) throw invalid("请选择本租户有效且已通过的培训报名");
        access.operator(source.employeeId(), PERMISSION); return source;
    }

    private void sameEmployee(Long employeeId, HrTrainingRecoveryMapper.Source source) {
        if (!Objects.equals(employeeId, source.employeeId())) throw conflict("TRAINING_SOURCE_CHANGED", "培训所属员工已变化，请重新核实");
    }

    private HrTrainingRecovery visible(Long identifier) {
        access.permission(PERMISSION);
        HrTrainingRecovery record = identifier == null ? null : recoveries.selectById(identifier);
        if (record == null || !Objects.equals(record.getTenantId(), tenantId())) throw new HrHException("TRAINING_RECOVERY_NOT_FOUND", "培训追偿记录不存在", 404);
        access.operator(record.getEmployeeId(), PERMISSION); return record;
    }

    private <Result> Result locked(Long identifier, Function<HrTrainingRecovery, Result> action) {
        HrTrainingRecovery initial = visible(identifier);
        return support.transaction(() -> {
            lockEmployee(initial.getEmployeeId());
            if (recoveries.lock(tenantId(), identifier) == null) throw conflict("TRAINING_RECOVERY_NOT_FOUND", "培训追偿记录不存在");
            HrTrainingRecovery current = visible(identifier);
            if (!Objects.equals(initial.getEmployeeId(), current.getEmployeeId())) throw conflict("TRAINING_SOURCE_CHANGED", "培训追偿所属员工已变化");
            return action.apply(current);
        });
    }

    private void lockEmployee(Long identifier) {
        if (employees.lockEmployee(tenantId(), identifier) == null) throw conflict("EMPLOYEE_NOT_FOUND", "员工不存在");
    }

    private void lockEnrollment(Long identifier) {
        if (recoveries.lockEnrollment(tenantId(), identifier) == null) throw conflict("TRAINING_SOURCE_CHANGED", "培训报名不存在或已删除");
    }

    private HrTrainingRecoveryMapper.AgreementFile agreement(Long fileId) {
        HrTrainingRecoveryMapper.AgreementFile agreement = recoveries.agreement(tenantId(), fileId);
        if (agreement == null || agreement.fileSize() == null || agreement.fileSize() <= 0 || agreement.fileSize() > MAX_FILE_SIZE) throw forbidden();
        return agreement;
    }

    private HrTrainingRecoveryMapper.AgreementFile boundAgreement(HrTrainingRecovery record) {
        HrTrainingRecoveryMapper.AgreementFile agreement = agreement(record.getAgreementFileId());
        if (!BUSINESS.equals(agreement.bizType()) || !Objects.equals(agreement.bizId(), record.getRecoveryId())) throw forbidden();
        return agreement;
    }

    private byte[] verifiedBytes(HrTrainingRecoveryMapper.AgreementFile agreement) {
        byte[] bytes = storage.loadPrivate(agreement.fileId(), PURPOSE);
        if (bytes.length != agreement.fileSize() || !hash(bytes).equals(agreement.fileHash())) throw conflict("TRAINING_AGREEMENT_CHANGED", "培训协议内容与上传记录不一致");
        return bytes;
    }

    private void editable(HrTrainingRecovery record) {
        if (!"DRAFT".equals(record.getStatus()) || record.getSettlementId() != null || record.getCollectedAmount().signum() != 0) {
            throw conflict("TRAINING_RECOVERY_READ_ONLY", "已核定、已占用或已收回的培训追偿不能改写");
        }
    }

    private void persist(HrTrainingRecovery record) {
        Integer previous = record.getVersion(); record.setUpdateBy(userName()); record.setUpdateTime(HrHSupport.now());
        if (recoveries.updateDraft(record, previous) != 1) throw conflict("VERSION_CONFLICT", "培训追偿已变化，请重新读取");
        record.setVersion(previous + 1);
    }

    private void audit(HrTrainingRecovery record, String operation) {
        support.audit(BUSINESS, record.getRecoveryId(), operation,
                Map.of("version", record.getVersion(), "status", record.getStatus(), "enrollmentId", record.getEnrollmentId(), "agreementFileId", record.getAgreementFileId()));
    }

    private HrTrainingRecoveryView view(HrTrainingRecovery record) {
        HrTrainingRecoveryMapper.Source source = recoveries.source(tenantId(), record.getEnrollmentId());
        boolean sourceAvailable = source != null && Objects.equals(source.employeeId(), record.getEmployeeId());
        HrTrainingRecoveryMapper.AgreementFile agreement = recoveries.agreement(tenantId(), record.getAgreementFileId());
        boolean fileAvailable = agreement != null && BUSINESS.equals(agreement.bizType()) && Objects.equals(agreement.bizId(), record.getRecoveryId());
        return new HrTrainingRecoveryView(record.getRecoveryId(), record.getEmployeeId(), access.employee(record.getEmployeeId()).getName(), record.getEnrollmentId(),
                sourceAvailable ? source.courseName() : "培训来源已失效", sourceAvailable ? source.sessionNo() : "",
                record.getAgreementFileId(), fileAvailable ? agreement.fileName() : "协议暂不可用", record.getAssessedAmount(), record.getCollectedAmount(),
                record.getAssessmentReason(), record.getStatus(), record.getConfirmedBy(), record.getConfirmedTime(), record.getSettlementId(), record.getVersion());
    }

    private static String hash(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (Exception failure) { throw conflict("TRAINING_AGREEMENT_HASH_FAILED", "无法核验协议内容"); }
    }
}
