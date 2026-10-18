package com.cloudflow.oa.service.impl;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.message.constant.MessageCategory;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.oa.domain.OaRiskAlert;
import com.cloudflow.oa.domain.OaTraceEvent;
import com.cloudflow.oa.domain.SysConsumable;
import com.cloudflow.oa.domain.dto.ConsumableCommands;
import com.cloudflow.oa.domain.vo.ConsumableResults;
import com.cloudflow.oa.domain.vo.OaIdentityReference;
import com.cloudflow.oa.mapper.OaConsumableMaintenanceMapper;
import com.cloudflow.oa.mapper.OaIdentityReferenceMapper;
import com.cloudflow.oa.mapper.OaRiskAlertMapper;
import com.cloudflow.oa.mapper.SysConsumableMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Consumer;

@Service
@RequiredArgsConstructor
public class ConsumableMaintenanceService {
    private final ConsumableLedgerService ledger;
    private final ConsumableLedgerVerifier verifier;
    private final ConsumableTransactions transactions;
    private final ConsumableOperationSupport operations;
    private final OaConsumableMaintenanceMapper maintenance;
    private final SysConsumableMapper materials;
    private final OaRiskAlertMapper risks;
    private final OaIdentityReferenceMapper identities;
    private final SysConfigHelper config;
    private final MessageSender messages;
    private final ObjectMapper json;

    @Audit(name = "耗材库存核对及重算", highRisk = true)
    public ConsumableResults.Recalculation recalculate(Long id, ConsumableCommands.Recalculate command) {
        ConsumableOperationSupport.operation(command);
        OaRecordSupport.code(command.getMode(), null, Set.of("CHECK", "REBUILD"));
        ledger.material(id);
        String hash = operations.hash("RECALCULATE", id, command);
        return transactions.execute(() -> {
            SysConsumable material = ledger.lockAll(List.of(id)).get(id);
            OaTraceEvent previous = maintenance.recalculationTrace(OaRecordSupport.tenantId(), id, command.getOperationKey());
            if (previous != null) {
                try { ConsumableOperationSupport.sameHash(json.readTree(previous.getSnapshotJson()).path("hash").asText(), hash); }
                catch (IllegalArgumentException exception) { throw exception; }
                catch (Exception exception) { throw new IllegalStateException("库存重算请求记录无效", exception); }
            } else ConsumableOperationSupport.version(command.getVersion(), material.getVersion());
            ConsumableLedgerVerifier.Proof proof = verifier.verify(material);
            ConsumableResults.Recalculation result = result(material, proof);
            if ("CHECK".equals(command.getMode())) {
                result.setReason(result.isConsistent() ? "台账、来源及库存一致" : "库存缓存与有效台账有差异，未修改库存");
                return result;
            }
            if (previous != null) {
                result.setChanged(false);
                result.setReason("原重算请求已执行，本次未再次修改库存");
                result.setAfter(balance(material));
                return result;
            }
            if (!result.isConsistent()) {
                rebuild(material, proof);
                result.setChanged(true);
                operations.trace("CONSUMABLE", id, "CONSUMABLE_REBUILT", command.getRemark(), Map.of("version", material.getVersion()));
            }
            operations.trace("CONSUMABLE", id, "CONSUMABLE_RECALCULATE_REQUEST", command.getOperationKey(),
                    Map.of("hash", hash, "version", material.getVersion(), "changed", result.isChanged()));
            result.setAfter(balance(material));
            result.setReason(result.isChanged() ? "已按有效台账恢复库存缓存，未更改历史记录" : "库存已一致，无需重建");
            return result;
        });
    }

    public void scanWarnings() {
        String configured = config.getTenantValue("sys.oa.consumable.stockManagerUserId");
        if (configured == null || !configured.matches("[1-9][0-9]*")) throw new IllegalStateException("未配置本租户耗材仓管接收人");
        Long receiverId = Long.valueOf(configured);
        OaIdentityReference receiver = OaRecordSupport.active(identities.user(receiverId, OaRecordSupport.tenantId()));
        if (maintenance.permissionCount(OaRecordSupport.tenantId(), receiverId, "oa:consumable-ledger:list") < 1) {
            throw new IllegalStateException("耗材预警接收人缺少耗材台账读取权限");
        }
        eachMaterial(id -> transactions.execute(() -> {
            SysConsumable material = ledger.lockAll(List.of(id)).get(id);
            List<OaRiskAlert> open = maintenance.risks(material.getTenantId(), id);
            if (material.getQuantity() > material.getLowStockThreshold()) {
                materials.closeRecoveredRisks(material.getTenantId(), id);
                return null;
            }
            if (!Integer.valueOf(1).equals(material.getWarnEnabled()) || "INACTIVE".equals(material.getStatus()) && material.getQuantity() == 0) return null;
            if (!open.isEmpty()) return null;
            OaRecordSupport.active(identities.user(receiverId, OaRecordSupport.tenantId()));
            OaRiskAlert risk = new OaRiskAlert();
            risk.setTenantId(material.getTenantId());
            risk.setBusinessType("CONSUMABLE");
            risk.setBusinessId(id);
            risk.setRiskCode("CONSUMABLE_LOW_STOCK");
            risk.setRiskName("耗材低库存：" + material.getName().substring(0, Math.min(80, material.getName().length())));
            risk.setRiskLevel("MEDIUM");
            risk.setRiskStatus("OPEN");
            risk.setRiskSource("RULE");
            risk.setOwnerId(receiverId);
            risk.setOwnerName(receiver.getName());
            risk.setDetectedTime(LocalDateTime.now());
            risk.setCreateBy("system");
            risk.setCreateTime(LocalDateTime.now());
            risk.setUpdateBy("system");
            risk.setUpdateTime(LocalDateTime.now());
            OaRecordSupport.saved(risks.insert(risk));
            String link = "/admin/consumable-ledger?consumableId=" + id;
            Map<String, Object> params = new LinkedHashMap<>();
            params.put("name", material.getName());
            params.put("model", material.getModel() == null ? "" : material.getModel());
            params.put("unit", material.getUnit());
            params.put("quantity", material.getQuantity());
            params.put("threshold", material.getLowStockThreshold());
            params.put("linkUrl", link);
            messages.send(MessageSendRequest.builder().templateCode("OA_CONSUMABLE_LOW_STOCK")
                    .channelTypes(List.of(MessageChannelType.INTERNAL)).category(MessageCategory.BIZ_REMINDER)
                    .receivers(List.of(MessageReceiver.ofUser(receiverId))).params(params).bizType("CONSUMABLE")
                    .bizId(id.toString()).linkUrl(link)
                    .deduplicationKey("consumable-low-stock:" + material.getTenantId() + ":" + risk.getId() + ":" + receiverId).build());
            operations.trace("CONSUMABLE", id, "CONSUMABLE_LOW_STOCK", "已生成低库存风险及站内通知", Map.of("riskId", risk.getId().toString()));
            return null;
        }));
    }

    @Audit(name = "定时核对耗材台账", highRisk = true)
    public void scanRecalculation() {
        String mode = OaRecordSupport.code(config.getTenantValue("sys.oa.consumable.recalculateMode"), null, Set.of("CHECK", "REBUILD"));
        eachMaterial(id -> transactions.execute(() -> {
            SysConsumable material = ledger.lockAll(List.of(id)).get(id);
            ConsumableLedgerVerifier.Proof proof = verifier.verify(material);
            if (!consistent(material, proof)) {
                if ("CHECK".equals(mode)) throw new IllegalStateException("耗材" + id + "的库存缓存与台账不一致，CHECK模式未修改库存");
                rebuild(material, proof);
                operations.trace("CONSUMABLE", id, "CONSUMABLE_REBUILT", "按已授权任务配置重建库存缓存", Map.of("version", material.getVersion()));
            }
            return null;
        }));
    }

    private void eachMaterial(Consumer<Long> action) {
        long afterId = 0;
        List<RuntimeException> failures = new ArrayList<>();
        while (true) {
            List<Long> ids = materials.batchIds(OaRecordSupport.tenantId(), afterId);
            if (ids.isEmpty()) break;
            for (Long id : ids) {
                try { action.accept(id); }
                catch (RuntimeException exception) { failures.add(new IllegalStateException("耗材" + id + "处理失败", exception)); }
            }
            afterId = ids.get(ids.size() - 1);
        }
        if (!failures.isEmpty()) {
            IllegalStateException error = new IllegalStateException("本租户耗材检查失败数：" + failures.size());
            failures.forEach(error::addSuppressed);
            throw error;
        }
    }

    private void rebuild(SysConsumable material, ConsumableLedgerVerifier.Proof proof) {
        material.setQuantity(proof.quantity());
        material.setStockAmount(proof.amount());
        material.setAvgCost(proof.average());
        material.setLastPurchasePrice(proof.lastPurchasePrice());
        material.setLastCalcTime(LocalDateTime.now());
        ledger.persistBalance(material);
    }

    private boolean consistent(SysConsumable material, ConsumableLedgerVerifier.Proof proof) {
        return Objects.equals(material.getQuantity(), proof.quantity()) && equalMoney(material.getStockAmount(), proof.amount())
                && equalMoney(material.getAvgCost(), proof.average()) && equalMoney(material.getLastPurchasePrice(), proof.lastPurchasePrice());
    }

    private boolean equalMoney(BigDecimal first, BigDecimal second) {
        return first == null ? second == null : second != null && first.compareTo(second) == 0;
    }

    private ConsumableResults.Recalculation result(SysConsumable material, ConsumableLedgerVerifier.Proof proof) {
        ConsumableResults.Recalculation result = new ConsumableResults.Recalculation();
        result.setConsistent(consistent(material, proof));
        result.setBefore(balance(material));
        SysConsumable expected = new SysConsumable();
        expected.setQuantity(proof.quantity());
        expected.setStockAmount(proof.amount());
        expected.setAvgCost(proof.average());
        expected.setLastPurchasePrice(proof.lastPurchasePrice());
        expected.setVersion(material.getVersion());
        result.setExpected(balance(expected));
        result.setChanged(false);
        return result;
    }

    private ConsumableResults.Balance balance(SysConsumable material) {
        ConsumableResults.Balance result = new ConsumableResults.Balance();
        result.setQuantity(material.getQuantity());
        result.setVersion(material.getVersion());
        if (ConsumableReadService.costAllowed()) {
            result.setStockAmount(material.getStockAmount().toPlainString());
            result.setAvgCost(material.getAvgCost().toPlainString());
            result.setLastPurchasePrice(material.getLastPurchasePrice() == null ? null : material.getLastPurchasePrice().toPlainString());
        }
        return result;
    }
}
