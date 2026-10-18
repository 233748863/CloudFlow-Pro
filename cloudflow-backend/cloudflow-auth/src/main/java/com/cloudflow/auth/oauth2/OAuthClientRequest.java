package com.cloudflow.auth.oauth2;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.List;
import lombok.Data;
import lombok.ToString;

@Data
@ToString(onlyExplicitlyIncluded = true)
public class OAuthClientRequest {
    private Long clientId;
    private Integer version;
    @NotNull
    @Positive
    private Long tenantId;
    @NotBlank
    @Size(max = 20)
    private String clientType;
    @NotBlank
    @Size(max = 100)
    private String clientName;
    @Size(max = 1000)
    private String description;
    private Long logoFileId;
    private Long serviceUserId;
    @NotNull
    private Integer accessTokenValiditySeconds;
    @NotNull
    private Integer refreshTokenValiditySeconds;
    @NotNull
    @Size(max = 20)
    private List<@NotBlank @Size(max = 1000) String> redirectUris;
    @NotNull
    @Size(min = 1, max = 2)
    private List<@NotBlank String> grantTypes;
    @NotNull
    @Size(min = 1, max = 4)
    private List<@NotBlank String> scopes;
    @Size(max = 4)
    private List<@NotBlank String> autoApproveScopes;
    @Size(max = 4)
    private List<@NotBlank String> authorities;
    @Size(max = 4)
    private List<@NotBlank String> resourceIds;
    @NotBlank
    private String status;
    @NotBlank
    private String secretAction;
    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    @Size(max = 128)
    private String clientSecret;
}

