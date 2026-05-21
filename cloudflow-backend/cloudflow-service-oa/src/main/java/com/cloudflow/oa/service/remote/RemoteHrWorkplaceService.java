package com.cloudflow.oa.service.remote;

import com.cloudflow.common.core.domain.R;
import lombok.Data;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import java.time.LocalDate;
import java.util.List;

/**
 * OA 工作台访问 HR 提醒数据源的 Feign 客户端。
 *
 * <p>对应 HR 端 {@code HrInnerWorkplaceController#listReminders}（{@code @Inner} 限定）。
 */
@FeignClient(
        name = "cloudflow-service-hr",
        contextId = "remoteHrWorkplaceService",
        path = "/inner/hr/workplace",
        fallbackFactory = RemoteHrWorkplaceFallbackFactory.class
)
public interface RemoteHrWorkplaceService {

    @GetMapping("/reminders")
    R<List<HrReminderItem>> listReminders(@RequestParam("userId") Long userId,
                                          @RequestParam(value = "expiringDays", required = false) Integer expiringDays,
                                          @RequestParam(value = "limit", required = false) Integer limit);

    @Data
    class HrReminderItem {
        private String id;
        private String type;
        private String sourceLabel;
        private String title;
        private String description;
        private LocalDate dueDate;
        private String severity;
        private Long businessId;
        private String businessType;
        private String path;
    }
}
