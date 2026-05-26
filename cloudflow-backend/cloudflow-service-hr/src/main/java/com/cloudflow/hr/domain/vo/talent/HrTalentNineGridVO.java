package com.cloudflow.hr.domain.vo.talent;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * HR 人才盘点九宫格 VO（key=九宫格位置 1-9，value=该格参与者）。
 * 红线：Controller 出参禁 R&lt;Map&gt;，统一包装到 VO 字段内。
 */
@Data
@Schema(name = "HrTalentNineGridVO", description = "HR 人才盘点九宫格 VO")
public class HrTalentNineGridVO {

    @Schema(description = "九宫格分布 key=1-9 value=参与者列表")
    private Map<Integer, List<HrTalentParticipantVO>> cells = new LinkedHashMap<>();
}
