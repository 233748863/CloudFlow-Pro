package com.cloudflow.hr.controller;

import com.cloudflow.hr.domain.vo.DynamicMapVO;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

/**
 * 健康检查控制器
 * 用于验证服务是否正常运行
 * 
 * @author CloudFlow
 * @since 1.0.0
 */
@RestController
@RequestMapping
public class HealthController {

    /**
     * 健康检查接口
     * 
     * @return 服务状态信息
     */
    @GetMapping("/health")
    public DynamicMapVO health() {
        Map<String, Object> result = new HashMap<>();
        result.put("status", "UP");
        result.put("service", "cloudflow-service-hr");
        result.put("timestamp", LocalDateTime.now());
        result.put("message", "HR人力资源管理微服务运行正常");
        return DynamicMapVO.from(result);
    }

    /**
     * 服务信息接口
     * 
     * @return 服务详细信息
     */
    @GetMapping("/info")
    public DynamicMapVO info() {
        Map<String, Object> result = new HashMap<>();
        result.put("name", "CloudFlow HR Service");
        result.put("description", "CloudFlow Pro HR人力资源管理微服务");
        result.put("version", "1.0.0");
        result.put("modules", new String[]{
            "组织架构管理",
            "员工档案管理",
            "员工生命周期管理",
            "考勤管理",
            "薪酬管理",
            "招聘管理"
        });
        return DynamicMapVO.from(result);
    }
}
