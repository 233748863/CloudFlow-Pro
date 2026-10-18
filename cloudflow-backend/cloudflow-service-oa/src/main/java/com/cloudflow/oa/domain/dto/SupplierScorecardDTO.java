package com.cloudflow.oa.domain.dto;

import com.cloudflow.oa.domain.OaSupplierScorecard;
import com.cloudflow.oa.domain.OaSupplierScoreCriteria;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import java.util.List;

@Data
public class SupplierScorecardDTO {
    @NotNull @Valid
    private OaSupplierScorecard scorecard;
    @NotEmpty @Valid
    private List<OaSupplierScoreCriteria> criteria;
}
