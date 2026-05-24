package com.cloudflow.hr.domain.dto.compensation;

import com.cloudflow.common.core.domain.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDate;

/**
 * 薪酬域通用查询入参。
 *
 * <p>覆盖薪酬项/结构/薪级/员工薪酬/调薪变更/福利方案/员工福利/税务档案/税务扣除 9 类资源的
 * 共用查询字段。{@link com.cloudflow.hr.service.HrTypedCrudService} 反射映射到对应 entity 字段。
 *
 * <p>各资源专属查询字段（如薪级 grade_level、税档 person_type）走 {@code params} 扩展 Map 透传，
 * 后续 B3 收口 Service 签名时再按资源精修独立 QueryDTO。
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(name = "HrCompCommonQueryDTO", description = "薪酬域通用查询入参")
public class HrCompCommonQueryDTO extends PageQuery {

    @Schema(description = "关键字（编号 / 名称 模糊）")
    private String keyword;

    @Schema(description = "状态")
    private String status;

    @Schema(description = "员工 ID（员工薪酬/福利/税档/调薪等关联资源）")
    private Long employeeId;

    @Schema(description = "薪酬结构 ID")
    private Long structureId;

    @Schema(description = "薪酬项目 ID")
    private Long componentId;

    @Schema(description = "薪级 ID")
    private Long gradeId;

    @Schema(description = "生效日期起")
    private LocalDate effectiveFrom;

    @Schema(description = "生效日期止")
    private LocalDate effectiveTo;
}
