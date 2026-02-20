package com.cloudflow.common.excel.core;

import lombok.Getter;

import java.util.ArrayList;
import java.util.List;

/**
 * Excel 导入结果默认实现
 *
 * @author CloudFlow
 */
public class DefaultExcelResult<T> implements ExcelResult<T> {

    /**
     * 导入成功的数据列表
     */
    @Getter
    private final List<T> list;

    /**
     * 错误信息列表
     */
    @Getter
    private final List<String> errorList;

    public DefaultExcelResult() {
        this.list = new ArrayList<>();
        this.errorList = new ArrayList<>();
    }

    public DefaultExcelResult(List<T> list, List<String> errorList) {
        this.list = list;
        this.errorList = errorList;
    }

    /**
     * 获取导入结果的分析描述
     * 包含成功条数和失败条数信息
     */
    @Override
    public String getAnalysis() {
        int successCount = list.size();
        int errorCount = errorList.size();
        if (errorCount == 0) {
            return String.format("导入成功！共 %d 条数据", successCount);
        } else {
            return String.format("导入完成！成功 %d 条，失败 %d 条。失败详情：%s",
                    successCount, errorCount, String.join("；", errorList));
        }
    }
}
