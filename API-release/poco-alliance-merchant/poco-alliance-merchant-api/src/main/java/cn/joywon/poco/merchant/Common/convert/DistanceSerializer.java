package cn.joywon.poco.merchant.Common.convert;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;

import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DecimalFormat;

public class DistanceSerializer extends JsonSerializer<Double> {

    private static final DecimalFormat KM_FORMAT = new DecimalFormat("#.##");
    private static final DecimalFormat METER_FORMAT = new DecimalFormat("#.##");

    static {
        KM_FORMAT.setRoundingMode(RoundingMode.HALF_UP);
    }

    static {
        METER_FORMAT.setRoundingMode(RoundingMode.HALF_UP);
    }

    @Override
    public void serialize(Double num, JsonGenerator gen, SerializerProvider ser) throws IOException {
        if (num == null) {
            gen.writeNull();
            return;
        }

        BigDecimal value = BigDecimal.valueOf(num);

        try {
            if (value.compareTo(BigDecimal.ONE) < 0) {
                BigDecimal meters = value.multiply(BigDecimal.valueOf(1000L));
                String format = METER_FORMAT.format(meters);
                gen.writeString(format + " 米");

            } else if (value.compareTo(BigDecimal.ZERO) == 0) {
                gen.writeString("0 米");

            } else {
                String format = KM_FORMAT.format(value);
                gen.writeString(format + " 千米");
            }

        } catch (NumberFormatException e) {
            gen.writeNumber(num);
        }

    }

}