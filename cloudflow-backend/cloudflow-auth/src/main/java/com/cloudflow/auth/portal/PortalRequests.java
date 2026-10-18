package com.cloudflow.auth.portal;

import com.cloudflow.common.core.exception.ServiceException;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

public final class PortalRequests {
    private PortalRequests() { }

    public abstract static class Strict {
        @JsonAnySetter
        public void unknown(String field, Object value) { throw new ServiceException("请求包含不允许的字段", 400); }
    }

    @Getter
    @Setter
    public static final class Invite extends Strict {
        @NotNull @Min(1)
        private Long contactId;
        @NotBlank @Size(max = 100)
        private String loginAccount;
    }

    @Getter
    @Setter
    public static final class Version extends Strict {
        @NotNull @Min(0)
        private Integer version;
    }

    @Getter
    @Setter
    public static final class Login extends Strict {
        @NotNull @Size(max = 100)
        private String loginAccount;
        @NotNull @Size(max = 128)
        private String password;
    }

    @Getter
    @Setter
    public static final class Activation extends Strict {
        @NotNull @Size(min = 43, max = 43)
        private String activationToken;
        @NotNull @Size(max = 128)
        private String password;
    }
}
