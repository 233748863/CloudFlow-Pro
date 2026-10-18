package com.cloudflow.auth.message;

import com.cloudflow.common.message.security.MessageHtmlContent;

public final class MessageHtmlSanitizer {
    private MessageHtmlSanitizer() { }

    public static String clean(String input) { return MessageHtmlContent.clean(input); }
}
