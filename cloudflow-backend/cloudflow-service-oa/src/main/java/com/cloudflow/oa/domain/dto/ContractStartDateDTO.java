package com.cloudflow.oa.domain.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDate;

public record ContractStartDateDTO(Integer version, @JsonFormat(pattern = "yyyy-MM-dd") LocalDate startDate) { }
