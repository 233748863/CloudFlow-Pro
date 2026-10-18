package com.cloudflow.oa.domain.vo;

public record OaAssetReturnReminder(Long employeeId, Long userId, Long assetId, Integer assetVersion,
        String assetCode, String assetName, boolean canSend, String blockedReason, Entry latest) {
    public record Entry(Long id, String reminderTime, Long operatorId, String operatorName, String content) { }
}
