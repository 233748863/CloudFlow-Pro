package com.cloudflow.hr.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping
public class HealthController {

    @GetMapping("/health")
    public Map<String, Object> health() {
        Map<String, Object> result = new HashMap<>();
        result.put("status", "UP");
        result.put("service", "cloudflow-service-hr");
        result.put("timestamp", LocalDateTime.now());
        result.put("message", "HR light service is running");
        return result;
    }

    @GetMapping("/info")
    public Map<String, Object> info() {
        Map<String, Object> result = new HashMap<>();
        result.put("name", "CloudFlow HR Service");
        result.put("description", "CloudFlow Pro HR light service");
        result.put("version", "1.0.0");
        result.put("modules", new String[]{
                "Employee Archive",
                "Leave Registration",
                "Overtime Registration",
                "Leave Quota"
        });
        return result;
    }
}
