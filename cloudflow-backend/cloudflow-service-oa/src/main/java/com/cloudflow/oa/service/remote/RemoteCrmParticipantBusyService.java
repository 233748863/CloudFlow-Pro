package com.cloudflow.oa.service.remote;

import com.cloudflow.common.core.domain.ParticipantBusy;
import com.cloudflow.common.core.domain.R;
import java.util.List;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

@FeignClient(name = "cloudflow-service-crm", path = "/inner/crm/activity", contextId = "oaCrmParticipantBusy")
public interface RemoteCrmParticipantBusyService {
    @GetMapping("/participant-busy")
    R<List<ParticipantBusy>> query(@RequestParam("userIds") List<Long> userIds,
            @RequestParam("start") String start, @RequestParam("end") String end);
}
