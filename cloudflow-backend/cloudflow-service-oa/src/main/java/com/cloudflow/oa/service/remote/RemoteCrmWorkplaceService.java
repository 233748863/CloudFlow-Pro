package com.cloudflow.oa.service.remote;

import com.cloudflow.common.core.domain.R;
import lombok.Data;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;

import java.time.LocalDateTime;
import java.util.List;

@FeignClient(
        name = "cloudflow-service-crm",
        contextId = "remoteCrmWorkplaceService",
        fallbackFactory = RemoteCrmWorkplaceFallbackFactory.class
)
public interface RemoteCrmWorkplaceService {

    @GetMapping("/dashboard/workplace")
    R<CrmDashboardWorkplaceResponse> getDashboardWorkplace();

    @Data
    class CrmDashboardWorkplaceResponse {
        private List<CrmTodoItem> todos;
        private List<CrmRiskItem> risks;
        private List<CrmActivityItem> activities;
    }

    @Data
    class CrmTodoItem {
        private String id;
        private String module;
        private String sourceLabel;
        private String title;
        private String description;
        private String status;
        private String path;
        private Long businessId;
        private String businessType;
    }

    @Data
    class CrmRiskItem {
        private String id;
        private String module;
        private String sourceLabel;
        private String title;
        private String description;
        private String level;
        private String status;
        private String path;
        private Long businessId;
        private String businessType;
    }

    @Data
    class CrmActivityItem {
        private String id;
        private String module;
        private String sourceLabel;
        private String title;
        private String content;
        private String operatorName;
        private LocalDateTime eventTime;
        private String path;
        private Long businessId;
        private String businessType;
    }
}
