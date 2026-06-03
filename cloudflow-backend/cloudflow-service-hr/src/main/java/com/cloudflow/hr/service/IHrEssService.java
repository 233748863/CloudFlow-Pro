package com.cloudflow.hr.service;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.hr.domain.entity.HrSalarySlip;

import java.util.List;
import java.util.Map;

/**
 * ESS 数据维护服务接口：工资条 / 福利明细的月度生成入口 + 写入侧规则封装。
 *
 * <p>纯 CRUD（list/get/update/delete）继续走 {@link HrTypedCrudService} 泛型路径，
 * 仅生成型 / 跨表 / 写入侧规则相关逻辑下沉到本服务。
 */
public interface IHrEssService {

    /**
     * 月度工资条生成。基于 {@code hr_employee_comp} 当期生效的薪酬项 + 个税 / 福利汇总写入
     * {@code hr_salary_slip}。已存在 (tenant, employee, period_month) 记录的不会重复写入。
     *
     * @param periodMonth 期间，格式 {@code YYYY-MM}
     * @param employeeId  可选，限定单员工生成；为 null 表示全员
     * @return 实际新增的工资条记录数
     */
    int generateSalarySlips(String periodMonth, Long employeeId);

    /**
     * 员工确认工资条。仅允许工资条 owner 本人切换 employeeConfirmed → true。
     */
    void confirmSalarySlip(Long slipId);

    PageResult<HrSalarySlip> pageMySalarySlips(PageQuery pageQuery, String periodMonth, String status);

    HrSalarySlip getMySalarySlip(Long slipId);

    /**
     * 月度福利明细生成（社保 / 公积金等）。基于 {@code hr_employee_benefit} 在档员工 × 在档方案
     * 写入 {@code hr_benefit_payment}。已存在 (tenant, employee, scheme, period_month) 不重写。
     *
     * @param periodMonth YYYY-MM
     * @param employeeId  可选，限定单员工生成；为 null 表示全员
     * @return 实际新增的福利明细数
     */
    int generateBenefitPayments(String periodMonth, Long employeeId);

    /**
     * 创建银行卡，写入后若 isPrimary=true，自动把当前员工其它银行卡 isPrimary 重置为 false。
     */
    Long createBankCard(Map<String, Object> payload);

    /**
     * 更新银行卡同样处理 isPrimary 唯一性。
     */
    void updateBankCard(Long id, Map<String, Object> payload);

    /**
     * 列出当前员工最近 N 条工资条（HR 管理员视角无 employee 过滤，由控制器外层决定）。
     */
    List<HrSalarySlip> listMySlips(int limit);

    /**
     * ESS 门户聚合视图，给 /ess/portal/summary 使用：
     * <ul>
     *   <li>employee：当前员工基本信息（部门 / 岗位 / 状态）</li>
     *   <li>leaveBalances：当年假期类型 + 余额（hr_leave_quota join hr_leave_type）</li>
     *   <li>latestSlip：最近一份 hr_salary_slip</li>
     *   <li>pendingContracts：hr_employee_contract 中 sign_status 不为 SIGNED 的合同 + 关联签署记录</li>
     *   <li>recentCertificates：最近 5 条 hr_certificate_request</li>
     *   <li>unreadMessages：hr_self_service_message read_flag=0 的明细 + 计数</li>
     * </ul>
     */
    Map<String, Object> portalSummary();
}
