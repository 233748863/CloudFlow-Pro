package com.cloudflow.crm.service.impl;

import com.cloudflow.crm.exception.CrmBusinessException;

import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.crm.domain.*;
import com.cloudflow.crm.domain.dto.CrmAudienceCondition;
import com.cloudflow.crm.domain.dto.CrmTargetListRequest;
import com.cloudflow.crm.mapper.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class CrmTargetListService {
    private final CrmTargetListMapper mapper;
    private final CrmTargetListMemberMapper members;
    private final CrmCampaignTargetListMapper relations;
    private final CrmAudienceService audience;
    private final CrmReferenceService references;
    private final ObjectMapper json;
    private final CrmAuditTrail audit;

    public List<CrmTargetList> list() { return mapper.selectAllByDataScope(DataScopeUtils.listScope("scope_dept_id", "owner_id")); }
    public CrmTargetList accessible(Long id) { return CrmRecordSupport.require(mapper.selectAccessible(id, DataScopeUtils.listScope("scope_dept_id", "owner_id")), "名单不存在或无权访问"); }

    public Map<String, Object> detail(Long id) {
        CrmTargetList list = accessible(id);
        List<CrmTargetListMember> current = currentMembers(list, audience.candidates());
        return Map.of("list", list, "members", current.stream().map(CrmAudienceService::masked).toList(), "visibleMemberCount", current.size());
    }

    @Audit(name = "维护CRM营销名单", diff = true)
    @Transactional(rollbackFor = Exception.class)
    public CrmTargetList save(CrmTargetListRequest request) {
        CrmTargetList list = CrmRecordSupport.require(request.getList(), "目标名单不能为空");
        CrmTargetList previous = null;
        if (list.getListId() != null) { accessible(list.getListId()); previous = mapper.lockById(list.getListId()); assertWritable(previous); CrmRecordSupport.update(list, previous); }
        else CrmRecordSupport.create(list, "listId");
        list.setListCode(list.getListCode() == null || list.getListCode().isBlank() ? Localize.nextNo("MD") : CrmRecordSupport.text(list.getListCode(), 50, "名单编码"));
        list.setListName(CrmRecordSupport.text(list.getListName(), 120, "名单名称"));
        list.setSourceType(CrmRecordSupport.code(list.getSourceType(), "MANUAL", Set.of("MANUAL", "QUERY"), "名单来源"));
        list.setStatus(CrmRecordSupport.code(list.getStatus(), "ACTIVE", Set.of("ACTIVE", "INACTIVE"), "名单状态"));
        Long ownerId = list.getOwnerId() == null ? previous == null ? UserContext.getUserId() : previous.getOwnerId() : list.getOwnerId();
        if (!Objects.equals(ownerId, previous == null ? UserContext.getUserId() : previous.getOwnerId()) && !StpUtil.hasPermission("crm:target-list:assign")) throw new CrmBusinessException("无权调整名单负责人");
        if (!Objects.equals(ownerId, UserContext.getUserId())) references.user(ownerId);
        list.setOwnerId(CrmRecordSupport.require(ownerId, "负责人不能为空"));
        List<CrmAudienceService.Candidate> candidates = audience.candidates();
        List<CrmTargetListMember> current;
        if ("QUERY".equals(list.getSourceType())) {
            CrmAudienceCondition condition = request.getCondition() == null ? condition(list.getQueryCondition()) : request.getCondition();
            current = audience.query(condition, candidates);
            try { list.setQueryCondition(json.writeValueAsString(condition)); } catch (Exception exception) { throw new CrmBusinessException("名单条件保存失败", exception); }
        } else {
            list.setQueryCondition(null);
            List<CrmTargetListMember> requested = request.getMembers() == null ? previous == null ? List.of()
                    : members.selectList(new LambdaQueryWrapper<CrmTargetListMember>().eq(CrmTargetListMember::getListId, list.getListId()).eq(CrmTargetListMember::getDeleted, 0)) : request.getMembers();
            if (requested.size() > 10000) throw new CrmBusinessException("单个手工名单最多10000名成员");
            Map<String, CrmTargetListMember> index = audience.index(candidates);
            current = requested.stream().map(member -> CrmRecordSupport.require(index.get(CrmAudienceService.key(member)), "名单成员不存在或无权访问"))
                    .collect(java.util.stream.Collectors.toMap(CrmAudienceService::key, member -> member, (first, second) -> first, java.util.LinkedHashMap::new)).values().stream().toList();
        }
        list.setMemberCount(current.size()); list.setOptedOutCount((int) current.stream().filter(member -> Integer.valueOf(1).equals(member.getOptedOutFlag())).count());
        if (previous == null) mapper.insert(list); else CrmRecordSupport.saved(mapper.updateById(list));
        persistMembers(list.getListId(), current);
        return list;
    }

    public List<CrmTargetListMember> currentMembers(CrmTargetList list, List<CrmAudienceService.Candidate> candidates) {
        if ("QUERY".equals(list.getSourceType())) return audience.query(condition(list.getQueryCondition()), candidates);
        Map<String, CrmTargetListMember> index = audience.index(candidates);
        return members.selectList(new LambdaQueryWrapper<CrmTargetListMember>().eq(CrmTargetListMember::getListId, list.getListId()).eq(CrmTargetListMember::getDeleted, 0))
                .stream().map(member -> index.get(CrmAudienceService.key(member))).filter(Objects::nonNull).toList();
    }

    @Audit(name = "刷新CRM营销名单")
    @Transactional(rollbackFor = Exception.class)
    public CrmTargetList refresh(Long id) {
        accessible(id); CrmTargetList list = mapper.lockById(id); assertWritable(list);
        List<CrmTargetListMember> current = currentMembers(list, audience.candidates());
        if ("QUERY".equals(list.getSourceType())) persistMembers(id, current);
        list.setMemberCount(current.size()); list.setOptedOutCount((int) current.stream().filter(member -> Integer.valueOf(1).equals(member.getOptedOutFlag())).count());
        CrmRecordSupport.touch(list); CrmRecordSupport.saved(mapper.updateById(list)); return list;
    }

    @Audit(name = "删除CRM营销名单", highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public void delete(Long id) {
        accessible(id); assertWritable(mapper.lockById(id));
        if (relations.selectCount(new LambdaQueryWrapper<CrmCampaignTargetList>().eq(CrmCampaignTargetList::getListId, id).eq(CrmCampaignTargetList::getDeleted, 0)) > 0) throw new CrmBusinessException("名单已被营销活动使用，请停用或先取消关联");
        members.deactivateChildren(id); CrmRecordSupport.saved(mapper.deleteById(id));
    }

    @Audit(name = "导出CRM营销名单", highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public byte[] export(Long id) {
        List<CrmTargetListMember> current = currentMembers(accessible(id), audience.candidates());
        StringBuilder csv = new StringBuilder("\uFEFF类型,对象ID,名称,邮箱,电话,退订\r\n");
        for (CrmTargetListMember member : current.stream().map(CrmAudienceService::masked).toList()) csv.append(csvCell(member.getMemberType())).append(',').append(member.getMemberRefId()).append(',')
                .append(csvCell(member.getMemberName())).append(',').append(csvCell(member.getEmail())).append(',').append(csvCell(member.getPhone())).append(',')
                .append(member.getOptedOutFlag()).append("\r\n");
        byte[] exported = csv.toString().getBytes(StandardCharsets.UTF_8);
        audit.record("导出CRM营销名单", "CRM_TARGET_LIST:" + id, "导出条数=" + current.size() + ";联系方式已脱敏", true);
        return exported;
    }

    public static String csvCell(String input) {
        String value = input == null ? "" : input;
        String stripped = value.stripLeading();
        if (!stripped.isEmpty() && "=+-@".indexOf(stripped.charAt(0)) >= 0 || value.startsWith("\t") || value.startsWith("\r")) value = "'" + value;
        return "\"" + value.replace("\"", "\"\"") + "\"";
    }

    private void persistMembers(Long listId, List<CrmTargetListMember> current) {
        members.deactivateChildren(listId);
        for (CrmTargetListMember member : current) {
            CrmRecordSupport.create(member, "memberId"); member.setListId(listId); member.setAddTime(LocalDateTime.now()); members.upsert(member);
        }
    }

    private void assertWritable(CrmTargetList list) {
        CrmRecordSupport.require(list, "名单不存在");
        if (!Objects.equals(list.getOwnerId(), UserContext.getUserId()) && !StpUtil.hasPermission("crm:target-list:assign")) throw new CrmBusinessException("只有名单负责人或管理员可修改");
    }

    private CrmAudienceCondition condition(String source) {
        if (source == null || source.isBlank()) throw new CrmBusinessException("条件名单必须设置筛选条件");
        try {
            JsonNode node = json.readTree(source);
            if (!node.isObject()) throw new CrmBusinessException("条件必须为对象");
            Set<String> allowed = Set.of("memberType", "industry", "territoryId", "marketSegment", "levelCode", "scoreMin", "scoreMax");
            node.fieldNames().forEachRemaining(field -> { if (!allowed.contains(field)) throw new CrmBusinessException("不支持的名单筛选字段：" + field); });
            CrmAudienceCondition result = json.treeToValue(node, CrmAudienceCondition.class); CrmAudienceService.validate(result); return result;
        } catch (IllegalArgumentException exception) { throw exception; }
        catch (Exception exception) { throw new CrmBusinessException("名单条件格式无效", exception); }
    }
}
