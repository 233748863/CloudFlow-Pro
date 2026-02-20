package com.cloudflow.common.excel.convert;

import cn.idev.excel.converters.Converter;
import cn.idev.excel.converters.WriteConverterContext;
import cn.idev.excel.enums.CellDataTypeEnum;
import cn.idev.excel.metadata.data.WriteCellData;

import java.math.BigDecimal;

/**
 * Excel 大数值转换器
 * 将超过 JavaScript Number 安全范围的 Long 类型自动转为字符串，防止前端精度丢失
 * JavaScript Number.MAX_SAFE_INTEGER = 2^53 - 1 = 9007199254740991
 *
 * @author CloudFlow
 */
public class ExcelBigNumberConvert implements Converter<Long> {

    /**
     * JavaScript 最大安全整数
     */
    private static final long MAX_SAFE_INTEGER = 9007199254740991L;

    /**
     * JavaScript 最小安全整数
     */
    private static final long MIN_SAFE_INTEGER = -9007199254740991L;

    @Override
    public Class<?> supportJavaTypeKey() {
        return Long.class;
    }

    @Override
    public CellDataTypeEnum supportExcelTypeKey() {
        return CellDataTypeEnum.STRING;
    }

    /**
     * 写入 Excel 时转换
     * 如果数值超出安全范围，转为字符串类型写入
     */
    @Override
    public WriteCellData<?> convertToExcelData(WriteConverterContext<Long> context) {
        Long value = context.getValue();
        if (value != null && (value > MAX_SAFE_INTEGER || value < MIN_SAFE_INTEGER)) {
            // 超出安全范围，转为字符串
            return new WriteCellData<>(value.toString());
        }
        // 安全范围内，正常写入数值
        return new WriteCellData<>(new BigDecimal(value));
    }
}
