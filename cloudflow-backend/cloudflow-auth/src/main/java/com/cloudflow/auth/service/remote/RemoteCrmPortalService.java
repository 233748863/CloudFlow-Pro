package com.cloudflow.auth.service.remote;

import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.portal.PortalContactSnapshot;
import java.util.List;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

@FeignClient(name = "cloudflow-service-crm", path = "/inner/crm/portal", contextId = "crmPortalContacts")
public interface RemoteCrmPortalService {
    @GetMapping("/visible-contact-ids")
    R<List<Long>> visibleContactIds();

    @GetMapping("/contacts")
    R<PageResult<PortalContactSnapshot>> contacts(@RequestParam("keyword") String keyword,
            @RequestParam("pageNum") int pageNum, @RequestParam("pageSize") int pageSize);

    @GetMapping("/contacts/{id}/invitation")
    R<PortalContactSnapshot> invitation(@PathVariable("id") Long id, @RequestParam("requireActive") boolean requireActive);

    @GetMapping("/contacts/{id}/identity")
    R<PortalContactSnapshot> identity(@PathVariable("id") Long id, @RequestParam("customerId") Long customerId);
}
