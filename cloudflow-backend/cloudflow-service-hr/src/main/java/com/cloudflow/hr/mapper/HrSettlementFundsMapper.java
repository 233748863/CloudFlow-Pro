package com.cloudflow.hr.mapper;

import com.cloudflow.hr.domain.entity.HrFinalSettlement;
import java.math.BigDecimal;
import org.apache.ibatis.annotations.Param;

public interface HrSettlementFundsMapper {
    int saveFunds(@Param("record") HrFinalSettlement record, @Param("expectedVersion") Integer expectedVersion);
    int close(@Param("record") HrFinalSettlement record, @Param("expectedVersion") Integer expectedVersion);
    Payment payment(@Param("tenantId") Long tenantId, @Param("paymentId") Long paymentId);
    String paymentEvent(@Param("tenantId") Long tenantId, @Param("eventId") String eventId, @Param("paymentId") Long paymentId);
    int bindProof(@Param("tenantId") Long tenantId, @Param("settlementId") Long settlementId, @Param("fileId") Long fileId,
            @Param("fileHash") String fileHash, @Param("owner") String owner);
    ProofFile lockProof(@Param("tenantId") Long tenantId, @Param("settlementId") Long settlementId, @Param("fileId") Long fileId);

    record Payment(Long id, Long userId, String payeeName, BigDecimal amount, String status, Integer deleted, String sourceBizType, String sourceBizId) { }
    record ProofFile(Long fileId, String fileName, String fileHash, Long fileSize) { }
}
