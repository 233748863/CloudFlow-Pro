package com.cloudflow.crm.service.impl;

import com.cloudflow.crm.exception.CrmBusinessException;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.redis.lock.DistributedLock;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmLead;
import com.cloudflow.crm.domain.CrmTerritory;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.mapper.CrmLeadMapper;
import com.cloudflow.crm.mapper.CrmTerritoryMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class CrmTerritoryService {
    private final CrmTerritoryMapper mapper;
    private final CrmCustomerMapper customers;
    private final CrmLeadMapper leads;
    private final CrmReferenceService references;

    public List<CrmTerritory> list(Long parentId) {
        LambdaQueryWrapper<CrmTerritory> query = new LambdaQueryWrapper<CrmTerritory>().eq(CrmTerritory::getDeleted, 0)
                .orderByAsc(CrmTerritory::getSortNo).orderByAsc(CrmTerritory::getTerritoryId);
        if (parentId != null) query.likeRight(CrmTerritory::getLevelPath,
                CrmRecordSupport.require(mapper.selectById(parentId), "区域不存在").getLevelPath());
        return mapper.selectList(query);
    }

    @Audit(name = "维护CRM销售区域", diff = true)
    @Transactional(rollbackFor = Exception.class)
    @DistributedLock(key = "'crm:territory:' + T(com.cloudflow.crm.service.impl.CrmRecordSupport).tenantId()")
    public CrmTerritory save(CrmTerritory node) {
        List<CrmTerritory> tree = mapper.lockTree();
        CrmTerritory original = node.getTerritoryId() == null ? null : tree.stream()
                .filter(item -> item.getTerritoryId().equals(node.getTerritoryId())).findFirst().orElseThrow(() -> new CrmBusinessException("区域不存在"));
        node.setTerritoryCode(CrmRecordSupport.text(node.getTerritoryCode(), 50, "区域编码"));
        node.setTerritoryName(CrmRecordSupport.text(node.getTerritoryName(), 120, "区域名称"));
        node.setStatus(CrmRecordSupport.code(node.getStatus(), "ACTIVE", Set.of("ACTIVE", "INACTIVE"), "区域状态"));
        if (node.getOwnerId() != null) references.user(node.getOwnerId());
        if (node.getParentId() == null) node.setParentId(0L);
        CrmTerritory parent = node.getParentId() == 0L ? null : tree.stream().filter(item -> item.getTerritoryId().equals(node.getParentId()))
                .findFirst().orElseThrow(() -> new CrmBusinessException("父区域不存在"));
        if (parent != null && !"ACTIVE".equals(parent.getStatus())) throw new CrmBusinessException("父区域已停用");
        if (original != null && parent != null && parent.getLevelPath().startsWith(original.getLevelPath())) throw new CrmBusinessException("区域不能移到自身或子区域下");
        if (tree.stream().anyMatch(item -> item.getTerritoryCode().equals(node.getTerritoryCode()) && !Objects.equals(item.getTerritoryId(), node.getTerritoryId()))) {
            throw new CrmBusinessException("区域编码已存在");
        }
        if (node.getSortNo() == null) node.setSortNo(0);
        if (original == null) { CrmRecordSupport.create(node, "territoryId"); node.setLevelPath("/"); mapper.insert(node); }
        else CrmRecordSupport.update(node, original);
        String path = (parent == null ? "/" : parent.getLevelPath()) + node.getTerritoryId() + "/";
        checkPath(path);
        if (original != null) {
            List<CrmTerritory> descendants = tree.stream().filter(item -> !item.getTerritoryId().equals(original.getTerritoryId())
                    && item.getLevelPath().startsWith(original.getLevelPath())).toList();
            for (CrmTerritory child : descendants) checkPath(path + child.getLevelPath().substring(original.getLevelPath().length()));
            for (CrmTerritory child : descendants) {
                child.setLevelPath(path + child.getLevelPath().substring(original.getLevelPath().length()));
                CrmRecordSupport.touch(child); CrmRecordSupport.saved(mapper.updateById(child));
            }
        }
        node.setLevelPath(path); CrmRecordSupport.saved(mapper.updateById(node));
        return node;
    }

    @Audit(name = "删除CRM销售区域", highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    @DistributedLock(key = "'crm:territory:' + T(com.cloudflow.crm.service.impl.CrmRecordSupport).tenantId()")
    public void delete(Long id) {
        List<CrmTerritory> tree = mapper.lockTree();
        CrmRecordSupport.require(tree.stream().filter(item -> item.getTerritoryId().equals(id)).findFirst().orElse(null), "区域不存在");
        if (tree.stream().anyMatch(item -> item.getParentId().equals(id))) throw new CrmBusinessException("请先移动或删除子区域");
        if (leads.selectCount(new LambdaQueryWrapper<CrmLead>().eq(CrmLead::getTerritoryId, id).eq(CrmLead::getDeleted, 0)) > 0
                || customers.selectCount(new LambdaQueryWrapper<CrmCustomer>().eq(CrmCustomer::getTerritoryId, id).eq(CrmCustomer::getDeleted, 0)) > 0) {
            throw new CrmBusinessException("区域已被线索或客户使用，请停用");
        }
        CrmRecordSupport.saved(mapper.deleteById(id));
    }

    public static void checkPath(String path) {
        if (path.length() > 500 || path.chars().filter(character -> character == '/').count() - 1 > 5) throw new CrmBusinessException("区域最多5层且路径不能超过500字符");
    }
}
