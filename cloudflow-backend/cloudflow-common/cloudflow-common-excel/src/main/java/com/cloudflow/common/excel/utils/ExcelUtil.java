package com.cloudflow.common.excel.utils;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.IdUtil;
import cn.idev.excel.FastExcel;
import cn.idev.excel.write.style.column.LongestMatchColumnWidthStyleStrategy;
import jakarta.servlet.ServletOutputStream;
import jakarta.servlet.http.HttpServletResponse;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import com.cloudflow.common.excel.convert.ExcelBigNumberConvert;
import com.cloudflow.common.excel.core.*;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Excel 工具类
 * 封装 FastExcel（EasyExcel 升级版）的常用导入导出操作
 *
 * 使用示例：
 * 1. 导出：ExcelUtil.exportExcel(dataList, "用户列表", UserExportVo.class, response);
 * 2. 导入：List<UserImportVo> list = ExcelUtil.importExcel(inputStream, UserImportVo.class);
 * 3. 带校验导入：ExcelResult<UserImportVo> result = ExcelUtil.importExcel(inputStream, UserImportVo.class, true);
 *
 * @author CloudFlow
 */
@Slf4j
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public class ExcelUtil {

    /**
     * 同步导入（适用于小数据量）
     * 直接将 Excel 数据读取为 Java 对象列表
     *
     * @param is    输入流（Excel 文件流）
     * @param clazz 目标实体类（需要使用 @ExcelProperty 注解标注字段）
     * @return 转换后的数据列表
     */
    public static <T> List<T> importExcel(InputStream is, Class<T> clazz) {
        return FastExcel.read(is).head(clazz).autoCloseStream(false).sheet().doReadSync();
    }

    /**
     * 使用校验监听器异步导入，同步返回结果
     * 支持 Jakarta Validation 校验，自动收集错误信息
     *
     * @param is         输入流
     * @param clazz      目标实体类
     * @param isValidate 是否启用 Validator 校验
     * @return 导入结果（包含成功数据和错误信息）
     */
    public static <T> ExcelResult<T> importExcel(InputStream is, Class<T> clazz, boolean isValidate) {
        DefaultExcelListener<T> listener = new DefaultExcelListener<>(isValidate);
        FastExcel.read(is, clazz, listener).sheet().doRead();
        return listener.getExcelResult();
    }

    /**
     * 使用自定义监听器异步导入
     *
     * @param is       输入流
     * @param clazz    目标实体类
     * @param listener 自定义监听器
     * @return 导入结果
     */
    public static <T> ExcelResult<T> importExcel(InputStream is, Class<T> clazz, ExcelListener<T> listener) {
        FastExcel.read(is, clazz, listener).sheet().doRead();
        return listener.getExcelResult();
    }

    /**
     * 导出 Excel 到 HttpServletResponse
     * 自动设置响应头，支持中文文件名
     *
     * @param list      导出数据集合
     * @param sheetName 工作表名称（同时作为文件名）
     * @param clazz     实体类（需要使用 @ExcelProperty 注解标注字段）
     * @param response  HTTP 响应对象
     */
    public static <T> void exportExcel(List<T> list, String sheetName, Class<T> clazz, HttpServletResponse response) {
        try {
            resetResponse(sheetName, response);
            ServletOutputStream os = response.getOutputStream();
            exportExcel(list, sheetName, clazz, os);
            os.flush();
            response.flushBuffer();
        } catch (Exception e) {
            handleExportException(response, "导出Excel异常", e);
        }
    }

    /**
     * 导出 Excel 到输出流
     *
     * @param list      导出数据集合
     * @param sheetName 工作表名称
     * @param clazz     实体类
     * @param os        输出流
     */
    public static <T> void exportExcel(List<T> list, String sheetName, Class<T> clazz, OutputStream os) {
        List<T> dataList = CollUtil.isEmpty(list) ? List.of() : list;
        FastExcel.write(os, clazz)
                .autoCloseStream(false)
                // 自动适配列宽
                .registerWriteHandler(new LongestMatchColumnWidthStyleStrategy())
                // 大数值自动转换，防止精度丢失
                .registerConverter(new ExcelBigNumberConvert())
                .sheet(sheetName)
                .doWrite(dataList);
    }

    /**
     * 导出空模板（仅包含表头，无数据）
     * 适用于提供导入模板下载
     *
     * @param sheetName 工作表名称
     * @param clazz     实体类
     * @param response  HTTP 响应对象
     */
    public static <T> void exportTemplate(String sheetName, Class<T> clazz, HttpServletResponse response) {
        try {
            resetResponse(sheetName, response);
            ServletOutputStream os = response.getOutputStream();
            FastExcel.write(os, clazz)
                    .autoCloseStream(false)
                    .registerWriteHandler(new LongestMatchColumnWidthStyleStrategy())
                    .sheet(sheetName)
                    .doWrite(List.of());
            os.flush();
            response.flushBuffer();
        } catch (Exception e) {
            handleExportException(response, "导出Excel模板异常", e);
        }
    }

    /**
     * 重置 HTTP 响应头
     * 设置文件下载相关的 Content-Type 和 Content-Disposition
     *
     * @param sheetName 文件名（不含扩展名）
     * @param response  HTTP 响应对象
     */
    private static void resetResponse(String sheetName, HttpServletResponse response) {
        String filename = encodingFilename(sheetName);
        response.reset();
        // 设置 Content-Type 为 Excel 格式
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        // 同时设置 filename 和 filename*，兼容不同浏览器的中文文件名解析
        String encodedFilename = URLEncoder.encode(filename, StandardCharsets.UTF_8).replaceAll("\\+", "%20");
        response.setHeader("Content-Disposition",
                "attachment; filename=\"" + encodedFilename + "\"; filename*=UTF-8''" + encodedFilename);
        // 允许前端获取 Content-Disposition 头
        response.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    }

    /**
     * 导出失败时返回明确的 500 JSON，避免前端把错误响应误存成损坏的 Excel。
     */
    private static void handleExportException(HttpServletResponse response, String message, Exception e) {
        log.error(message, e);
        if (response.isCommitted()) {
            throw new RuntimeException(message, e);
        }

        try {
            response.reset();
            response.setStatus(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.setContentType("application/json;charset=UTF-8");
            byte[] body = "{\"code\":500,\"msg\":\"导出失败，请稍后重试\"}".getBytes(StandardCharsets.UTF_8);
            response.getOutputStream().write(body);
            response.flushBuffer();
        } catch (IOException ioException) {
            throw new RuntimeException(message, e);
        }
    }

    /**
     * 编码文件名
     * 使用 UUID 前缀确保文件名唯一，避免缓存问题
     *
     * @param filename 原始文件名
     * @return 编码后的文件名（格式：uuid_filename.xlsx）
     */
    public static String encodingFilename(String filename) {
        return IdUtil.fastSimpleUUID() + "_" + filename + ".xlsx";
    }

    /**
     * 解析字典表达式
     * 将实际值转换为显示文本，例如：propertyValue="0", converterExp="0=男,1=女" → "男"
     *
     * @param propertyValue 属性值
     * @param converterExp  转换表达式（格式：value=text,value=text）
     * @param separator     多值分隔符
     * @return 转换后的显示文本
     */
    public static String convertByExp(String propertyValue, String converterExp, String separator) {
        StringBuilder propertyString = new StringBuilder();
        String[] convertSource = converterExp.split(",");
        for (String item : convertSource) {
            String[] itemArray = item.split("=");
            if (itemArray.length != 2) {
                continue;
            }
            if (propertyValue.contains(separator)) {
                // 多值场景
                for (String value : propertyValue.split(separator)) {
                    if (itemArray[0].equals(value)) {
                        propertyString.append(itemArray[1]).append(separator);
                        break;
                    }
                }
            } else {
                // 单值场景
                if (itemArray[0].equals(propertyValue)) {
                    return itemArray[1];
                }
            }
        }
        // 去除末尾分隔符
        String result = propertyString.toString();
        if (result.endsWith(separator)) {
            result = result.substring(0, result.length() - separator.length());
        }
        return result;
    }

    /**
     * 反向解析字典表达式
     * 将显示文本转换为实际值，例如：propertyValue="男", converterExp="0=男,1=女" → "0"
     *
     * @param propertyValue 显示文本
     * @param converterExp  转换表达式
     * @param separator     多值分隔符
     * @return 转换后的实际值
     */
    public static String reverseByExp(String propertyValue, String converterExp, String separator) {
        StringBuilder propertyString = new StringBuilder();
        String[] convertSource = converterExp.split(",");
        for (String item : convertSource) {
            String[] itemArray = item.split("=");
            if (itemArray.length != 2) {
                continue;
            }
            if (propertyValue.contains(separator)) {
                for (String value : propertyValue.split(separator)) {
                    if (itemArray[1].equals(value)) {
                        propertyString.append(itemArray[0]).append(separator);
                        break;
                    }
                }
            } else {
                if (itemArray[1].equals(propertyValue)) {
                    return itemArray[0];
                }
            }
        }
        String result = propertyString.toString();
        if (result.endsWith(separator)) {
            result = result.substring(0, result.length() - separator.length());
        }
        return result;
    }
}
