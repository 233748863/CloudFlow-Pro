package com.cloudflow.crm.support;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

public final class CrmCampaignLogArchiveCodec {
    public static final int MAXIMUM_PLAIN_BYTES = 32768;
    private static final int FORMAT_VERSION = 1;

    private CrmCampaignLogArchiveCodec() {
    }

    public record Details(String targetEmail, String clickUrl, String userAgent, String ipAddress) {
    }

    public record Encoded(byte[] payload, byte[] checksum, int detailBytes) {
        public Encoded {
            payload = payload.clone();
            checksum = checksum.clone();
        }

        @Override
        public byte[] payload() {
            return payload.clone();
        }

        @Override
        public byte[] checksum() {
            return checksum.clone();
        }

        public int storedBytes() {
            return payload.length + checksum.length;
        }
    }

    public static Encoded encode(Details details) {
        if (details == null) throw invalid();
        ByteArrayOutputStream plainBuffer = new ByteArrayOutputStream();
        int detailBytes = 0;
        try (DataOutputStream plainOutput = new DataOutputStream(plainBuffer)) {
            plainOutput.writeByte(FORMAT_VERSION);
            String[] values = {details.targetEmail(), details.clickUrl(), details.userAgent(), details.ipAddress()};
            for (String value : values) {
                if (value == null) {
                    plainOutput.writeInt(-1);
                } else {
                    if (value.length() > MAXIMUM_PLAIN_BYTES) throw invalid();
                    ByteBuffer fieldBuffer = StandardCharsets.UTF_8.newEncoder().onMalformedInput(CodingErrorAction.REPORT)
                            .onUnmappableCharacter(CodingErrorAction.REPORT).encode(CharBuffer.wrap(value));
                    byte[] fieldBytes = new byte[fieldBuffer.remaining()];
                    fieldBuffer.get(fieldBytes);
                    if (plainBuffer.size() + Integer.BYTES + fieldBytes.length > MAXIMUM_PLAIN_BYTES) throw invalid();
                    plainOutput.writeInt(fieldBytes.length);
                    plainOutput.write(fieldBytes);
                    detailBytes += fieldBytes.length;
                }
                if (plainBuffer.size() > MAXIMUM_PLAIN_BYTES) throw invalid();
            }
            plainOutput.flush();
            byte[] plain = plainBuffer.toByteArray();
            ByteArrayOutputStream archiveBuffer = new ByteArrayOutputStream();
            try (GZIPOutputStream archiveOutput = new GZIPOutputStream(archiveBuffer)) {
                archiveOutput.write(plain);
            }
            return new Encoded(archiveBuffer.toByteArray(), digest(plain), detailBytes);
        } catch (IOException exception) {
            throw invalid();
        }
    }

    public static Details decode(byte[] payload, byte[] checksum) {
        if (payload == null || payload.length == 0 || payload.length > MAXIMUM_PLAIN_BYTES + 256
                || checksum == null || checksum.length != 32) throw invalid();
        byte[] plain;
        try (GZIPInputStream archiveInput = new GZIPInputStream(new ByteArrayInputStream(payload))) {
            plain = archiveInput.readNBytes(MAXIMUM_PLAIN_BYTES + 1);
        } catch (IOException exception) {
            throw invalid();
        }
        if (plain.length > MAXIMUM_PLAIN_BYTES || !MessageDigest.isEqual(digest(plain), checksum)) throw invalid();
        try (DataInputStream plainInput = new DataInputStream(new ByteArrayInputStream(plain))) {
            if (plainInput.readUnsignedByte() != FORMAT_VERSION) throw invalid();
            Details details = new Details(readField(plainInput), readField(plainInput), readField(plainInput), readField(plainInput));
            if (plainInput.available() != 0) throw invalid();
            return details;
        } catch (IOException exception) {
            throw invalid();
        }
    }

    private static String readField(DataInputStream input) throws IOException {
        int length = input.readInt();
        if (length == -1) return null;
        if (length < 0 || length > MAXIMUM_PLAIN_BYTES || length > input.available()) throw invalid();
        byte[] bytes = input.readNBytes(length);
        return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
    }

    private static byte[] digest(byte[] plain) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(plain);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("营销日志归档校验不可用");
        }
    }

    private static IllegalStateException invalid() {
        return new IllegalStateException("营销日志归档内容无效或超出32768字节限制");
    }
}
