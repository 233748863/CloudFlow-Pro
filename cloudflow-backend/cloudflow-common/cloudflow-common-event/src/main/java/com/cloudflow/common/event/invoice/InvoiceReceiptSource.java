package com.cloudflow.common.event.invoice;

import com.fasterxml.jackson.annotation.JsonFormat;
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
public class InvoiceReceiptSource {
    public static final String SERVICE = "cloudflow-service-oa";
    public static final String EVENT = "INVOICE_RECEIVABLE_CHANGED";
    private Integer schemaVersion = 1;
    private Long tenantId;
    private String operation;
    private Long invoiceId;
    private Integer invoiceVersion;
    private Long receivableId;
    private Integer receivableVersion;
    private Long customerId;
    private Long contractId;
    private String currency;
    private BigDecimal grossAmount;
    private BigDecimal receivedBefore;
    private BigDecimal receivedAfter;
    private Long writeoffId;
    private BigDecimal receiptAmount;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate receiptDate;
    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime occurredTime;
    private Integer teamVersion;
    private List<Member> members = List.of();

    public record Member(Long userId, Long employeeId, String name, Long deptId, String role,
            BigDecimal percentage, BigDecimal commissionRate) { }

    public String eventId() {
        String identity = EVENT + ":" + tenantId + ":" + invoiceId + ":" + invoiceVersion + ":" + operation;
        return UUID.nameUUIDFromBytes(identity.getBytes(StandardCharsets.UTF_8)).toString();
    }

    public static String receiptKey(Long invoiceId, Long writeoffId) {
        return "OA_INVOICE_RECEIPT:" + invoiceId + ":" + writeoffId;
    }

    public static String digest(String payload) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(payload.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException failure) { throw new IllegalStateException("无法核验发票来源摘要", failure); }
    }
}
