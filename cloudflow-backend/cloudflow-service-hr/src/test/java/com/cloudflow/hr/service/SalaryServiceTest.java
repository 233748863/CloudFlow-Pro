package com.cloudflow.hr.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.hr.domain.dto.EmployeeSalaryAssignDTO;
import com.cloudflow.hr.domain.dto.EmployeeSalaryQueryDTO;
import com.cloudflow.hr.domain.dto.SalaryGradeSetDTO;
import com.cloudflow.hr.domain.dto.SalaryItemCreateDTO;
import com.cloudflow.hr.domain.dto.SalaryItemUpdateDTO;
import com.cloudflow.hr.domain.dto.SalaryStructureCreateDTO;
import com.cloudflow.hr.domain.entity.Employee;
import com.cloudflow.hr.domain.entity.EmployeeSalary;
import com.cloudflow.hr.domain.entity.JobLevel;
import com.cloudflow.hr.domain.entity.SalaryGrade;
import com.cloudflow.hr.domain.entity.SalaryItem;
import com.cloudflow.hr.domain.entity.SalaryStructure;
import com.cloudflow.hr.domain.entity.SalaryStructureItem;
import com.cloudflow.hr.domain.vo.EmployeeSalaryDetailVO;
import com.cloudflow.hr.domain.vo.EmployeeSalaryVO;
import com.cloudflow.hr.domain.vo.SalaryGradeVO;
import com.cloudflow.hr.domain.vo.SalaryItemVO;
import com.cloudflow.hr.domain.vo.SalaryStructureDetailVO;
import com.cloudflow.hr.mapper.EmployeeMapper;
import com.cloudflow.hr.mapper.EmployeeSalaryMapper;
import com.cloudflow.hr.mapper.JobLevelMapper;
import com.cloudflow.hr.mapper.SalaryGradeMapper;
import com.cloudflow.hr.mapper.SalaryItemMapper;
import com.cloudflow.hr.mapper.SalaryStructureItemMapper;
import com.cloudflow.hr.mapper.SalaryStructureMapper;
import com.cloudflow.hr.service.impl.EmployeeSalaryServiceImpl;
import com.cloudflow.hr.service.impl.SalaryGradeServiceImpl;
import com.cloudflow.hr.service.impl.SalaryItemServiceImpl;
import com.cloudflow.hr.service.impl.SalaryStructureServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 薪酬管理服务测试类
 * 使用 Mock Mapper 做回归验证，避免依赖真实数据库环境。
 */
@ExtendWith(MockitoExtension.class)
class SalaryServiceTest {

    @Mock
    private SalaryItemMapper salaryItemMapper;

    @Mock
    private SalaryStructureMapper salaryStructureMapper;

    @Mock
    private SalaryStructureItemMapper salaryStructureItemMapper;

    @Mock
    private SalaryGradeMapper salaryGradeMapper;

    @Mock
    private JobLevelMapper jobLevelMapper;

    @Mock
    private EmployeeSalaryMapper employeeSalaryMapper;

    @Mock
    private EmployeeMapper employeeMapper;

    private SalaryItemService salaryItemService;
    private SalaryStructureService salaryStructureService;
    private SalaryGradeService salaryGradeService;
    private EmployeeSalaryService employeeSalaryService;

    @BeforeEach
    void setUp() {
        UserContext.setUserId(1L);
        UserContext.setUserName("test-user");
        UserContext.setTenantId(1L);

        salaryItemService = new SalaryItemServiceImpl(salaryItemMapper);
        salaryStructureService = new SalaryStructureServiceImpl(
                salaryStructureMapper, salaryStructureItemMapper, salaryItemMapper);
        salaryGradeService = new SalaryGradeServiceImpl(salaryGradeMapper, jobLevelMapper);
        // 这里保留真实 ObjectMapper，顺带覆盖薪资 JSON 的序列化和反序列化路径。
        employeeSalaryService = new EmployeeSalaryServiceImpl(
                employeeSalaryMapper,
                employeeMapper,
                salaryStructureMapper,
                salaryItemMapper,
                salaryStructureItemMapper,
                new ObjectMapper()
        );
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    /**
     * 验证创建薪资项目并回读详情。
     */
    @Test
    void testCreateSalaryItem() {
        AtomicReference<SalaryItem> storedItem = new AtomicReference<>();
        when(salaryItemMapper.selectCount(any())).thenReturn(0L);
        when(salaryItemMapper.insert(any(SalaryItem.class))).thenAnswer(invocation -> {
            SalaryItem item = invocation.getArgument(0);
            item.setId(11L);
            storedItem.set(item);
            return 1;
        });
        when(salaryItemMapper.selectById(11L)).thenAnswer(invocation -> storedItem.get());

        SalaryItemCreateDTO dto = new SalaryItemCreateDTO();
        dto.setItemCode("TEST_BASIC");
        dto.setItemName("测试基本工资");
        dto.setItemType("FIXED");
        dto.setCategory("BASIC");
        dto.setIsTaxable(true);
        dto.setSortOrder(1);

        Long itemId = salaryItemService.createSalaryItem(dto);
        SalaryItemVO vo = salaryItemService.getSalaryItem(itemId);

        assertEquals(11L, itemId);
        assertNotNull(storedItem.get());
        assertEquals(1L, storedItem.get().getTenantId());
        assertEquals(1, storedItem.get().getStatus());
        assertEquals("测试基本工资", vo.getItemName());
        assertEquals("固定项", vo.getItemTypeDesc());
        assertEquals("基本工资", vo.getCategoryDesc());
    }

    /**
     * 验证更新薪资项目后，回读结果与预期一致。
     */
    @Test
    void testUpdateSalaryItem() {
        SalaryItem existingItem = buildSalaryItem(12L, "TEST_UPDATE", "原始名称");
        when(salaryItemMapper.selectById(12L)).thenReturn(existingItem);

        SalaryItemUpdateDTO dto = new SalaryItemUpdateDTO();
        dto.setItemName("更新后的名称");
        dto.setItemType("VARIABLE");
        dto.setCategory("BONUS");
        dto.setIsTaxable(false);
        dto.setStatus(0);

        salaryItemService.updateSalaryItem(12L, dto);
        SalaryItemVO vo = salaryItemService.getSalaryItem(12L);

        verify(salaryItemMapper, times(1)).updateById(existingItem);
        assertEquals("更新后的名称", existingItem.getItemName());
        assertEquals("VARIABLE", existingItem.getItemType());
        assertEquals("BONUS", existingItem.getCategory());
        assertFalse(existingItem.getIsTaxable());
        assertEquals(0, existingItem.getStatus());
        assertEquals("奖金", vo.getCategoryDesc());
    }

    /**
     * 验证查询薪资项目列表时会补齐展示描述。
     */
    @Test
    void testListSalaryItems() {
        when(salaryItemMapper.selectList(any())).thenReturn(Arrays.asList(
                buildSalaryItem(21L, "ITEM_A", "基本工资"),
                buildSalaryItem(22L, "ITEM_B", "绩效奖金"),
                buildSalaryItem(23L, "ITEM_C", "岗位津贴")
        ));

        List<SalaryItemVO> list = salaryItemService.listSalaryItems();

        assertEquals(3, list.size());
        assertEquals("固定项", list.get(0).getItemTypeDesc());
        assertEquals("基本工资", list.get(0).getCategoryDesc());
    }

    /**
     * 验证创建薪资结构后，能够正确关联薪资项目并回读明细。
     */
    @Test
    void testCreateSalaryStructure() {
        AtomicReference<SalaryStructure> storedStructure = new AtomicReference<>();
        when(salaryStructureMapper.selectCount(any())).thenReturn(0L);
        when(salaryStructureMapper.insert(any(SalaryStructure.class))).thenAnswer(invocation -> {
            SalaryStructure structure = invocation.getArgument(0);
            structure.setId(31L);
            storedStructure.set(structure);
            return 1;
        });
        when(salaryStructureMapper.selectById(31L)).thenAnswer(invocation -> storedStructure.get());
        when(salaryStructureItemMapper.selectList(any())).thenReturn(Arrays.asList(
                buildStructureItem(31L, 101L, 1),
                buildStructureItem(31L, 102L, 2)
        ));
        when(salaryItemMapper.selectBatchIds(any())).thenReturn(Arrays.asList(
                buildSalaryItem(101L, "TEST_ITEM1", "测试项目1"),
                buildSalaryItem(102L, "TEST_ITEM2", "测试项目2")
        ));

        SalaryStructureCreateDTO dto = new SalaryStructureCreateDTO();
        dto.setStructureCode("TEST_STRUCTURE");
        dto.setStructureName("测试薪资结构");
        dto.setDescription("这是一个测试薪资结构");
        dto.setItemIds(Arrays.asList(101L, 102L));

        Long structureId = salaryStructureService.createSalaryStructure(dto);
        SalaryStructureDetailVO vo = salaryStructureService.getSalaryStructure(structureId);

        ArgumentCaptor<SalaryStructureItem> itemCaptor = ArgumentCaptor.forClass(SalaryStructureItem.class);
        verify(salaryStructureItemMapper, times(2)).insert(itemCaptor.capture());

        List<SalaryStructureItem> linkedItems = itemCaptor.getAllValues();
        assertEquals(31L, structureId);
        assertEquals(2, linkedItems.size());
        assertEquals(1, linkedItems.get(0).getSortOrder());
        assertEquals(2, linkedItems.get(1).getSortOrder());
        assertEquals("TEST_STRUCTURE", vo.getStructureCode());
        assertEquals(2, vo.getItems().size());
        assertEquals("TEST_ITEM1", vo.getItems().get(0).getItemCode());
    }

    /**
     * 验证配置薪资等级时，能够创建并正确回读职级关联信息。
     */
    @Test
    void testSetSalaryGrade() {
        AtomicReference<SalaryGrade> storedGrade = new AtomicReference<>();
        JobLevel jobLevel = new JobLevel();
        jobLevel.setId(1L);
        jobLevel.setTenantId(1L);
        jobLevel.setLevelCode("P1");
        jobLevel.setLevelName("专业一级");

        when(jobLevelMapper.selectById(1L)).thenReturn(jobLevel);
        when(salaryGradeMapper.selectOne(any())).thenAnswer(invocation -> storedGrade.get());
        when(salaryGradeMapper.insert(any(SalaryGrade.class))).thenAnswer(invocation -> {
            SalaryGrade salaryGrade = invocation.getArgument(0);
            salaryGrade.setId(41L);
            storedGrade.set(salaryGrade);
            return 1;
        });

        SalaryGradeSetDTO dto = new SalaryGradeSetDTO();
        dto.setLevelId(1L);
        dto.setMinSalary(new BigDecimal("5000.00"));
        dto.setMaxSalary(new BigDecimal("10000.00"));
        dto.setMidSalary(new BigDecimal("7500.00"));
        dto.setCurrency("CNY");

        salaryGradeService.setSalaryGrade(dto);
        SalaryGradeVO vo = salaryGradeService.getSalaryGrade(1L);

        assertNotNull(storedGrade.get());
        assertEquals(1L, storedGrade.get().getTenantId());
        assertEquals(new BigDecimal("5000.00"), vo.getMinSalary());
        assertEquals(new BigDecimal("10000.00"), vo.getMaxSalary());
        assertEquals(new BigDecimal("7500.00"), vo.getMidSalary());
        assertEquals("P1", vo.getLevelCode());
        assertEquals("专业一级", vo.getLevelName());
        assertEquals("人民币", vo.getCurrencyDesc());
    }

    /**
     * 验证分配薪资结构时会过期旧记录，并能回读新薪资详情。
     */
    @Test
    void testAssignSalaryStructure() {
        AtomicReference<EmployeeSalary> storedSalary = new AtomicReference<>();
        Employee employee = buildEmployee(1L, 101L);
        SalaryStructure structure = buildSalaryStructure(51L, "TEST_ASSIGN_STRUCTURE", "测试分配薪资结构");
        EmployeeSalary oldSalary = buildEmployeeSalary(61L, 1L, 51L, new BigDecimal("9000.00"), "ACTIVE");

        when(employeeMapper.selectById(1L)).thenReturn(employee);
        when(salaryStructureMapper.selectById(51L)).thenReturn(structure);
        when(salaryStructureItemMapper.selectList(any())).thenReturn(Arrays.asList(
                buildStructureItem(51L, 101L, 1),
                buildStructureItem(51L, 102L, 2)
        ));
        when(employeeSalaryMapper.selectList(any())).thenReturn(List.of(oldSalary));
        when(employeeSalaryMapper.insert(any(EmployeeSalary.class))).thenAnswer(invocation -> {
            EmployeeSalary employeeSalary = invocation.getArgument(0);
            employeeSalary.setId(62L);
            storedSalary.set(employeeSalary);
            return 1;
        });
        when(employeeSalaryMapper.selectOne(any())).thenAnswer(invocation -> storedSalary.get());
        when(salaryItemMapper.selectById(101L)).thenReturn(buildSalaryItem(101L, "TEST_ASSIGN1", "基本工资"));
        when(salaryItemMapper.selectById(102L)).thenReturn(buildSalaryItem(102L, "TEST_ASSIGN2", "岗位津贴"));

        Map<Long, BigDecimal> salaryData = new LinkedHashMap<>();
        salaryData.put(101L, new BigDecimal("8000.00"));
        salaryData.put(102L, new BigDecimal("2000.00"));

        EmployeeSalaryAssignDTO assignDTO = new EmployeeSalaryAssignDTO();
        assignDTO.setEmployeeId(1L);
        assignDTO.setStructureId(51L);
        assignDTO.setSalaryData(salaryData);
        assignDTO.setEffectiveDate(LocalDate.of(2026, 3, 22));

        employeeSalaryService.assignSalaryStructure(assignDTO);
        EmployeeSalaryDetailVO vo = employeeSalaryService.getEmployeeSalary(1L);

        ArgumentCaptor<EmployeeSalary> expiredCaptor = ArgumentCaptor.forClass(EmployeeSalary.class);
        verify(employeeSalaryMapper, times(1)).updateById(expiredCaptor.capture());
        assertEquals("EXPIRED", expiredCaptor.getValue().getStatus());

        assertNotNull(storedSalary.get());
        assertEquals("ACTIVE", storedSalary.get().getStatus());
        assertEquals(new BigDecimal("10000.00"), storedSalary.get().getTotalSalary());
        assertEquals(1L, vo.getEmployeeId());
        assertEquals("测试员工", vo.getEmployeeName());
        assertEquals("测试分配薪资结构", vo.getStructureName());
        assertEquals(2, vo.getItems().size());
        assertEquals("生效中", vo.getStatusDesc());
    }

    /**
     * 验证按部门过滤员工薪资列表时，只返回命中的员工记录。
     */
    @Test
    void testListEmployeeSalaries() {
        Employee employee = buildEmployee(1L, 101L);
        SalaryStructure structure = buildSalaryStructure(71L, "LIST_STRUCTURE", "列表结构");

        EmployeeSalary salary1 = buildEmployeeSalary(81L, 1L, 71L, new BigDecimal("12000.00"), "ACTIVE");
        EmployeeSalary salary2 = buildEmployeeSalary(82L, 2L, 71L, new BigDecimal("15000.00"), "ACTIVE");

        when(employeeSalaryMapper.selectList(any())).thenReturn(Arrays.asList(salary1, salary2));
        when(employeeMapper.selectList(any())).thenReturn(List.of(employee));
        when(employeeMapper.selectById(1L)).thenReturn(employee);
        when(salaryStructureMapper.selectById(71L)).thenReturn(structure);

        EmployeeSalaryQueryDTO query = new EmployeeSalaryQueryDTO();
        query.setStatus("ACTIVE");
        query.setDeptId(101L);

        List<EmployeeSalaryVO> list = employeeSalaryService.listEmployeeSalaries(query);

        assertEquals(1, list.size());
        assertEquals(1L, list.get(0).getEmployeeId());
        assertEquals("EMP001", list.get(0).getEmployeeNo());
        assertEquals("列表结构", list.get(0).getStructureName());
        assertEquals("生效中", list.get(0).getStatusDesc());
    }

    private SalaryItem buildSalaryItem(Long id, String code, String name) {
        SalaryItem item = new SalaryItem();
        item.setId(id);
        item.setTenantId(1L);
        item.setItemCode(code);
        item.setItemName(name);
        item.setItemType("FIXED");
        item.setCategory("BASIC");
        item.setIsTaxable(true);
        item.setStatus(1);
        item.setSortOrder(1);
        return item;
    }

    private SalaryStructure buildSalaryStructure(Long id, String code, String name) {
        SalaryStructure structure = new SalaryStructure();
        structure.setId(id);
        structure.setTenantId(1L);
        structure.setStructureCode(code);
        structure.setStructureName(name);
        structure.setStatus(1);
        return structure;
    }

    private SalaryStructureItem buildStructureItem(Long structureId, Long itemId, Integer sortOrder) {
        SalaryStructureItem item = new SalaryStructureItem();
        item.setTenantId(1L);
        item.setStructureId(structureId);
        item.setItemId(itemId);
        item.setSortOrder(sortOrder);
        return item;
    }

    private Employee buildEmployee(Long employeeId, Long deptId) {
        Employee employee = new Employee();
        employee.setId(employeeId);
        employee.setTenantId(1L);
        employee.setDeptId(deptId);
        employee.setEmployeeNo("EMP001");
        employee.setName("测试员工");
        return employee;
    }

    private EmployeeSalary buildEmployeeSalary(Long id, Long employeeId, Long structureId,
                                               BigDecimal totalSalary, String status) {
        EmployeeSalary employeeSalary = new EmployeeSalary();
        employeeSalary.setId(id);
        employeeSalary.setTenantId(1L);
        employeeSalary.setEmployeeId(employeeId);
        employeeSalary.setStructureId(structureId);
        employeeSalary.setTotalSalary(totalSalary);
        employeeSalary.setStatus(status);
        employeeSalary.setEffectiveDate(LocalDate.of(2026, 3, 1));
        employeeSalary.setSalaryData("{\"101\":8000.00,\"102\":2000.00}");
        return employeeSalary;
    }
}
