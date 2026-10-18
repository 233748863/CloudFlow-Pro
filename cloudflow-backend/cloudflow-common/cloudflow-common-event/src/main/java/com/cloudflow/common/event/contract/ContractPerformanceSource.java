package com.cloudflow.common.event.contract;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import lombok.Data;

@Data
public class ContractPerformanceSource {
    public static final String SERVICE = "cloudflow-service-oa";
    public static final String EVENT = "CONTRACT_PERFORMANCE_CHANGED";
    private Integer schemaVersion = 1;
    private Long tenantId;
    private Long contractId;
    private Integer contractVersion;
    private Integer revision;
    private String operation;
    private String previousEventId;
    private String previousDigest;
    private Long customerId;
    private String contractType;
    private BigDecimal amount;
    private String currency;
    private String contractStatus;
    private String approvalInstanceId;
    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime approvedTime;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate startDate;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate endDate;
    private Long ourSigneeId;
    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime ourSignTime;
    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime counterpartySignTime;
    private String signedEvidenceDigest;
    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime occurredTime;
    private Integer teamVersion;
    private List<Member> members = List.of();

    public record Member(Long userId, Long employeeId, String name, Long deptId, String role, BigDecimal percentage) { }

    public String eventId() {
        return UUID.nameUUIDFromBytes((EVENT + ":" + tenantId + ":" + contractId + ":" + revision)
                .getBytes(StandardCharsets.UTF_8)).toString();
    }

    public String factKey() { return "OA_CONTRACT_PERFORMANCE:" + contractId + ":" + revision; }
    public String reversalKey() { return factKey() + ":REVERSE"; }
    public String completionKey() { return "REVERSE".equals(operation) ? reversalKey() : factKey(); }

    public static String signatureDigest(Long ourSigneeId, LocalDateTime ourSignTime, String counterpartySignee,
            LocalDateTime counterpartySignTime, String signedFileUrl, ObjectMapper json) {
        if (ourSigneeId == null || ourSignTime == null || counterpartySignee == null || counterpartySignTime == null || signedFileUrl == null)
            throw new IllegalArgumentException("合同签署依据不完整");
        return digest(json.valueToTree(List.of(ourSigneeId, ourSignTime.toString(), counterpartySignee, counterpartySignTime.toString(), signedFileUrl)).toString());
    }

    public static String digest(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException failure) { throw new IllegalStateException("无法核验合同来源摘要", failure); }
    }
}
