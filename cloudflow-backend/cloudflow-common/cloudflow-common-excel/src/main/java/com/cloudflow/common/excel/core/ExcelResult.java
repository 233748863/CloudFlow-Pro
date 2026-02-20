package com.cloudflow.common.excel.core;

import java.util.List;

/**
 * Excel 导入结果接口
 * 封装导入后的数据列表和错误信息
 *
 * @author CloudFlow
 */
public interface ExcelResult<T> {

    /**
     * 获取导入的数据列表
     */
    List<T> getList();

    /**
     * 获取错误信息列表
     */
    List<String> getErrorList();

    /**
     * 获取导入结果的分析描述
     */
    String getAnalysis();
}
