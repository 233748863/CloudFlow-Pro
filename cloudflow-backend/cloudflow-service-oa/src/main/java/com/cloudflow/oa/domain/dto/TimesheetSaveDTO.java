package com.cloudflow.oa.domain.dto;

import com.cloudflow.oa.domain.OaTimesheet;
import com.cloudflow.oa.domain.OaTimesheetDetail;
import lombok.Data;
import java.util.List;

@Data
public class TimesheetSaveDTO {
    private OaTimesheet timesheet;
    private List<OaTimesheetDetail> details;
}
