package com.cloudflow.hr.client.vo;

public record HrAssetReturnReminder(Long employeeId, Long userId, Long assetId, Integer assetVersion,
        String assetCode, String assetName, boolean canSend, String blockedReason, Entry latest) {
    public record Entry(Long id, String reminderTime, Long operatorId, String operatorName, String content) { }
    public record Request(Long employeeId, Long userId, Long settlementId, Long assetId, Integer assetVersion, Long lastReminderId) { }
}
