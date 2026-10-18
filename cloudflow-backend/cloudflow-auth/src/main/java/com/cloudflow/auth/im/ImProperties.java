package com.cloudflow.auth.im;

import com.fasterxml.jackson.annotation.JsonIgnore;
import java.util.List;
import lombok.Getter;
import lombok.Setter;
import lombok.ToString;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Getter
@Setter
@ToString(onlyExplicitlyIncluded = true)
@Component
@ConfigurationProperties(prefix = "cloudflow.im")
public class ImProperties {
    private boolean enabled;
    @JsonIgnore
    private String secretKey;
    private String publicUrl;
    private List<String> loginRedirectPaths = List.of();
}
