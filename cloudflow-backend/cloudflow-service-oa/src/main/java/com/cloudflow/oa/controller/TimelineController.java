package com.cloudflow.oa.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.dto.TimelineEventDTO;
import com.cloudflow.oa.service.IOaTraceEventService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * OA 通用业务时间线查询。
 */
@RestController
@RequestMapping("/timeline")
@RequiredArgsConstructor
public class TimelineController {

    private final IOaTraceEventService traceEventService;

    @GetMapping
    public R<List<TimelineEventDTO>> list(@RequestParam(required = false) String businessType,
                                          @RequestParam(required = false) Long businessId,
                                          @RequestParam(required = false) String relatedType,
                                          @RequestParam(required = false) Long relatedId,
                                          @RequestParam(defaultValue = "20") Integer limit) {
        return R.ok(traceEventService
                .listByFilter(businessType, businessId, relatedType, relatedId, limit)
                .stream()
                .map(TimelineEventDTO::from)
                .toList());
    }
}
