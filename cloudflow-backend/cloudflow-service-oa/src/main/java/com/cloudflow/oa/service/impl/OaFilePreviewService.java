package com.cloudflow.oa.service.impl;

import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.file.FilePreviewBinding;
import com.cloudflow.common.core.file.FilePreviewReferences;
import com.cloudflow.common.core.file.FilePreviewRequest;
import com.cloudflow.common.security.file.FilePreviewAccess;
import com.cloudflow.oa.domain.BizExpenseClaim;
import com.cloudflow.oa.domain.BizExpenseItem;
import com.cloudflow.oa.domain.KnowledgeDocVersion;
import com.cloudflow.oa.domain.KnowledgeDocument;
import com.cloudflow.oa.domain.OaContract;
import com.cloudflow.oa.domain.OaContractFulfilmentTerm;
import com.cloudflow.oa.domain.OaInvoice;
import com.cloudflow.oa.domain.OaLicense;
import com.cloudflow.oa.domain.OaLicenseBorrow;
import com.cloudflow.oa.domain.OaSealApplication;
import com.cloudflow.oa.domain.OaSeal;
import com.cloudflow.oa.domain.OaLicenseRenewal;
import com.cloudflow.oa.domain.OaSealRenewal;
import com.cloudflow.oa.domain.OaLicenseHandoverLog;
import com.cloudflow.oa.domain.OaSealHandoverLog;
import com.cloudflow.oa.domain.BusinessTrip;
import com.cloudflow.oa.domain.BizPaymentRequest;
import com.cloudflow.oa.domain.BizPurchaseRequest;
import com.cloudflow.oa.domain.OaContractMilestone;
import com.cloudflow.oa.service.IPurchaseRequestService;
import com.cloudflow.oa.service.IOaContractMilestoneService;
import com.cloudflow.oa.service.IPaymentRequestService;
import com.cloudflow.oa.domain.OaSupplierQualification;
import com.cloudflow.oa.domain.OaPurchaseRfq;
import com.cloudflow.oa.domain.OaSupplierQuotation;
import com.cloudflow.oa.service.IExpenseClaimService;
import com.cloudflow.oa.service.IKnowledgeService;
import com.cloudflow.oa.service.IKnowledgeVersionService;
import com.cloudflow.oa.service.IOaContractService;
import com.cloudflow.oa.service.IOaInvoiceService;
import com.cloudflow.oa.service.IOaLicenseService;
import com.cloudflow.oa.service.IOaLicenseBorrowService;
import com.cloudflow.oa.service.IOaSealApplicationService;
import com.cloudflow.oa.service.IOaSealService;
import com.cloudflow.oa.service.IOaLicenseRenewalService;
import com.cloudflow.oa.service.IOaSealRenewalService;
import com.cloudflow.oa.service.IBusinessTripService;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class OaFilePreviewService {
    private final IOaContractService contracts;
    private final IOaLicenseService licenses;
    private final IKnowledgeService knowledge;
    private final IKnowledgeVersionService versions;
    private final IExpenseClaimService expenses;
    private final IOaInvoiceService invoices;
    private final OaSupplierGovernanceService suppliers;
    private final OaContractFulfilmentService fulfilments;
    private final OaMeetingRoomPhotoService meetingPhotos;
    private final OaRfqService rfqs;
    private final OaQuotationService quotations;
    private final IOaLicenseBorrowService licenseBorrows;
    private final IOaSealApplicationService sealApplications;
    private final IOaSealService seals;
    private final IOaLicenseRenewalService licenseRenewals;
    private final IOaSealRenewalService sealRenewals;
    private final IBusinessTripService trips;
    private final IPaymentRequestService payments;
    private final IPurchaseRequestService purchases;
    private final IOaContractMilestoneService milestones;

    public FilePreviewBinding authorize(FilePreviewRequest request) {
        FilePreviewAccess.requireContext();
        return authorizeBinding(request);
    }

    public FilePreviewBinding authorizeDownload(FilePreviewRequest request) {
        FilePreviewAccess.requireSession();
        request.validated();
        if ("OA_PURCHASE_REQUEST".equals(request.bizType())) {
            StpUtil.checkPermission("oa:purchase:list");
            BizPurchaseRequest record = purchases.getAccessibleRequestWithItems(request.businessId());
            if (record == null || !Integer.valueOf(0).equals(record.getDeleted())) throw FilePreviewReferences.denied();
            tenant(record.getTenantId());
            return binding(request, record.getAttachmentUrl(), String.valueOf(record.getVersion()));
        }
        if ("OA_CONTRACT_MILESTONE".equals(request.bizType())) {
            StpUtil.checkPermission("oa:contract:list");
            OaContract parent = contracts.getContractInfo(request.businessId());
            if (parent == null || !Integer.valueOf(0).equals(parent.getDeleted())) throw FilePreviewReferences.denied();
            tenant(parent.getTenantId());
            OaContractMilestone record = milestones.listByContract(request.businessId()).stream()
                    .filter(value -> Objects.equals(value.getId(), request.childId())
                            && Objects.equals(value.getContractId(), request.businessId())
                            && Integer.valueOf(0).equals(value.getDeleted()))
                    .findFirst().orElseThrow(FilePreviewReferences::denied);
            tenant(record.getTenantId());
            return binding(request, record.getAttachmentUrl(), parent.getVersion() + ":" + record.getVersion());
        }
        if ("OA_PAYMENT_REQUEST".equals(request.bizType())) {
            StpUtil.checkPermission("oa:payment:list");
            BizPaymentRequest record = payments.getAccessiblePayment(request.businessId());
            if (record == null || !Integer.valueOf(0).equals(record.getDeleted())) throw FilePreviewReferences.denied();
            tenant(record.getTenantId());
            return binding(request, record.getAttachmentUrl(), String.valueOf(record.getVersion()));
        }
        if ("OA_SEAL".equals(request.bizType())) {
            StpUtil.checkPermission("oa:seal:list");
            OaSeal record = seals.getSealInfo(request.businessId());
            if (record == null || !Integer.valueOf(0).equals(record.getDeleted())) throw FilePreviewReferences.denied();
            tenant(record.getTenantId());
            return binding(request, record.getAttachmentUrl(), String.valueOf(record.getVersion()));
        }
        if ("OA_BUSINESS_TRIP".equals(request.bizType())) {
            StpUtil.checkPermission("oa:trip:list");
            BusinessTrip record = trips.getAccessibleTrip(request.businessId());
            if (record == null || !Integer.valueOf(0).equals(record.getDeleted())) throw FilePreviewReferences.denied();
            tenant(record.getTenantId());
            return binding(request, record.getAttachmentUrl(), String.valueOf(record.getVersion()));
        }
        if ("OA_LICENSE_RENEWAL".equals(request.bizType())) {
            StpUtil.checkPermission("oa:license:list");
            OaLicenseRenewal record = licenseRenewals.getRenewalInfo(request.businessId());
            if (record == null || !Integer.valueOf(0).equals(record.getDeleted())) throw FilePreviewReferences.denied();
            tenant(record.getTenantId());
            return binding(request, record.getAttachmentUrl(), String.valueOf(record.getVersion()));
        }
        if ("OA_SEAL_RENEWAL".equals(request.bizType())) {
            StpUtil.checkPermission("oa:seal:list");
            OaSealRenewal record = sealRenewals.getRenewalInfo(request.businessId());
            if (record == null || !Integer.valueOf(0).equals(record.getDeleted())) throw FilePreviewReferences.denied();
            tenant(record.getTenantId());
            return binding(request, record.getAttachmentUrl(), String.valueOf(record.getVersion()));
        }
        if ("OA_LICENSE_HANDOVER".equals(request.bizType())) {
            StpUtil.checkPermission("oa:license:list");
            OaLicenseBorrow parent = licenseBorrows.getBorrowInfo(request.businessId());
            if (parent == null || !Integer.valueOf(0).equals(parent.getDeleted())) throw FilePreviewReferences.denied();
            tenant(parent.getTenantId());
            OaLicenseHandoverLog record = licenseBorrows.listHandoverLogs(request.businessId()).stream()
                    .filter(value -> Objects.equals(value.getId(), request.childId())
                            && Objects.equals(value.getBorrowId(), request.businessId())).findFirst().orElseThrow(FilePreviewReferences::denied);
            tenant(record.getTenantId());
            return binding(request, record.getAttachmentUrl(), parent.getVersion() + ":" + record.getId());
        }
        if ("OA_SEAL_HANDOVER".equals(request.bizType())) {
            StpUtil.checkPermission("oa:seal:list");
            OaSealApplication parent = sealApplications.getApplicationInfo(request.businessId());
            if (parent == null || !Integer.valueOf(0).equals(parent.getDeleted())) throw FilePreviewReferences.denied();
            tenant(parent.getTenantId());
            OaSealHandoverLog record = sealApplications.listHandoverLogs(request.businessId()).stream()
                    .filter(value -> Objects.equals(value.getId(), request.childId())
                            && Objects.equals(value.getApplicationId(), request.businessId())).findFirst().orElseThrow(FilePreviewReferences::denied);
            tenant(record.getTenantId());
            return binding(request, record.getAttachmentUrl(), parent.getVersion() + ":" + record.getId());
        }
        if ("OA_LICENSE_BORROW".equals(request.bizType())) {
            StpUtil.checkPermission("oa:license:list");
            OaLicenseBorrow record = licenseBorrows.getBorrowInfo(request.businessId());
            if (record == null || !Integer.valueOf(0).equals(record.getDeleted())) throw FilePreviewReferences.denied();
            tenant(record.getTenantId());
            return binding(request, record.getAttachmentUrl(), String.valueOf(record.getVersion()));
        }
        if ("OA_SEAL_APPLICATION".equals(request.bizType())) {
            StpUtil.checkPermission("oa:seal:list");
            OaSealApplication record = sealApplications.getApplicationInfo(request.businessId());
            if (record == null || !Integer.valueOf(0).equals(record.getDeleted())) throw FilePreviewReferences.denied();
            tenant(record.getTenantId());
            return binding(request, record.getAttachmentUrl(), String.valueOf(record.getVersion()));
        }
        if ("OA_MEETING_ROOM".equals(request.bizType())) return meetingPhotos.authorizeDownload(request);
        if ("OA_RFQ_INVITATION".equals(request.bizType())) {
            StpUtil.checkPermission("oa:rfq:list");
            OaPurchaseRfq record = rfqs.readableAttachment(request.businessId());
            tenant(record.getTenantId());
            return binding(request, record.getAttachmentUrl(), String.valueOf(record.getVersion()));
        }
        if ("OA_RFQ_QUOTATION".equals(request.bizType())) {
            StpUtil.checkPermission("oa:rfq:quote");
            OaSupplierQuotation record = quotations.detail(request.businessId()).getQuotation();
            tenant(record.getTenantId());
            return binding(request, record.getAttachmentUrl(), String.valueOf(record.getVersion()));
        }
        return authorizeBinding(request);
    }

    private FilePreviewBinding authorizeBinding(FilePreviewRequest request) {
        request.validated();
        try {
            return switch (request.bizType()) {
                case "OA_CONTRACT" -> contract(request);
                case "OA_LICENSE" -> license(request);
                case "OA_KNOWLEDGE" -> knowledge(request);
                case "OA_EXPENSE" -> expense(request);
                case "OA_INVOICE" -> invoice(request);
                case "OA_SUPPLIER_QUALIFICATION" -> qualification(request);
                case "OA_CONTRACT_EVIDENCE" -> evidence(request);
                case "OA_CONTRACT_SIGNED" -> signed(request);
                default -> throw FilePreviewReferences.denied();
            };
        } catch (IllegalArgumentException failure) {
            throw FilePreviewReferences.denied();
        }
    }

    public ResponseEntity<byte[]> content(FilePreviewRequest request) {
        authorize(request);
        return privateContent(request);
    }

    public ResponseEntity<byte[]> downloadContent(FilePreviewRequest request) {
        authorizeDownload(request);
        return privateContent(request);
    }

    private ResponseEntity<byte[]> privateContent(FilePreviewRequest request) {
        return switch (request.bizType()) {
            case "OA_CONTRACT_EVIDENCE" -> fulfilments.downloadEvidence(request.childId());
            case "OA_CONTRACT_SIGNED" -> fulfilments.downloadSignedFile(request.businessId());
            case "OA_RFQ_INVITATION" -> rfqs.attachment(request.businessId());
            case "OA_RFQ_QUOTATION" -> quotations.download(request.businessId());
            default -> throw FilePreviewReferences.denied();
        };
    }

    private FilePreviewBinding contract(FilePreviewRequest request) {
        StpUtil.checkPermission("oa:contract:list");
        OaContract record = contracts.getContractInfo(request.businessId());
        tenant(record.getTenantId());
        return binding(request, "archive".equals(request.slot()) ? record.getArchiveAttachmentUrl() : record.getAttachmentUrl(), String.valueOf(record.getVersion()));
    }

    private FilePreviewBinding license(FilePreviewRequest request) {
        StpUtil.checkPermission("oa:license:list");
        OaLicense record = licenses.getLicenseInfo(request.businessId());
        tenant(record.getTenantId());
        return binding(request, record.getAttachmentUrl(), String.valueOf(record.getVersion()));
    }

    private FilePreviewBinding knowledge(FilePreviewRequest request) {
        StpUtil.checkPermission("oa:knowledge:list");
        KnowledgeDocument record = knowledge.getReadableDetail(request.businessId());
        tenant(record.getTenantId());
        if (request.versionNo() == null) return binding(request, record.getAttachmentUrl(), String.valueOf(record.getVersion()));
        KnowledgeDocVersion version = versions.getVersion(record.getDocumentId(), request.versionNo());
        if (version == null || !Objects.equals(version.getDocumentId(), record.getDocumentId())) throw FilePreviewReferences.denied();
        tenant(version.getTenantId());
        return binding(request, version.getAttachmentUrl(), record.getVersion() + ":" + version.getId() + ":" + version.getVersionNo());
    }

    private FilePreviewBinding expense(FilePreviewRequest request) {
        StpUtil.checkPermission("oa:expense:list");
        BizExpenseClaim record = expenses.getClaimWithItems(request.businessId());
        tenant(record.getTenantId());
        BizExpenseItem item = record.getItems() == null ? null : record.getItems().stream()
                .filter(value -> Objects.equals(value.getId(), request.childId()) && Objects.equals(value.getClaimId(), record.getId()))
                .findFirst().orElse(null);
        if (item == null) throw FilePreviewReferences.denied();
        return binding(request, item.getReceiptUrl(), record.getVersion() + ":" + item.getId());
    }

    private FilePreviewBinding invoice(FilePreviewRequest request) {
        StpUtil.checkPermission("oa:invoice:list");
        OaInvoice record = invoices.getInvoiceInfo(request.businessId());
        tenant(record.getTenantId());
        return binding(request, record.getImageUrl(), String.valueOf(record.getVersion()));
    }

    private FilePreviewBinding qualification(FilePreviewRequest request) {
        StpUtil.checkPermission("oa:supplier:list");
        OaSupplierQualification record = suppliers.qualifications(request.businessId()).stream()
                .filter(value -> Objects.equals(value.getQualificationId(), request.childId())).findFirst().orElse(null);
        if (record == null || !Objects.equals(record.getSupplierId(), request.businessId())) throw FilePreviewReferences.denied();
        tenant(record.getTenantId());
        return binding(request, record.getFileUrl(), String.valueOf(record.getVersion()));
    }

    private FilePreviewBinding evidence(FilePreviewRequest request) {
        StpUtil.checkPermission("oa:contract:list");
        OaContractFulfilmentTerm record = fulfilments.getReadableEvidenceTerm(request.childId());
        if (!Objects.equals(record.getContractId(), request.businessId())) throw FilePreviewReferences.denied();
        tenant(record.getTenantId());
        return binding(request, record.getEvidenceFileUrl(), String.valueOf(record.getVersion()));
    }

    private FilePreviewBinding signed(FilePreviewRequest request) {
        StpUtil.checkPermission("oa:contract:list");
        OaContract record = fulfilments.getReadableSignedContract(request.businessId());
        tenant(record.getTenantId());
        return binding(request, record.getSignedFileUrl(), String.valueOf(record.getVersion()));
    }

    private static FilePreviewBinding binding(FilePreviewRequest request, String references, String revision) {
        return new FilePreviewBinding(FilePreviewReferences.choose(request, FilePreviewReferences.split(references)), revision);
    }

    private static void tenant(Long tenantId) {
        if (!Objects.equals(UserContext.getTenantId(), tenantId)) throw FilePreviewReferences.denied();
    }
}
