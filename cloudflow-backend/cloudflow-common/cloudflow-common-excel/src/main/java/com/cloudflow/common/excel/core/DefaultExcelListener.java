package com.cloudflow.common.excel.core;

import cn.hutool.core.util.StrUtil;
import cn.idev.excel.context.AnalysisContext;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import lombok.extern.slf4j.Slf4j;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Excel 默认导入监听器
 * 支持 Jakarta Validation 校验，自动收集错误信息
 *
 * 使用示例：
 * DefaultExcelListener<UserImportVo> listener = new DefaultExcelListener<>(true);
 * FastExcel.read(inputStream, UserImportVo.class, listener).sheet().doRead();
 * ExcelResult<UserImportVo> result = listener.getExcelResult();
 *
 * @author CloudFlow
 */
@Slf4j
public class DefaultExcelListener<T> implements ExcelListener<T> {

    /**
     * 是否启用 Validator 校验
     */
    private final boolean isValidate;

    /**
     * 校验器实例
     */
    private final Validator validator;

    /**
     * 导入成功的数据列表
     */
    private final List<T> list = new ArrayList<>();

    /**
     * 错误信息列表
     */
    private final List<String> errorList = new ArrayList<>();

    /**
     * 构造方法
     *
     * @param isValidate 是否启用校验
     */
    public DefaultExcelListener(boolean isValidate) {
        this.isValidate = isValidate;
        // 使用默认的 Validator 工厂创建校验器
        this.validator = Validation.buildDefaultValidatorFactory().getValidator();
    }

    /**
     * 每读取一行数据时触发
     * 如果启用了校验，会对数据进行 Jakarta Validation 校验
     *
     * @param data    当前行数据
     * @param context 分析上下文
     */
    @Override
    public void invoke(T data, AnalysisContext context) {
        if (isValidate) {
            // 执行 Jakarta Validation 校验
            try {
                Set<ConstraintViolation<T>> violations = validator.validate(data);
                if (!violations.isEmpty()) {
                    // 收集校验错误信息
                    String errorMsg = violations.stream()
                            .map(ConstraintViolation::getMessage)
                            .collect(Collectors.joining(", "));
                    // 记录错误：第 N 行数据校验失败
                    int rowIndex = context.readRowHolder().getRowIndex() + 1;
                    errorList.add(String.format("第 %d 行数据校验失败：%s", rowIndex, errorMsg));
                    return;
                }
            } catch (Exception e) {
                int rowIndex = context.readRowHolder().getRowIndex() + 1;
                errorList.add(String.format("第 %d 行数据校验异常：%s", rowIndex, e.getMessage()));
                return;
            }
        }
        // 校验通过，加入成功列表
        list.add(data);
    }

    /**
     * 所有数据读取完成后触发
     *
     * @param context 分析上下文
     */
    @Override
    public void doAfterAllAnalysed(AnalysisContext context) {
        log.info("Excel 导入完成，成功 {} 条，失败 {} 条", list.size(), errorList.size());
    }

    /**
     * 获取导入结果
     *
     * @return Excel 导入结果
     */
    @Override
    public ExcelResult<T> getExcelResult() {
        return new DefaultExcelResult<>(list, errorList);
    }
}
