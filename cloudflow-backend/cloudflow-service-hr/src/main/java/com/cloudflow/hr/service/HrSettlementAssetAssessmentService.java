package com.cloudflow.hr.service;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.OaAssetDispositionClient;
import com.cloudflow.hr.client.vo.HrEmployeeAssetDisposition;
import com.cloudflow.hr.client.vo.HrEmployeeAssetRecovery;
import com.cloudflow.hr.domain.dto.HrSettlementRequests;
import com.cloudflow.hr.domain.entity.HrFinalSettlement;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import static com.cloudflow.hr.service.HrHException.conflict;
import static com.cloudflow.hr.service.HrHException.invalid;

@Service
@RequiredArgsConstructor
public class HrSettlementAssetAssessmentService {
    private final OaAssetDispositionClient client;
    private final HrHSupport access;
    private final ObjectMapper json;

    public ObjectNode inspect(Long employeeId, Long assetId, String permission) {
        access.operator(employeeId, permission);
        Long userId = access.employee(employeeId).getUserId();
        R<HrEmployeeAssetDisposition> response;
        try { response = client.inspect(employeeId, assetId); }
        catch (RuntimeException failure) { throw unverified(); }
        HrEmployeeAssetDisposition source = response == null || !response.isSuccess() ? null : response.getData();
        if (source == null || userId == null || !Objects.equals(source.employeeId(), employeeId) || !Objects.equals(source.userId(), userId)) throw unverified();
        HrEmployeeAssetRecovery.Asset asset = source.asset();
        if (asset == null || !Objects.equals(asset.assetId(), assetId) || asset.version() == null || asset.version() < 0) throw unverified();
        boolean released = !Objects.equals(asset.custodianUserId(), userId) && !Objects.equals(asset.borrowerUserId(), userId);
        boolean consistent = asset.custodianUserId() == null || asset.borrowerUserId() == null || Objects.equals(asset.custodianUserId(), asset.borrowerUserId());
        if (released != source.responsibilityReleased() || consistent != asset.ownershipConsistent()) throw unverified();
        HrEmployeeAssetDisposition.Movement movement = source.movement();
        if (movement != null && (movement.movementId() == null || movement.movementId() <= 0 || movement.version() == null || movement.version() < 0
                || movement.movementNo() == null || movement.movementNo().isBlank() || movement.movementDate() == null
                || !Set.of("RETURN", "TRANSFER", "SCRAP", "DISPOSE", "LOST").contains(String.valueOf(movement.purpose()))
                || !Objects.equals(movement.fromCustodianId(), userId) || Objects.equals(movement.toCustodianId(), userId))) throw unverified();
        if (released && movement == null) throw unverified();
        ObjectNode evidence = json.valueToTree(asset);
        evidence.put("employeeId", employeeId.toString()); evidence.put("userId", userId.toString()); evidence.put("responsibilityReleased", released);
        evidence.set("disposition", json.valueToTree(movement));
        evidence.put("sourceFingerprint", fingerprint(evidence)); evidence.put("sourceVerified", true);
        return evidence;
    }

    public ObjectNode merge(HrFinalSettlement record, ObjectNode current, JsonNode previous) {
        ObjectNode result = current.deepCopy(); result.put("active", true);
        if (previous != null) {
            if (previous.has("assetReview")) result.set("assetReview", previous.get("assetReview").deepCopy());
            if (previous.has("assetReviewHistory")) result.set("assetReviewHistory", previous.get("assetReviewHistory").deepCopy());
        }
        JsonNode review = result.path("assetReview");
        boolean confirmed = result.path("sourceVerified").asBoolean(false) && result.path("ownershipConsistent").asBoolean(false)
                && Set.of("LOSS_ASSESSED", "RELEASED_NO_LOSS").contains(review.path("resolution").asText()) && review.path("sourceFingerprint").asText("missing").equals(result.path("sourceFingerprint").asText())
                && record.getJoinDate().toString().equals(review.path("joinDate").asText()) && record.getRelievingDate().toString().equals(review.path("relievingDate").asText());
        result.put("assessmentCurrent", confirmed); result.put("resolution", review.path("resolution").asText("RETURN_PENDING"));
        return result;
    }

    public ObjectNode assess(HrFinalSettlement record, ObjectNode current, JsonNode previous, HrSettlementRequests.AssetReview input) {
        if (!input.getSourceFingerprint().equals(current.path("sourceFingerprint").asText())) throw conflict("SETTLEMENT_ASSET_CHANGED", "OA资产或处置记录已变化，请重新读取核对");
        if (!current.path("ownershipConsistent").asBoolean(false)) throw invalid("资产保管与领用责任存在冲突，请先在OA核实");
        boolean loss = "LOSS_ASSESSED".equals(input.getResolution());
        if (loss ? input.getAmount().signum() <= 0 : input.getAmount().signum() != 0) throw invalid("损失核定须填写正金额，其他处理金额须为零");
        if ("RELEASED_NO_LOSS".equals(input.getResolution()) && (!current.path("responsibilityReleased").asBoolean(false) || current.path("disposition").isNull())) throw invalid("须先完成OA资产责任解除及真实处置，再核定不扣款");
        ObjectNode result = merge(record, current, previous);
        ArrayNode history = result.path("assetReviewHistory") instanceof ArrayNode values ? values.deepCopy() : json.createArrayNode();
        if (result.has("assetReview")) history.add(result.get("assetReview").deepCopy());
        ObjectNode review = json.createObjectNode(); review.put("resolution", input.getResolution()); review.put("rawAmount", input.getAmount().toPlainString());
        review.put("amount", HrSettlementCalculation.postingAmount(input.getAmount()).toPlainString()); review.put("reason", input.getReason().trim());
        review.put("reviewedBy", access.user().toString()); review.put("reviewedTime", HrHSupport.now().toString());
        review.put("joinDate", record.getJoinDate().toString()); review.put("relievingDate", record.getRelievingDate().toString());
        review.put("sourceFingerprint", current.path("sourceFingerprint").asText()); review.set("source", current.deepCopy());
        result.set("assetReview", review); result.set("assetReviewHistory", history);
        return merge(record, current, result);
    }

    public BigDecimal amount(JsonNode evidence) {
        JsonNode review = evidence.path("assetReview");
        return "LOSS_ASSESSED".equals(review.path("resolution").asText()) ? new BigDecimal(review.path("amount").asText()) : new BigDecimal("0.00");
    }
    private String fingerprint(JsonNode source) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(source.toString().getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException failure) { throw new IllegalStateException("SHA-256 unavailable", failure); }
    }
    private HrHException unverified() { return conflict("SETTLEMENT_ASSET_UNVERIFIED", "OA资产责任及处置尚未核实，请重新读取"); }
}
