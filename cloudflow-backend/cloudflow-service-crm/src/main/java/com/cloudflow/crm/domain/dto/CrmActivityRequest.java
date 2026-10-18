package com.cloudflow.crm.domain.dto;

import com.cloudflow.crm.domain.CrmActivity;
import com.cloudflow.crm.domain.CrmActivityParticipant;
import com.cloudflow.crm.domain.CrmActivityReminder;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

@Data
public class CrmActivityRequest {
    @Valid
    @NotNull
    private CrmActivity activity;
    @Size(max = 100)
    private List<CrmActivityParticipant> participants;
    @Size(max = 10)
    private List<CrmActivityReminder> reminders;
    private boolean generateFollowUp;
}
