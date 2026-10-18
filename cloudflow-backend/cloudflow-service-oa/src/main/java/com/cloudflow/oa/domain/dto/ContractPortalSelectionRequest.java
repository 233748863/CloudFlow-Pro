package com.cloudflow.oa.domain.dto;

import com.cloudflow.common.core.exception.ServiceException;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.io.IOException;
import java.util.List;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ContractPortalSelectionRequest {
    @NotNull @Min(0)
    @JsonDeserialize(using = VersionValue.class)
    private Integer version;
    @NotNull @Size(max = 1000)
    private List<@NotNull String> termIds;
    @NotNull @Size(max = 1000)
    private List<@NotNull String> milestoneIds;
    @NotNull @Size(max = 1000)
    private List<@NotNull String> paymentScheduleIds;

    @JsonAnySetter
    public void unknown(String field, Object value) { throw new ServiceException("请求包含不允许的字段", 400); }

    public static final class VersionValue extends JsonDeserializer<Integer> {
        @Override
        public Integer deserialize(JsonParser parser, DeserializationContext context) throws IOException {
            if (!parser.hasToken(JsonToken.VALUE_NUMBER_INT)) throw new ServiceException("合同版本须为非负整数", 400);
            try {
                int version = parser.getBigIntegerValue().intValueExact();
                if (version < 0) throw new ServiceException("合同版本须为非负整数", 400);
                return version;
            } catch (ArithmeticException overflow) { throw new ServiceException("合同版本超出允许范围", 400); }
        }
    }
}
