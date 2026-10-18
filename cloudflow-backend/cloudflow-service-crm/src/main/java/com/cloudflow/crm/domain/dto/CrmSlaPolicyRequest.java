package com.cloudflow.crm.domain.dto;

import com.cloudflow.crm.domain.CrmSlaPolicy;
import com.cloudflow.crm.domain.CrmSlaPriority;
import com.cloudflow.crm.domain.CrmSlaStatusRule;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;
import java.util.List;

@Data
public class CrmSlaPolicyRequest {
    @NotNull
    private CrmSlaPolicy policy;
    @NotNull
    @Size(max = 4)
    private List<CrmSlaPriority> priorities;
    @NotNull
    @Size(max = 5)
    private List<CrmSlaStatusRule> rules;
}
