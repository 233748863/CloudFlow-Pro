package com.cloudflow.hr.checks;

import com.cloudflow.common.encrypt.core.EncryptUtils;
import com.cloudflow.common.encrypt.enums.AlgorithmType;
import com.cloudflow.hr.service.HrRecruitmentContacts;

public final class HrReferralStorageChecks {
    public static void main(String[] arguments) {
        String email = "a".repeat(64) + "@" + "b".repeat(63) + "." + "c".repeat(63) + "." + "d".repeat(61);
        String phone = "+123456789012345";
        String testKey = "0123456789abcdef";
        String emailCipher = EncryptUtils.encrypt(email, AlgorithmType.AES, testKey);
        String phoneCipher = EncryptUtils.encrypt(phone, AlgorithmType.AES, testKey);
        if (!email.equals(HrRecruitmentContacts.email(email)) || !phone.equals(HrRecruitmentContacts.phone(phone))
                || emailCipher.length() != 344 || phoneCipher.length() != 44
                || !email.equals(EncryptUtils.decrypt(emailCipher, AlgorithmType.AES, testKey))
                || !phone.equals(EncryptUtils.decrypt(phoneCipher, AlgorithmType.AES, testKey))) {
            throw new AssertionError("Referral storage compatibility check failed");
        }
        System.out.println("H2_REFERRAL_STORAGE_CHECKS: normalized_email_length=" + email.length()
                + "; encrypted_email_length=" + emailCipher.length() + "; normalized_phone_length=" + phone.length()
                + "; encrypted_phone_length=" + phoneCipher.length() + "; verified_decryptions=2; secret_output=0; database_writes=0");
    }
}
