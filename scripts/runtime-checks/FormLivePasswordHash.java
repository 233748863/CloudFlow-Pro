import com.cloudflow.auth.service.PasswordService;

public final class FormLivePasswordHash {
    public static void main(String[] arguments) {
        String password = System.getenv("CLOUDFLOW_FORM_TEST_PASSWORD");
        if (password == null || password.length() < 20) throw new IllegalArgumentException("Generated test password is required");
        System.out.print(new PasswordService(null, null, null).encodePassword(password));
    }
}
