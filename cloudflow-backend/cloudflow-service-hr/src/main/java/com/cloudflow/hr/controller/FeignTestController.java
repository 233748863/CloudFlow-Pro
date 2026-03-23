package com.cloudflow.hr.controller;
import io.swagger.v3.oas.annotations.tags.Tag;
import io.swagger.v3.oas.annotations.Operation;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.AuthServiceClient;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.vo.DeptTreeVO;
import com.cloudflow.hr.client.vo.PostVO;
import com.cloudflow.hr.client.vo.ProcessInstanceVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Feign客户端测试控制器
 * 用于测试Auth服务和Workflow服务的Feign客户端调用
 * 
 * 注意：此控制器仅用于开发测试，生产环境应删除或禁用
 *
 * @author CloudFlow
 * @since 1.0.0
 */
@Slf4j
@RestController
@RequestMapping("/test/feign")
@RequiredArgsConstructor
@Tag(name = "Feign客户端测试", description = "测试Feign客户端调用Auth和Workflow服务")
public class FeignTestController {
    
    private final AuthServiceClient authServiceClient;
    private final WorkflowServiceClient workflowServiceClient;
    
    /**
     * 测试获取部门树
     */
    @GetMapping("/auth/dept/tree")
    @Operation(summary = "测试获取部门树")
    public R<List<DeptTreeVO>> testGetDeptTree(@RequestParam Long tenantId) {
        log.info("测试调用Auth服务：获取部门树，租户ID={}", tenantId);
        try {
            R<List<DeptTreeVO>> result = authServiceClient.getDeptTree(tenantId);
            log.info("调用成功，返回结果：{}", result);
            return result;
        } catch (Exception e) {
            log.error("调用失败", e);
            return R.fail("调用Auth服务失败：" + e.getMessage());
        }
    }
    
    /**
     * 测试获取岗位列表
     */
    @GetMapping("/auth/post/list")
    @Operation(summary = "测试获取岗位列表")
    public R<List<PostVO>> testGetPostList(@RequestParam Long tenantId) {
        log.info("测试调用Auth服务：获取岗位列表，租户ID={}", tenantId);
        try {
            R<List<PostVO>> result = authServiceClient.getPostList(tenantId);
            log.info("调用成功，返回结果：{}", result);
            return result;
        } catch (Exception e) {
            log.error("调用失败", e);
            return R.fail("调用Auth服务失败：" + e.getMessage());
        }
    }
    
    /**
     * 测试查询流程实例
     */
    @GetMapping("/workflow/process/{processInstanceId}")
    @Operation(summary = "测试查询流程实例")
    public R<ProcessInstanceVO> testGetProcessInstance(@PathVariable String processInstanceId) {
        log.info("测试调用Workflow服务：查询流程实例，流程实例ID={}", processInstanceId);
        try {
            R<ProcessInstanceVO> result = workflowServiceClient.getProcessInstance(processInstanceId);
            log.info("调用成功，返回结果：{}", result);
            return result;
        } catch (Exception e) {
            log.error("调用失败", e);
            return R.fail("调用Workflow服务失败：" + e.getMessage());
        }
    }
    
    /**
     * 测试Fallback降级
     * 通过传入一个不存在的服务名称来触发降级
     */
    @GetMapping("/test/fallback")
    @Operation(summary = "测试Fallback降级")
    public R<String> testFallback() {
        log.info("测试Fallback降级机制");
        try {
            // 尝试调用一个不存在的流程实例，触发降级
            R<ProcessInstanceVO> result = workflowServiceClient.getProcessInstance("non-existent-process-id");
            return R.ok("Fallback测试完成，结果：" + result.getMsg());
        } catch (Exception e) {
            log.error("测试失败", e);
            return R.fail("测试失败：" + e.getMessage());
        }
    }
}
