package com.cloudflow.hr.importing;

import com.cloudflow.common.excel.importing.ImportColumn;
import com.cloudflow.common.excel.importing.ImportContext;
import com.cloudflow.common.excel.importing.ImportDefinition;
import com.cloudflow.common.excel.importing.ImportError;
import com.cloudflow.common.excel.importing.ImportHandler;
import com.cloudflow.common.excel.importing.ImportKeys;
import com.cloudflow.hr.domain.dto.HrEmployeePayload;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.mapper.HrImportMapper;
import com.cloudflow.hr.service.HrTypedCrudService;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class EmployeeImport implements ImportDefinition<HrEmployeePayload>, ImportHandler<HrEmployeePayload> {
    private final HrImportMapper imports;
    private final HrTypedCrudService service;

    @Override public String bizType() { return "EMPLOYEE"; }
    @Override public String bizName() { return "员工"; }
    @Override public String permission() { return "hr:employees:import"; }
    @Override public Class<HrEmployeePayload> rowClass() { return HrEmployeePayload.class; }
    @Override public List<List<String>> uniqueKeys() { return List.of(List.of("employeeNo")); }

    @Override
    public List<ImportColumn> columns() {
        return List.of(
                ImportColumn.builder().field("employeeNo").name("工号").required(true).maxLength(50).example("EMP2026001").build(),
                ImportColumn.builder().field("name").name("姓名").required(true).maxLength(100).example("张三").build(),
                ImportColumn.builder().field("gender").name("性别").required(true).maxLength(20).options(Map.of("MALE", "男", "FEMALE", "女")).example("男").build(),
                date("birthDate", "出生日期", "1995-01-01"),
                ImportColumn.builder().field("phone").name("手机号").type(ImportColumn.Type.PHONE).maxLength(30).example("13800138000").build(),
                ImportColumn.builder().field("email").name("邮箱").type(ImportColumn.Type.EMAIL).maxLength(120).example("employee@example.com").build(),
                reference("deptId", "部门", "DEPT", "研发部"),
                reference("postId", "岗位", "POST", "DEV"),
                reference("positionId", "职位", "POSITION", "研发工程师"),
                reference("employeeType", "员工类型", "employee_type", "FULL_TIME"),
                reference("employeeStatus", "员工状态", "employee_status", "PROBATION"),
                date("hireDate", "入职日期", "2026-09-01"),
                date("regularDate", "转正日期", "2026-12-01"),
                date("resignDate", "离职日期", ""));
    }

    private ImportColumn reference(String field, String name, String type, String example) {
        return ImportColumn.builder().field(field).name(name).type(ImportColumn.Type.REFERENCE).reference(type).maxLength(100).example(example).build();
    }

    private ImportColumn date(String field, String name, String example) {
        return ImportColumn.builder().field(field).name(name).type(ImportColumn.Type.DATE).maxLength(10).example(example).build();
    }

    @Override
    public void prepare(ImportContext context) {
        context.addReferences("DEPT", imports.departments(context.getTenantId()));
        context.addReferences("POST", imports.posts(context.getTenantId()));
        context.addReferences("POSITION", imports.positions(context.getTenantId()));
        context.addReferences("employee_type", imports.dictionary(context.getTenantId(), "employee_type"));
        context.addReferences("employee_status", imports.dictionary(context.getTenantId(), "employee_status"));
    }

    @Override
    public Set<String> findExistingKeys(List<HrEmployeePayload> rows, ImportContext context) {
        return imports.existingEmployees(context.getTenantId(), rows.stream().map(HrEmployeePayload::getEmployeeNo).toList())
                .stream().map(code -> ImportKeys.forFields(uniqueKeys().get(0), code)).collect(Collectors.toSet());
    }

    @Override
    public List<ImportError> validateRow(HrEmployeePayload row, int rowNo, ImportContext context) {
        if (row.getEmployeeType() == null) row.setEmployeeType("FULL_TIME");
        if (row.getEmployeeStatus() == null) row.setEmployeeStatus("PROBATION");
        List<ImportError> errors = new ArrayList<>();
        if (!"PENDING".equals(row.getEmployeeStatus()) && row.getHireDate() == null) errors.add(new ImportError(rowNo, "入职日期", null, "BUSINESS", "非待入职员工必须填写入职日期"));
        if (row.getBirthDate() != null && (row.getBirthDate().isAfter(LocalDate.now())
                || row.getHireDate() != null && row.getBirthDate().isAfter(row.getHireDate()))) {
            errors.add(new ImportError(rowNo, "出生日期", String.valueOf(row.getBirthDate()), "BUSINESS", "出生日期不能晚于今天或入职日期"));
        }
        if (row.getRegularDate() != null && row.getHireDate() != null && row.getRegularDate().isBefore(row.getHireDate())) errors.add(new ImportError(rowNo, "转正日期", String.valueOf(row.getRegularDate()), "BUSINESS", "转正日期不能早于入职日期"));
        if (row.getResignDate() != null && row.getHireDate() != null && row.getResignDate().isBefore(row.getHireDate())) errors.add(new ImportError(rowNo, "离职日期", String.valueOf(row.getResignDate()), "BUSINESS", "离职日期不能早于入职日期"));
        return errors;
    }

    @Override
    public void importRow(HrEmployeePayload row, int rowNo, ImportContext context) {
        service.create(HrEmployee.class, row);
    }
}
