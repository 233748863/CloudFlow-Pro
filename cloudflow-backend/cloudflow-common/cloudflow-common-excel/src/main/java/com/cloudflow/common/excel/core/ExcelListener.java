package com.cloudflow.common.excel.core;

import cn.idev.excel.read.listener.ReadListener;

/**
 * Excel 导入监听器接口
 * 继承 FastExcel 的 ReadListener，扩展获取导入结果的能力
 *
 * @author CloudFlow
 */
public interface ExcelListener<T> extends ReadListener<T> {

    /**
     * 获取 Excel 导入结果
     *
     * @return 导入结果对象
     */
    ExcelResult<T> getExcelResult();
}
