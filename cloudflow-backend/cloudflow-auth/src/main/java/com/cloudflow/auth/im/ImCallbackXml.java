package com.cloudflow.auth.im;

import java.io.StringReader;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;

public final class ImCallbackXml {
    public static final int MAX_BYTES = 1024 * 1024;
    public static final int MAX_DEPTH = 32;

    private ImCallbackXml() { }

    public static Map<String, String> read(byte[] bytes) {
        String xml = utf8(bytes);
        XMLInputFactory factory = XMLInputFactory.newFactory();
        factory.setProperty(XMLInputFactory.SUPPORT_DTD, false);
        factory.setProperty("javax.xml.stream.isSupportingExternalEntities", false);
        factory.setProperty(XMLInputFactory.IS_REPLACING_ENTITY_REFERENCES, false);
        factory.setXMLResolver((publicId, systemId, baseUri, namespace) -> { throw new XMLStreamException("IM_XML_EXTERNAL_ENTITY"); });
        XMLStreamReader reader = null;
        try {
            reader = factory.createXMLStreamReader(new StringReader(xml));
            Map<String, String> values = new HashMap<>();
            Set<String> directNames = new HashSet<>();
            int depth = 0;
            boolean rootSeen = false;
            String directName = null;
            StringBuilder content = new StringBuilder();
            boolean nested = false;
            while (reader.hasNext()) {
                int event = reader.next();
                if (event == XMLStreamConstants.START_ELEMENT) {
                    depth++;
                    if (depth > MAX_DEPTH || reader.getAttributeCount() != 0 || reader.getNamespaceCount() != 0
                            || reader.getNamespaceURI() != null && !reader.getNamespaceURI().isEmpty()) {
                        throw ImFailure.callback();
                    }
                    if (depth == 1) {
                        if (rootSeen || !"xml".equals(reader.getLocalName())) throw ImFailure.callback();
                        rootSeen = true;
                    } else if (depth == 2) {
                        directName = reader.getLocalName();
                        if (!directNames.add(directName)) throw ImFailure.callback();
                        content.setLength(0);
                        nested = false;
                    } else {
                        nested = true;
                    }
                } else if (event == XMLStreamConstants.END_ELEMENT) {
                    if (depth == 2 && !nested) values.put(directName, content.toString());
                    depth--;
                } else if (event == XMLStreamConstants.CHARACTERS || event == XMLStreamConstants.CDATA
                        || event == XMLStreamConstants.SPACE) {
                    if (depth == 2) content.append(reader.getText());
                    else if (depth <= 1 && !reader.isWhiteSpace()) throw ImFailure.callback();
                } else if (event == XMLStreamConstants.DTD || event == XMLStreamConstants.ENTITY_REFERENCE
                        || event == XMLStreamConstants.PROCESSING_INSTRUCTION) {
                    throw ImFailure.callback();
                }
            }
            if (!rootSeen || depth != 0) throw ImFailure.callback();
            return Map.copyOf(values);
        } catch (XMLStreamException | IllegalArgumentException failure) {
            throw ImFailure.callback();
        } finally {
            if (reader != null) {
                try { reader.close(); }
                catch (XMLStreamException failure) { throw ImFailure.callback(); }
            }
        }
    }

    static String utf8(byte[] bytes) {
        if (bytes == null || bytes.length == 0 || bytes.length > MAX_BYTES) throw ImFailure.callback();
        try {
            return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException failure) {
            throw ImFailure.callback();
        }
    }
}
