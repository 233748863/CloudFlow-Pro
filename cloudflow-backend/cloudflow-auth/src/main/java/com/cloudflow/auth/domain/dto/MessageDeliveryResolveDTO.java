package com.cloudflow.auth.domain.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;
import lombok.ToString;

@Data
public class MessageDeliveryResolveDTO {
    @NotNull
    private Integer version;
    @NotBlank
    @Pattern(regexp = "ACCEPTED|NOT_ACCEPTED")
    private String conclusion;
    @NotBlank
    @Size(min = 10, max = 1000)
    private String evidence;
    @NotBlank
    @Size(max = 256)
    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    @ToString.Exclude
    private String password;
    @Size(max = 10)
    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    @ToString.Exclude
    private String totpCode;
}
