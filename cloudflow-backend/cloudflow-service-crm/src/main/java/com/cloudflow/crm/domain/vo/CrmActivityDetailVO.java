package com.cloudflow.crm.domain.vo;

import com.cloudflow.crm.domain.CrmActivity;
import com.cloudflow.crm.domain.CrmActivityParticipant;
import com.cloudflow.crm.domain.CrmActivityReminder;
import lombok.Data;

import java.util.List;

@Data
public class CrmActivityDetailVO {
    private CrmActivity activity;
    private List<CrmActivityParticipant> participants;
    private List<CrmActivityReminder> reminders;
    private List<CrmActivity> conflicts;
}
