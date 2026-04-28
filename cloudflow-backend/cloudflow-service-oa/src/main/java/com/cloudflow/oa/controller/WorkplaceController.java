package com.cloudflow.oa.controller;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.dto.WorkplaceSummaryDTO;
import com.cloudflow.oa.service.IWorkplaceService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/workplace")
@RequiredArgsConstructor
public class WorkplaceController {

    private final IWorkplaceService workplaceService;

    @GetMapping("/summary")
    public R<WorkplaceSummaryDTO> getSummary() {
        return R.ok(workplaceService.getWorkplaceSummary(UserContext.getUserId()));
    }
}
