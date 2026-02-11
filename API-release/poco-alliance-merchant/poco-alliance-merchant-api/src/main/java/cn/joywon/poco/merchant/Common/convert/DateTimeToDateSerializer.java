package cn.joywon.poco.merchant.Common.convert;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;

import java.io.IOException;
import java.time.LocalDate;
import java.time.LocalDateTime;

public class DateTimeToDateSerializer extends JsonSerializer<LocalDateTime> {

    @Override
    public void serialize(LocalDateTime time, JsonGenerator gen, SerializerProvider ser) throws IOException {
        if (time == null) {
            gen.writeNull();
        } else {
            LocalDate date = time.toLocalDate();
            gen.writeString(date.toString());
        }
    }

}