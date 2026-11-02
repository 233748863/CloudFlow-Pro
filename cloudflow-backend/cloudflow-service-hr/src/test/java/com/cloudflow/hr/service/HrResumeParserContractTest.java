package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.hr.domain.dto.HrResumeParsedFieldsPayload;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.domain.entity.HrCandidate;
import com.cloudflow.hr.domain.entity.HrResumeParsedFields;
import com.cloudflow.hr.mapper.HrCandidateMapper;
import com.cloudflow.hr.mapper.HrResumeParsedFieldsMapper;
import com.cloudflow.hr.service.impl.HrResumeParserServiceImpl;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class HrResumeParserContractTest {
    private final HrResumeParsedFieldsMapper records = mock(HrResumeParsedFieldsMapper.class);
    private final HrCandidateMapper candidates = mock(HrCandidateMapper.class);
    private final ObjectMapper json = new ObjectMapper().registerModule(new JavaTimeModule())
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
    private final HrRecruitmentIdentityService identities = mock(HrRecruitmentIdentityService.class);
    private final HrResumeParserServiceImpl service = new HrResumeParserServiceImpl(records, candidates, json, identities);

    @BeforeEach
    void setUp() {
        UserContext.clear();
        TenantContext.clear();
        UserContext.setTenantId(100001L);
        UserContext.setUserId(91L);
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "resume-test"), HrCandidate.class);
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "resume-test"), HrResumeParsedFields.class);
    }

    @AfterEach
    void clearContext() {
        UserContext.clear();
        TenantContext.clear();
    }

    @Test
    void parseUsesCurrentTenantAndStoresSkillAndExperienceArrays() {
        when(candidates.lockCandidate(100001L, 12L)).thenReturn(new HrCandidate());
        when(records.selectPage(any(Page.class), any())).thenAnswer(call -> {
            assertCurrentTenant(call.getArgument(1));
            return new Page<HrResumeParsedFields>().setRecords(List.of());
        });
        when(records.insert(any(HrResumeParsedFields.class))).thenAnswer(call -> {
            call.<HrResumeParsedFields>getArgument(0).setId(77L);
            return 1;
        });

        assertEquals(77L, service.parseResume(12L, "/resume.pdf",
                "张三\n上海大学 本科\nJava Spring\n2020.01-2023.06 示例公司 开发工程师\n"));

        ArgumentCaptor<HrResumeParsedFields> inserted = ArgumentCaptor.forClass(HrResumeParsedFields.class);
        verify(records).insert(inserted.capture());
        HrResumeParsedFields row = inserted.getValue();
        assertEquals(100001L, row.getTenantId());
        assertEquals(12L, row.getCandidateId());
        assertTrue(row.getParsedSkills().isArray());
        assertTrue(row.getParsedSkills().toString().contains("Java"));
        assertTrue(row.getParsedExperiences().isArray());
        assertEquals(1, row.getParsedExperiences().size());
        assertTrue(row.getParsedExperiences().get(0).has("start"));
        assertTrue(row.getParsedExperiences().get(0).has("end"));
        assertTrue(row.getParsedExperiences().get(0).has("segment"));
    }

    @Test
    void unavailableOrOtherTenantCandidateCannotCreateParseRecord() {
        when(candidates.lockCandidate(100001L, 12L)).thenReturn(null);
        assertThrows(HrHException.class, () -> service.parseResume(12L, "/resume.pdf", "Java"));
        verify(identities).requireCandidate(12L);
        verify(candidates).lockCandidate(100001L, 12L);

        verifyNoInteractions(records);
    }

    @Test
    void editingRoundTripPreservesSchoolAndArraysAndIgnoresBodyTenant() throws Exception {
        HrResumeParsedFields row = record();
        when(candidates.lockCandidate(100001L, 12L)).thenReturn(new HrCandidate());
        when(records.selectOne(any())).thenAnswer(call -> {
            assertCurrentTenant(call.getArgument(0));
            return row;
        });
        HrResumeParsedFieldsPayload payload = json.readValue("""
                {"tenantId":100002,"parsedName":"张三","parsedPhone":"+8613900000000",
                 "parsedEmail":"hr@example.test","parsedEducation":"本科","parsedSchool":"上海大学",
                 "parsedSkills":["Java","Spring"],
                 "parsedExperiences":[{"start":"2020.01","end":"2023.06","segment":"软件开发"}]}
                """, HrResumeParsedFieldsPayload.class);

        when(records.update(any(HrResumeParsedFields.class), any())).thenReturn(1);
        service.updateParsed(77L, payload);

        verify(records).update(eq(row), any());
        assertEquals(100001L, row.getTenantId());
        assertEquals("+8613900000000", row.getParsedPhone());
        assertEquals("上海大学", row.getParsedSchool());
        assertEquals(payload.getParsedSkills(), row.getParsedSkills());
        assertEquals(payload.getParsedExperiences(), row.getParsedExperiences());
        when(records.selectList(any())).thenAnswer(call -> {
            assertCurrentTenant(call.getArgument(0));
            return List.of(row);
        });
        JsonNode response = json.valueToTree(service.listParsed(12L).get(0));
        assertEquals("PENDING", response.path("reviewStatus").asText());
        assertEquals("上海大学", response.path("parsedSchool").asText());
        assertEquals(payload.getParsedSkills(), response.get("parsedSkills"));
        assertEquals(payload.getParsedExperiences(), response.get("parsedExperiences"));
        assertFalse(response.has("status"));
        assertFalse(response.has("parsedWorkExperience"));
    }

    @Test
    void confirmationAndRejectionUseCurrentTenant() {
        HrResumeParsedFields row = record();
        when(candidates.lockCandidate(100001L, 12L)).thenReturn(new HrCandidate());
        when(records.selectOne(any())).thenAnswer(call -> {
            assertCurrentTenant(call.getArgument(0));
            return row;
        });
        service.confirmParsed(77L);
        assertEquals("CONFIRMED", row.getReviewStatus());
        service.rejectParsed(77L, "需要补充");
        assertEquals("REJECTED", row.getReviewStatus());
        assertEquals("需要补充", row.getParseError());
        verify(records, times(2)).updateById(row);
    }

    @Test
    void everyEntryRejectsMissingTenantBeforeReadingOrWriting() {
        UserContext.clear();
        TenantContext.clear();
        HrResumeParsedFieldsPayload payload = new HrResumeParsedFieldsPayload();
        payload.setTenantId(100002L);

        assertThrows(HrBusinessException.class, () -> service.parseResume(12L, null, "Java"));
        assertThrows(HrBusinessException.class, () -> service.listParsed(12L));
        assertThrows(HrBusinessException.class, () -> service.confirmParsed(77L));
        assertThrows(HrBusinessException.class, () -> service.rejectParsed(77L, "原因"));
        assertThrows(HrBusinessException.class, () -> service.updateParsed(77L, payload));

        verifyNoInteractions(records, candidates);
    }

    private HrResumeParsedFields record() {
        HrResumeParsedFields row = new HrResumeParsedFields();
        row.setId(77L);
        row.setTenantId(100001L);
        row.setCandidateId(12L);
        row.setReviewStatus("PENDING");
        row.setDeleted(0);
        return row;
    }

    private void assertCurrentTenant(LambdaQueryWrapper<?> query) {
        Matcher tenantParameter = Pattern.compile("tenant_id\\s*=\\s*#\\{ew.paramNameValuePairs\\.([^}]+)}")
                .matcher(query.getSqlSegment());
        assertTrue(tenantParameter.find(), query.getSqlSegment());
        assertEquals(100001L, query.getParamNameValuePairs().get(tenantParameter.group(1)));
    }
}
