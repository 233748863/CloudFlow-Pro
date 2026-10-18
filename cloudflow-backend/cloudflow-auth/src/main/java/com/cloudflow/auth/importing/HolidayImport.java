package com.cloudflow.auth.importing;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.dto.HolidayDateItemDTO;
import com.cloudflow.auth.mapper.HolidayImportMapper;
import com.cloudflow.auth.service.HolidayManagementService;
import com.cloudflow.common.excel.importing.ImportColumn;
import com.cloudflow.common.excel.importing.ImportContext;
import com.cloudflow.common.excel.importing.ImportDefinition;
import com.cloudflow.common.excel.importing.ImportError;
import com.cloudflow.common.excel.importing.ImportHandler;
import com.cloudflow.common.excel.importing.ImportKeys;
import com.cloudflow.common.excel.importing.ImportReference;
import com.cloudflow.common.holiday.domain.HolidayCalendar;
import com.cloudflow.common.holiday.mapper.HolidayCalendarMapper;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class HolidayImport implements ImportDefinition<HolidayImport.Row>, ImportHandler<HolidayImport.Row> {
    private final HolidayCalendarMapper calendars;
    private final HolidayImportMapper imports;
    private final HolidayManagementService service;

    @Data
    public static class Row {
        private Long calendarId;
        private LocalDate holidayDate;
        private String dateType;
        private String holidayName;
        private Integer triplePayFlag;
        private Integer yearNo;
        private String remark;
    }

    @Override public String bizType() { return "HOLIDAY"; }
    @Override public String bizName() { return "节假日日历"; }
    @Override public String permission() { return "system:holiday:import"; }
    @Override public Class<Row> rowClass() { return Row.class; }
    @Override public List<List<String>> uniqueKeys() { return List.of(List.of("calendarId", "holidayDate")); }

    @Override
    public List<ImportColumn> columns() {
        return List.of(
                ImportColumn.builder().field("calendarId").name("日历").type(ImportColumn.Type.REFERENCE).reference("CALENDAR").required(true).maxLength(100).example("CN_STANDARD").build(),
                ImportColumn.builder().field("holidayDate").name("日期").type(ImportColumn.Type.DATE).required(true).maxLength(10).example("2026-10-01").build(),
                ImportColumn.builder().field("dateType").name("日期类型").required(true).maxLength(20).options(Map.of("WORKDAY", "工作日", "HOLIDAY", "法定节假日", "REST", "休息日")).example("HOLIDAY").build(),
                ImportColumn.builder().field("holidayName").name("节假日名称").maxLength(50).example("国庆节").build(),
                ImportColumn.builder().field("triplePayFlag").name("是否三倍工资日").type(ImportColumn.Type.INTEGER).required(true).maxLength(1).options(Map.of("0", "否", "1", "是")).example("1").build(),
                ImportColumn.builder().field("yearNo").name("年份").type(ImportColumn.Type.INTEGER).minimum(BigDecimal.valueOf(1000)).maximum(BigDecimal.valueOf(9999)).example("2026").build(),
                ImportColumn.builder().field("remark").name("备注").maxLength(200).example("按正式日历填写").build());
    }

    @Override
    public void prepare(ImportContext context) {
        context.addReferences("CALENDAR", calendars.selectList(new LambdaQueryWrapper<HolidayCalendar>()
                .eq(HolidayCalendar::getTenantId, context.getTenantId()).eq(HolidayCalendar::getDeleted, 0)
                .eq(HolidayCalendar::getStatus, "ENABLED")).stream()
                .map(calendar -> new ImportReference(calendar.getCalendarCode(), calendar.getCalendarName(), calendar.getCalendarId())).toList());
    }

    @Override
    public Set<String> findExistingKeys(List<Row> rows, ImportContext context) {
        return imports.existing(context.getTenantId(), rows).stream()
                .map(row -> ImportKeys.forFields(uniqueKeys().get(0), row.getCalendarId(), row.getHolidayDate())).collect(Collectors.toSet());
    }

    @Override
    public List<ImportError> validateRow(Row row, int rowNo, ImportContext context) {
        if (row.getHolidayDate().getYear() < 1000 || row.getHolidayDate().getYear() > 9999
                || row.getYearNo() != null && row.getYearNo() != row.getHolidayDate().getYear()) {
            return List.of(new ImportError(rowNo, "年份", String.valueOf(row.getYearNo()), "BUSINESS", "年份必须与日期一致，日期年份范围为1000至9999"));
        }
        return List.of();
    }

    @Override
    public void importRow(Row row, int rowNo, ImportContext context) {
        HolidayDateItemDTO item = new HolidayDateItemDTO();
        BeanUtils.copyProperties(row, item);
        service.createImportedDate(row.getCalendarId(), item);
    }
}
