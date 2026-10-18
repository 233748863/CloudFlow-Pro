package com.cloudflow.hr.checks;

import com.cloudflow.hr.service.HrRecruitmentContacts;
import java.util.Objects;

public final class HrRecruitmentContactChecks {
    private static int checks;

    public static void main(String[] arguments) {
        equal("+8613812345678", HrRecruitmentContacts.phone(" +86 (138) 1234-5678 "));
        equal("+12025550123", HrRecruitmentContacts.phone("+1 202-555-0123"));
        equal(null, HrRecruitmentContacts.phone(" "));
        equal(null, HrRecruitmentContacts.email(" "));
        equal("person.name+tag@example.com", HrRecruitmentContacts.email(" Person.Name+Tag@EXAMPLE.COM "));
        equal("person@xn--bcher-kva.example", HrRecruitmentContacts.email("Person@bücher.example"));
        HrRecruitmentContacts.Contacts original = HrRecruitmentContacts.normalize(100000L, "+8613812345678", "A@EXAMPLE.COM", true);
        HrRecruitmentContacts.Contacts equivalent = HrRecruitmentContacts.normalize(100000L, "+86 138-1234-5678", "a@example.com", true);
        equal(original, equivalent);
        equal("EMAIL", original.identities().get(0).type());
        equal("PHONE", original.identities().get(1).type());
        equal(64, original.identities().get(0).hash().length());
        different(original.identities(), HrRecruitmentContacts.normalize(100001L, original.phone(), original.email(), true).identities());
        different(HrRecruitmentContacts.email("a.b@example.com"), HrRecruitmentContacts.email("ab@example.com"));
        different(HrRecruitmentContacts.email("a+tag@example.com"), HrRecruitmentContacts.email("a@example.com"));
        equal(0, HrRecruitmentContacts.normalize(100000L, null, null, false).identities().size());
        String maximumEmail = "a".repeat(64) + "@" + "b".repeat(63) + "." + "c".repeat(63) + "." + "d".repeat(61);
        equal(254, maximumEmail.length());
        equal(maximumEmail, HrRecruitmentContacts.email(maximumEmail));
        equal("+1234567", HrRecruitmentContacts.phone("+1234567"));
        equal("+123456789012345", HrRecruitmentContacts.phone("+123456789012345"));
        equal("+8613812345678", HrRecruitmentContacts.phoneFromText("手机：+86 (138) 1234-5678\n邮箱：person@example.test"));
        equal("+12025550123", HrRecruitmentContacts.phoneFromText("Phone: +1 202-555-0123\nExperience"));
        equal("+123456789012345", HrRecruitmentContacts.phoneFromText("+123456789012345"));
        equal(null, HrRecruitmentContacts.phoneFromText("13812345678"));
        equal(null, HrRecruitmentContacts.phoneFromText("+1234567890123456"));
        equal(null, HrRecruitmentContacts.phoneFromText("+1234567890123456-789"));
        equal(null, HrRecruitmentContacts.phoneFromText("++123456789012345"));
        equal(null, HrRecruitmentContacts.phoneFromText("+123456789012345abc"));
        equal(null, HrRecruitmentContacts.phoneFromText(null));
        equal("+12025550123", HrRecruitmentContacts.phoneFromText("+0123456789\n+12025550123"));
        equal(maximumEmail, HrRecruitmentContacts.emailFromText("邮箱：" + maximumEmail + "\n经历"));
        equal("person.name+tag@example.com", HrRecruitmentContacts.emailFromText("Email: Person.Name+Tag@EXAMPLE.COM"));
        equal("person@xn--bcher-kva.example", HrRecruitmentContacts.emailFromText("邮箱：Person@bücher.example"));
        equal("o'connor@example.test", HrRecruitmentContacts.emailFromText("o'connor@example.test"));
        equal(null, HrRecruitmentContacts.emailFromText(maximumEmail + "e"));
        equal(null, HrRecruitmentContacts.emailFromText("a".repeat(65) + "@example.test"));
        equal(null, HrRecruitmentContacts.emailFromText("a@example.test.invalid_"));
        equal(null, HrRecruitmentContacts.emailFromText("a@@example.test"));
        equal(null, HrRecruitmentContacts.emailFromText("姓名a@example.test"));
        equal(null, HrRecruitmentContacts.emailFromText(null));
        rejects(() -> HrRecruitmentContacts.email(maximumEmail + "e"));
        rejects(() -> HrRecruitmentContacts.normalize(100000L, null, null, true));
        rejects(() -> HrRecruitmentContacts.normalize(null, "+8613812345678", null, true));
        rejects(() -> HrRecruitmentContacts.normalize(0L, null, "a@example.com", true));
        for (String invalid : new String[]{"13812345678", "008613812345678", "+0123456789", "+123456", "+1234567890123456", "+86a13812345678", "+86\n13812345678", "+８６13812345678", "+86 13812345678 ext 1"}) {
            rejects(() -> HrRecruitmentContacts.phone(invalid));
        }
        for (String invalid : new String[]{"a", "@example.com", "a@@example.com", "a b@example.com", "a\nb@example.com", ".a@example.com", "a.@example.com", "a..b@example.com", "a@example", "a@example.com.", "a@-example.com", "a@example-.com", "a@exa_mple.com", "a@.example.com", "a".repeat(65) + "@example.com", "a@" + "b".repeat(64) + ".com"}) {
            rejects(() -> HrRecruitmentContacts.email(invalid));
        }
        System.out.println("H2_REFERRAL_CONTACT_CHECKS: checks=" + checks + "; failed=0; dependency_jars=0");
    }

    private static void equal(Object expected, Object actual) {
        checks++;
        if (!Objects.equals(expected, actual)) throw new AssertionError("Contact equality check failed: " + checks);
    }

    private static void different(Object first, Object second) {
        checks++;
        if (Objects.equals(first, second)) throw new AssertionError("Distinct identity check failed: " + checks);
    }

    private static void rejects(Runnable operation) {
        checks++;
        try { operation.run(); }
        catch (IllegalArgumentException expected) { return; }
        throw new AssertionError("Invalid contact accepted: " + checks);
    }
}
