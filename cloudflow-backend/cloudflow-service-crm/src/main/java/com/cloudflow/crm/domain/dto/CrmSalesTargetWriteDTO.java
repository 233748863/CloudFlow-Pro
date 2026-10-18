package com.cloudflow.crm.domain.dto;

public record CrmSalesTargetWriteDTO(Long salesTargetId, Integer version, String requestKey,
        String targetName, String dimensionType, String periodType, Integer targetYear, Integer targetPeriod,
        Long deptId, Long ownerId, String targetAmount, String calculationBasis, String currency,
        String status, String remark, String previewFingerprint, Boolean basisChangeConfirmed) { }
