package com.cloudflow.workflow.service.remote;

import com.cloudflow.common.core.domain.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 用户服务远程调用接口
 * 
 * 说明：调用cloudflow-auth模块提供的用户服务API
 * 注意：使用Map传输数据，避免模块间的类依赖
 * 
 * @author CloudFlow Team
 * @since 2026-02-22
 */
@FeignClient(
    name = "cloudflow-auth",
    path = "/inner/auth/user",
    contextId = "remoteUserService"
)
public interface RemoteUserService {
    
    /**
     * 根据用户ID查询用户信息
     * 
     * @param userId 用户ID
     * @return 用户信息（Map格式）
     */
    @GetMapping("/{userId}")
    R<Map<String, Object>> getUser(@PathVariable("userId") Long userId);
    
    /**
     * 批量查询用户信息
     * 
     * 注意：需要在SysUserController中添加此接口
     * 
     * @param userIds 用户ID列表
     * @return 用户信息列表（Map格式）
     */
    @PostMapping("/batch")
    R<List<Map<String, Object>>> batchGetUsers(@RequestBody List<Long> userIds);
}
