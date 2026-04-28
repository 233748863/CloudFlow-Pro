package com.cloudflow.hr.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.hr.domain.dto.*;
import com.cloudflow.hr.domain.vo.LeaveApplicationVO;
import com.cloudflow.hr.domain.vo.LeaveQuotaInitResultVO;
import com.cloudflow.hr.domain.vo.LeaveQuotaVO;
import com.cloudflow.hr.domain.vo.LeaveTypeVO;
import com.cloudflow.hr.domain.vo.EmployeeVO;
import com.cloudflow.hr.service.LeaveService;
import com.cloudflow.hr.service.EmployeeService;
import com.cloudflow.hr.exception.HrBusinessException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;

/**
 * 假期管理控制器
 * 提供假期类型、假期额度和请假申请管理接口
 * 
 * @author CloudFlow
 */
@Slf4j
@RestController
@RequestMapping("/leave")
@RequiredArgsConstructor
public class LeaveController {
    
    private final LeaveService leaveService;
    private final EmployeeService employeeService;
    
    // ==================== 假期类型管理 ====================
    
    /**
     * 创建假期类型
     */
    @PostMapping("/type")
    public R<Long> createLeaveType(@Validated @RequestBody LeaveTypeCreateDTO dto) {
        Long id = leaveService.createLeaveType(dto);
        return R.ok(id);
    }
    
    /**
     * 更新假期类型
     */
    @PutMapping("/type/{id}")
    public R<Void> updateLeaveType(@PathVariable Long id, 
                                    @Validated @RequestBody LeaveTypeUpdateDTO dto) {
        leaveService.updateLeaveType(id, dto);
        return R.ok();
    }
    
    /**
     * 获取假期类型详情
     */
    @GetMapping("/type/{id}")
    public R<LeaveTypeVO> getLeaveType(@PathVariable Long id) {
        LeaveTypeVO vo = leaveService.getLeaveType(id);
        return R.ok(vo);
    }
    
    /**
     * 获取假期类型列表
     */
    @GetMapping("/type/list")
    public R<List<LeaveTypeVO>> listLeaveTypes() {
        List<LeaveTypeVO> list = leaveService.listLeaveTypes();
        return R.ok(list);
    }

    
    // ==================== 假期额度管理 ====================
    
    /**
     * 初始化员工年度假期额度
     */
    @PostMapping("/quota/init")
    public R<LeaveQuotaInitResultVO> initLeaveQuota(@RequestParam Long employeeId,
                                                    @RequestParam Integer year,
                                                    @RequestParam(required = false) Long leaveTypeId) {
        requireLeaveQuotaManager();
        LeaveQuotaInitResultVO result = leaveService.initLeaveQuota(employeeId, year, leaveTypeId);
        return R.ok(result);
    }
    
    /**
     * 调整假期额度
     */
    @PostMapping("/quota/adjust")
    public R<Void> adjustLeaveQuota(@Validated @RequestBody LeaveQuotaAdjustDTO dto) {
        requireLeaveQuotaManager();
        leaveService.adjustLeaveQuota(dto);
        return R.ok();
    }
    
    /**
     * 获取员工假期额度
     */
    @GetMapping("/quota")
    public R<LeaveQuotaVO> getLeaveQuota(@RequestParam Long employeeId,
                                          @RequestParam Long leaveTypeId,
                                          @RequestParam Integer year) {
        employeeId = resolveReadableEmployeeId(employeeId);
        LeaveQuotaVO vo = leaveService.getLeaveQuota(employeeId, leaveTypeId, year);
        return R.ok(vo);
    }
    
    /**
     * 获取员工假期额度列表
     */
    @GetMapping("/quota/buckets")
    public R<List<LeaveQuotaVO>> listLeaveQuotaBuckets(@RequestParam Long employeeId,
                                                       @RequestParam Long leaveTypeId,
                                                       @RequestParam Integer year) {
        employeeId = resolveReadableEmployeeId(employeeId);
        List<LeaveQuotaVO> list = leaveService.listLeaveQuotaBuckets(employeeId, leaveTypeId, year);
        return R.ok(list);
    }

    @GetMapping("/quota/list")
    public R<List<LeaveQuotaVO>> listLeaveQuotas(@RequestParam Long employeeId,
                                                  @RequestParam Integer year) {
        employeeId = resolveReadableEmployeeId(employeeId);
        List<LeaveQuotaVO> list = leaveService.listLeaveQuotas(employeeId, year);
        return R.ok(list);
    }

    private Long resolveReadableEmployeeId(Long requestedEmployeeId) {
        if (isLeaveQuotaManager()) {
            return requestedEmployeeId;
        }
        EmployeeVO currentEmployee = employeeService.getCurrentEmployee();
        if (currentEmployee == null || currentEmployee.getId() == null) {
            throw new HrBusinessException("Current user is not bound to an employee profile");
        }
        return currentEmployee.getId();
    }

    private void requireLeaveQuotaManager() {
        if (!isLeaveQuotaManager()) {
            throw new HrBusinessException("Only HR or admin can initialize or adjust leave quota");
        }
    }

    private boolean isLeaveQuotaManager() {
        if (SecurityUtils.isAdmin()) {
            return true;
        }
        Set<String> roles = UserContext.getRoles();
        if (roles != null) {
            for (String role : roles) {
                String normalizedRole = String.valueOf(role).trim().toUpperCase();
                if ("HR".equals(normalizedRole)) {
                    return true;
                }
            }
        }
        return false;
    }
    
    // ==================== 请假申请管理 ====================
    
    /**
     * 创建请假申请
     */
    @PostMapping("/application")
    public R<Long> createLeaveApplication(@Validated @RequestBody LeaveApplicationCreateDTO dto) {
        Long id = leaveService.createLeaveApplication(dto);
        return R.ok(id);
    }
    
    /**
     * 提交请假申请
     */
    @PostMapping("/application/{id}/submit")
    public R<Void> submitLeaveApplication(@PathVariable Long id) {
        leaveService.submitLeaveApplication(id);
        return R.ok();
    }
    
    /**
     * 审批通过请假申请
     */
    @PostMapping("/application/{id}/approve")
    public R<Void> approveLeaveApplication(@PathVariable Long id) {
        leaveService.approveLeaveApplication(id);
        return R.ok();
    }
    
    /**
     * 审批拒绝请假申请
     */
    @PostMapping("/application/{id}/reject")
    public R<Void> rejectLeaveApplication(@PathVariable Long id) {
        leaveService.rejectLeaveApplication(id);
        return R.ok();
    }
    
    /**
     * 撤销请假申请
     */
    @PostMapping("/application/{id}/cancel")
    public R<Void> cancelLeaveApplication(@PathVariable Long id) {
        leaveService.cancelLeaveApplication(id);
        return R.ok();
    }
    
    /**
     * 获取请假申请详情
     */
    @GetMapping("/application/{id}")
    public R<LeaveApplicationVO> getLeaveApplication(@PathVariable Long id) {
        return R.ok(leaveService.getLeaveApplication(id));
    }

    /**
     * 分页查询请假申请列表
     */
    @GetMapping("/application/page")
    public R<IPage<LeaveApplicationVO>> listLeaveApplications(@Validated LeaveApplicationQueryDTO query) {
        IPage<LeaveApplicationVO> page = leaveService.listLeaveApplications(query);
        return R.ok(page);
    }

    @GetMapping("/application/board")
    public R<List<LeaveApplicationVO>> listApprovedLeaveBoard(
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate endDate) {
        LocalDate start = startDate != null ? startDate : LocalDate.now();
        LocalDate end = endDate != null ? endDate : start.plusDays(30);
        return R.ok(leaveService.listApprovedLeaveBoard(start.atStartOfDay(), end.plusDays(1).atStartOfDay()));
    }
}
