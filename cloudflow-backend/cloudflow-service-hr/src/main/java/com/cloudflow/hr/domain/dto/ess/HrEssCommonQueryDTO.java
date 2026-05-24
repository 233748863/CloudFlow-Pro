package com.cloudflow.hr.domain.dto.ess;

import com.cloudflow.common.core.domain.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 员工自助域共用分页查询入参（工资条 / 银行卡 / 家庭成员 / 福利明细 列表使用）。
 *
 * <p>ESS 子域过滤维度统一收敛：员工、周期、状态、关键字。Controller 会在此基础上：
 * <ul>
 *   <li>员工视角：强制注入 employeeId = currentEmployeeId，覆盖客户端传值</li>
 *   <li>HR 管理员视角：保持客户端传值，未传则注入当前员工兜底</li>
 * </ul>
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(name = "HrEssCommonQueryDTO", description = "员工自助域共用分页查询入参")
public class HrEssCommonQueryDTO extends PageQuery {

    @Schema(description = "员工 ID（HR 管理员可指定，员工自助场景由 Controller 强制覆盖）")
    private Long employeeId;

    @Schema(description = "签署人 ID（电子合同签署列表用，由 Controller 强制覆盖为当前员工）")
    private Long signerId;

    @Schema(description = "薪资/福利周期 yyyy-MM")
    private String periodMonth;

    @Schema(description = "状态")
    private String status;

    @Schema(description = "银行卡类型")
    private String cardType;

    @Schema(description = "家属关系")
    private String relation;

    @Schema(description = "关键字 模糊匹配")
    private String keyword;
}
