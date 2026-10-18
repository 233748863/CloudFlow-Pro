package com.cloudflow.common.excel.importing;

import cn.idev.excel.FastExcel;
import cn.idev.excel.context.AnalysisContext;
import cn.idev.excel.support.ExcelTypeEnum;
import cn.idev.excel.event.AnalysisEventListener;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.excel.importing.model.ImportErrorRecord;
import java.io.BufferedInputStream;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.CharsetDecoder;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BiFunction;
import java.util.function.Consumer;
import java.util.function.Predicate;
import java.util.stream.Collectors;
import org.apache.poi.poifs.filesystem.FileMagic;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.DataValidation;
import org.apache.poi.ss.usermodel.DataValidationHelper;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Name;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.util.CellRangeAddressList;
import org.apache.poi.ss.util.CellReference;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.springframework.web.multipart.MultipartFile;

public class ImportSpreadsheets {
    public static final long MAX_FILE_SIZE = 10L * 1024 * 1024;
    public static final int BATCH_SIZE = 200;

    public record RawRow(int rowNo, int ordinal, Map<String, String> values, Map<Integer, String> cells) { }
    public record PreparedUpload(Path path, ExcelTypeEnum type, String fileName, long size, int rows) implements AutoCloseable {
        @Override public void close() throws IOException { Files.deleteIfExists(path); }
    }

    public PreparedUpload prepare(MultipartFile file, ImportDefinition<?> definition) throws IOException {
        if (file == null || file.isEmpty()) throw new ServiceException("请选择导入文件");
        if (file.getSize() > MAX_FILE_SIZE) throw new ServiceException("导入文件不能超过10MB");
        Path target = Files.createTempFile("cloudflow-import-", ".input");
        boolean ready = false;
        try {
            try (InputStream input = file.getInputStream(); OutputStream output = Files.newOutputStream(target)) {
                byte[] buffer = new byte[8192];
                long total = 0;
                int count;
                while ((count = input.read(buffer)) != -1) {
                    total += count;
                    if (total > MAX_FILE_SIZE) throw new ServiceException("导入文件不能超过10MB");
                    output.write(buffer, 0, count);
                }
            }
            ExcelTypeEnum type = detect(target);
            int rows = scan(target, definition, ignored -> { }, ignored -> true);
            if (rows == 0) throw new ServiceException("导入文件没有数据行，请在数据页填写后上传");
            String name = safeName(file.getOriginalFilename(), extension(type));
            PreparedUpload result = new PreparedUpload(target, type, name, Files.size(target), rows);
            ready = true;
            return result;
        } finally {
            if (!ready) Files.deleteIfExists(target);
        }
    }

    public ExcelTypeEnum detect(Path source) throws IOException {
        FileMagic magic;
        try (InputStream input = new BufferedInputStream(Files.newInputStream(source))) {
            magic = FileMagic.valueOf(input);
        }
        if (magic == FileMagic.OOXML) return ExcelTypeEnum.XLSX;
        if (magic == FileMagic.OLE2) return ExcelTypeEnum.XLS;
        if (magic != FileMagic.UNKNOWN) throw new ServiceException("文件内容不是xlsx、xls或UTF-8 CSV");
        CharsetDecoder decoder = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT);
        try (InputStreamReader reader = new InputStreamReader(Files.newInputStream(source), decoder)) {
            char[] buffer = new char[8192];
            int count;
            while ((count = reader.read(buffer)) != -1) {
                for (int index = 0; index < count; index++) {
                    char value = buffer[index];
                    if (Character.isISOControl(value) && value != '\r' && value != '\n' && value != '\t') {
                        throw new ServiceException("CSV包含二进制内容或非法控制字符");
                    }
                }
            }
        } catch (java.nio.charset.CharacterCodingException exception) {
            throw new ServiceException("CSV必须采用UTF-8编码");
        }
        return ExcelTypeEnum.CSV;
    }

    public int scan(Path source, ImportDefinition<?> definition, Consumer<Map<Integer, String>> onHeader,
                    Predicate<RawRow> onRow) throws IOException {
        ExcelTypeEnum type = detect(source);
        Map<Integer, String> fields = new LinkedHashMap<>();
        java.util.Set<Integer> ignoredColumns = new java.util.HashSet<>();
        Throwable[] callbackFailure = {null};
        int[] rowCount = {0};
        boolean[] hasHeader = {false};
        boolean[] continueReading = {true};
        AnalysisEventListener<Map<Integer, String>> listener = new AnalysisEventListener<>() {
            @Override
            public void invokeHeadMap(Map<Integer, String> header, AnalysisContext context) {
                if (header.size() > 101 || header.keySet().stream().anyMatch(index -> index >= 101)) throw new ServiceException("导入文件不能超过100列及一列错误说明");
                Map<String, ImportColumn> names = new HashMap<>();
                definition.columns().forEach(column -> {
                    names.put(headerName(column.getName()), column);
                    names.put(column.getField(), column);
                });
                Map<Integer, String> visible = new LinkedHashMap<>();
                header.forEach((index, title) -> {
                    if ("错误说明".equals(headerName(title))) { ignoredColumns.add(index); return; }
                    visible.put(index, title == null ? "" : title);
                    ImportColumn column = names.get(headerName(title));
                    if (column == null) return;
                    if (fields.containsValue(column.getField())) throw new ServiceException("表头包含重复字段：" + column.getName());
                    fields.put(index, column.getField());
                });
                if (visible.size() > 100 || ignoredColumns.size() > 1) throw new ServiceException("导入文件不能超过100列及一列错误说明");
                for (ImportColumn column : definition.columns()) {
                    if (column.isRequired() && !fields.containsValue(column.getField())) throw new ServiceException("缺少必填表头：" + column.getName());
                }
                if (fields.isEmpty()) throw new ServiceException("文件表头与该业务模板不匹配");
                hasHeader[0] = true;
                try { onHeader.accept(visible); }
                catch (RuntimeException | Error exception) { callbackFailure[0] = exception; throw exception; }
            }

            @Override
            public void invoke(Map<Integer, String> cells, AnalysisContext context) {
                if (!hasHeader[0]) throw new ServiceException("文件缺少表头");
                int maximumColumns = ignoredColumns.isEmpty() ? 100 : 101;
                if (cells.keySet().stream().anyMatch(index -> index >= maximumColumns)) throw new ServiceException("导入文件不能超过100列及一列错误说明");
                Map<String, String> values = new LinkedHashMap<>();
                fields.forEach((index, name) -> values.put(name, cells.get(index)));
                if (values.values().stream().allMatch(value -> value == null || value.isBlank())) return;
                rowCount[0]++;
                if (rowCount[0] > definition.maxRows()) throw new ServiceException("导入数据不能超过" + definition.maxRows() + "行");
                try { continueReading[0] = onRow.test(new RawRow(context.readRowHolder().getRowIndex() + 1, rowCount[0], values, cells)); }
                catch (RuntimeException | Error exception) { callbackFailure[0] = exception; throw exception; }
            }

            @Override public boolean hasNext(AnalysisContext context) { return continueReading[0]; }
            @Override public void doAfterAllAnalysed(AnalysisContext context) { }
        };
        try (InputStream input = Files.newInputStream(source)) {
            FastExcel.read(input, listener).excelType(type).charset(StandardCharsets.UTF_8).headRowNumber(1)
                    .ignoreEmptyRow(false).autoTrim(false).sheet(0).doRead();
        } catch (RuntimeException exception) {
            if (callbackFailure[0] instanceof RuntimeException runtimeException) throw runtimeException;
            if (callbackFailure[0] instanceof Error error) throw error;
            Throwable cause = exception;
            while (cause != null) {
                if (cause instanceof ServiceException serviceException) throw serviceException;
                cause = cause.getCause();
            }
            throw new ServiceException("文件结构损坏或内容格式不正确，请使用本业务模板");
        }
        if (!hasHeader[0]) throw new ServiceException("导入文件缺少表头");
        return rowCount[0];
    }

    public void template(ImportDefinition<?> definition, ImportContext context, OutputStream output) throws IOException {
        template(definition, context, List.of(), output);
    }

    public void template(ImportDefinition<?> definition, ImportContext context, List<Map<String, String>> initialRows,
                         OutputStream output) throws IOException {
        if (initialRows.size() > definition.maxRows()) throw new ServiceException("更新记录超过" + definition.maxRows() + "行，请缩小筛选范围", 400);
        SXSSFWorkbook workbook = new SXSSFWorkbook(BATCH_SIZE);
        workbook.setCompressTempFiles(true);
        try {
            Sheet data = workbook.createSheet("导入数据");
            Sheet examples = workbook.createSheet("示例（勿导入）");
            Sheet instructions = workbook.createSheet("填写说明");
            Sheet options = workbook.createSheet("选项");
            CellStyle heading = heading(workbook);
            Row headers = data.createRow(0);
            Row exampleHeaders = examples.createRow(0);
            Row exampleValues = examples.createRow(1);
            List<List<String>> optionColumns = new ArrayList<>();
            CellStyle textFormat = workbook.createCellStyle();
            textFormat.setDataFormat(workbook.createDataFormat().getFormat("@"));
            for (int index = 0; index < definition.columns().size(); index++) {
                ImportColumn column = definition.columns().get(index);
                text(headers, index, column.header()).setCellStyle(heading);
                text(exampleHeaders, index, column.header()).setCellStyle(heading);
                text(exampleValues, index, column.getExample());
                data.setColumnWidth(index, Math.min(80, Math.max(16, column.getName().length() * 2 + 4)) * 256);
                data.setDefaultColumnStyle(index, textFormat);
                examples.setColumnWidth(index, data.getColumnWidth(index));
                List<String> choices = !column.getOptions().isEmpty() ? new ArrayList<>(column.getOptions().values())
                        : column.getReference() != null ? context.choices(column.getReference()) : List.of();
                if (!choices.isEmpty()) {
                    String rangeName = "choices_" + index;
                    Name namedRange = workbook.createName();
                    namedRange.setNameName(rangeName);
                    String letter = CellReference.convertNumToColString(optionColumns.size());
                    optionColumns.add(choices);
                    namedRange.setRefersToFormula("'选项'!$" + letter + "$1:$" + letter + "$" + choices.size());
                    DataValidationHelper helper = data.getDataValidationHelper();
                    DataValidation validation = helper.createValidation(helper.createFormulaListConstraint(rangeName),
                            new CellRangeAddressList(1, Math.min(definition.maxRows(), 1048575), index, index));
                    validation.setShowErrorBox(column.getReference() == null);
                    validation.createErrorBox("选项无效", "请选择下拉选项，或按填写说明使用有效编号");
                    validation.setEmptyCellAllowed(!column.isRequired());
                    data.addValidationData(validation);
                }
            }
            for (int rowIndex = 0; rowIndex < initialRows.size(); rowIndex++) {
                Row dataRow = data.createRow(rowIndex + 1);
                Map<String, String> values = initialRows.get(rowIndex);
                for (int columnIndex = 0; columnIndex < definition.columns().size(); columnIndex++) {
                    ImportColumn column = definition.columns().get(columnIndex);
                    text(dataRow, columnIndex, values.get(column.getField()));
                }
            }
            int optionRows = optionColumns.stream().mapToInt(List::size).max().orElse(0);
            for (int optionIndex = 0; optionIndex < optionRows; optionIndex++) {
                Row row = options.createRow(optionIndex);
                for (int columnIndex = 0; columnIndex < optionColumns.size(); columnIndex++) {
                    List<String> choices = optionColumns.get(columnIndex);
                    if (optionIndex < choices.size()) text(row, columnIndex, choices.get(optionIndex));
                }
            }
            int line = 0;
            for (String instruction : List.of("只在第一张“导入数据”页填写数据；示例页不会参与导入。", "*为必填；日期格式yyyy-MM-dd；编号、手机号、身份证按文本填写。", "引用可填名称或编号；名称重复时必须填写编号。CSV必须使用UTF-8编码。", "文件不能超过10MB，数据不能超过" + definition.maxRows() + "行。", "错误文件中的“错误说明”列在重传时自动忽略。")) {
                text(instructions.createRow(line++), 0, instruction);
            }
            for (String instruction : definition.instructions()) {
                text(instructions.createRow(line++), 0, instruction);
            }
            for (ImportColumn column : definition.columns()) {
                String detail = column.header() + "；最多" + column.getMaxLength() + "字符；类型=" + column.getType()
                        + (column.getMinimum() == null ? "" : "；最小=" + column.getMinimum())
                        + (column.getMaximum() == null ? "" : "；最大=" + column.getMaximum());
                text(instructions.createRow(line++), 0, detail);
            }
            instructions.setColumnWidth(0, 100 * 256);
            data.createFreezePane(0, 1);
            workbook.setSheetHidden(3, true);
            workbook.write(output);
        } finally {
            workbook.close();
            workbook.dispose();
        }
    }

    public Path errors(Path source, ImportDefinition<?> definition,
                       BiFunction<Integer, Integer, List<ImportErrorRecord>> query) throws IOException {
        boolean annotated = detect(source) == ExcelTypeEnum.XLSX;
        Path target = Files.createTempFile("cloudflow-import-errors-", annotated ? ".xlsx" : ".txt");
        boolean ready = false;
        try (OutputStream output = Files.newOutputStream(target)) {
            if (annotated) annotatedErrors(source, definition, query, output);
            else textErrors(source, definition, query, output);
            ready = true;
            return target;
        } finally {
            if (!ready) Files.deleteIfExists(target);
        }
    }

    private void annotatedErrors(Path source, ImportDefinition<?> definition,
                                 BiFunction<Integer, Integer, List<ImportErrorRecord>> query, OutputStream output) throws IOException {
        SXSSFWorkbook workbook = new SXSSFWorkbook(BATCH_SIZE);
        workbook.setCompressTempFiles(true);
        try {
            Sheet sheet = workbook.createSheet("导入数据");
            CellStyle red = workbook.createCellStyle();
            red.setFillForegroundColor(IndexedColors.ROSE.getIndex());
            red.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            red.setWrapText(true);
            Font font = workbook.createFont();
            font.setColor(IndexedColors.DARK_RED.getIndex());
            red.setFont(font);
            Map<Integer, String> headers = new LinkedHashMap<>();
            Map<Integer, Integer> columnIndexes = new HashMap<>();
            int[] errorColumn = {0};
            ErrorWindow window = new ErrorWindow(query);
            scan(source, definition, values -> {
                headers.putAll(values);
                Row header = sheet.createRow(0);
                values.entrySet().stream().sorted(Map.Entry.comparingByKey()).forEach(entry -> {
                    int index = columnIndexes.size();
                    columnIndexes.put(entry.getKey(), index);
                    text(header, index, entry.getValue());
                });
                errorColumn[0] = columnIndexes.size();
                text(header, errorColumn[0], "错误说明");
                sheet.setColumnWidth(errorColumn[0], 80 * 256);
            }, sourceRow -> {
                Row row = sheet.createRow(sourceRow.rowNo() - 1);
                headers.forEach((index, title) -> text(row, columnIndexes.get(index), sourceRow.cells().get(index)));
                List<ImportErrorRecord> errors = window.at(sourceRow.rowNo());
                if (!errors.isEmpty()) {
                    String messages = errors.stream().map(ImportErrorRecord::getErrorMessage).collect(Collectors.joining("；"));
                    text(row, errorColumn[0], truncateCell(messages)).setCellStyle(red);
                    errors.forEach(error -> headers.forEach((index, title) -> {
                        if (error.getColumnName() == null || headerName(error.getColumnName()).equals(headerName(title))) row.getCell(columnIndexes.get(index)).setCellStyle(red);
                    }));
                }
                return true;
            });
            sheet.createFreezePane(0, 1);
            workbook.write(output);
        } finally {
            workbook.close();
            workbook.dispose();
        }
    }

    private void textErrors(Path source, ImportDefinition<?> definition,
                            BiFunction<Integer, Integer, List<ImportErrorRecord>> query, OutputStream output) throws IOException {
        BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(output, StandardCharsets.UTF_8));
        writer.write("行号\t列名\t错误类型\t错误说明\n");
        ErrorWindow window = new ErrorWindow(query);
        scan(source, definition, ignored -> { }, row -> {
            try {
                for (ImportErrorRecord error : window.at(row.rowNo())) {
                    writer.write(error.getRowNo() + "\t" + plain(error.getColumnName()) + "\t" + error.getErrorType() + "\t" + plain(error.getErrorMessage()) + "\n");
                }
            } catch (IOException exception) {
                throw new ServiceException("错误清单写入失败");
            }
            return true;
        });
        writer.flush();
    }

    private static class ErrorWindow {
        private final BiFunction<Integer, Integer, List<ImportErrorRecord>> query;
        private Map<Integer, List<ImportErrorRecord>> rows = Map.of();
        private int lastRow;
        ErrorWindow(BiFunction<Integer, Integer, List<ImportErrorRecord>> query) { this.query = query; }
        List<ImportErrorRecord> at(int rowNo) {
            if (rowNo > lastRow) {
                lastRow = rowNo + BATCH_SIZE - 1;
                rows = query.apply(rowNo, lastRow).stream().collect(Collectors.groupingBy(ImportErrorRecord::getRowNo));
            }
            return rows.getOrDefault(rowNo, List.of());
        }
    }

    private CellStyle heading(SXSSFWorkbook workbook) {
        CellStyle style = workbook.createCellStyle();
        Font font = workbook.createFont();
        font.setBold(true);
        style.setFont(font);
        return style;
    }

    private static Cell text(Row row, int index, String value) {
        Cell cell = row.createCell(index);
        cell.setCellValue(value == null ? "" : truncateCell(value));
        return cell;
    }

    private static String truncateCell(String value) { return value.length() > 32767 ? value.substring(0, 32767) : value; }
    private static String plain(String value) { return value == null ? "" : value.replace('\t', ' ').replace('\r', ' ').replace('\n', ' '); }
    private static String headerName(String value) { return value == null ? "" : value.replace("\uFEFF", "").replace("*", "").trim(); }
    public static String extension(ExcelTypeEnum type) { return type == ExcelTypeEnum.XLSX ? ".xlsx" : type == ExcelTypeEnum.XLS ? ".xls" : ".csv"; }

    public static String safeName(String original, String extension) {
        String name = original == null ? "导入数据" : original.replaceAll("[\\p{Cntrl}\\\\/:*?\"<>|]", "_");
        int suffix = name.lastIndexOf('.');
        if (suffix > 0) name = name.substring(0, suffix);
        if (name.isBlank()) name = "导入数据";
        if (name.length() > 200) name = name.substring(0, 200);
        return name + extension;
    }
}
