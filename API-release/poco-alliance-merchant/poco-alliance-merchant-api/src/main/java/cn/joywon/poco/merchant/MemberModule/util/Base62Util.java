package cn.joywon.poco.merchant.MemberModule.util;

public class Base62Util {

    // 编码字符集
    private static final String CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    private static final int BASE = CHARSET.length();

    // 编码: 长整数 → Base62字符串
    public static String encode(long num) {
        if (num == 0) return String.valueOf(CHARSET.charAt(0));
        StringBuilder sb = new StringBuilder();
        while (num > 0) {
            sb.append(CHARSET.charAt((int) (num % BASE)));
            num = num / BASE;
        }
        // 反转得到正确顺序
        return sb.reverse().toString();
    }

    // 解码: Base62字符串 → 长整数(用于反查用户ID)
    public static long decode(String str) {
        long num = 0;
        for (char c : str.toCharArray()) {
            num = num * BASE + CHARSET.indexOf(c);
        }
        return num;
    }

}