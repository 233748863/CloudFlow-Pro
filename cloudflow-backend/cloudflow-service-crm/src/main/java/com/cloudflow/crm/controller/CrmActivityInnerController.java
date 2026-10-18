package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.ParticipantBusy;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.crm.service.impl.CrmParticipantBusyService;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/crm/activity")
@RequiredArgsConstructor
public class CrmActivityInnerController {
    private final CrmParticipantBusyService busy;

    @GetMapping("/participant-busy")
    @Inner(allowedServices = "cloudflow-service-oa")
    public R<List<ParticipantBusy>> participantBusy(@RequestParam("userIds") List<Long> userIds,
            @RequestParam("start") @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime start,
            @RequestParam("end") @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime end) {
        return R.ok(busy.query(userIds, start, end));
    }
}
