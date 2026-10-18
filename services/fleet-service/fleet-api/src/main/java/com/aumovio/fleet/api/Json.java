package com.aumovio.fleet.api;

import java.util.Collection;
import java.util.Iterator;
import java.util.Map;

/**
 * Minimal JSON serializer for the response types this service returns. Keeps the demo service free
 * of third-party runtime dependencies.
 */
final class Json {

    private Json() { }

    static String write(Object value) {
        StringBuilder sb = new StringBuilder();
        append(sb, value);
        return sb.toString();
    }

    private static void append(StringBuilder sb, Object value) {
        if (value == null) {
            sb.append("null");
        } else if (value instanceof String s) {
            appendString(sb, s);
        } else if (value instanceof Number || value instanceof Boolean) {
            sb.append(value);
        } else if (value instanceof Enum<?> e) {
            appendString(sb, e.name());
        } else if (value instanceof Map<?, ?> map) {
            sb.append('{');
            Iterator<? extends Map.Entry<?, ?>> it = map.entrySet().iterator();
            while (it.hasNext()) {
                Map.Entry<?, ?> entry = it.next();
                appendString(sb, String.valueOf(entry.getKey() instanceof Enum<?> e ? e.name() : entry.getKey()));
                sb.append(':');
                append(sb, entry.getValue());
                if (it.hasNext()) {
                    sb.append(',');
                }
            }
            sb.append('}');
        } else if (value instanceof Collection<?> items) {
            sb.append('[');
            Iterator<?> it = items.iterator();
            while (it.hasNext()) {
                append(sb, it.next());
                if (it.hasNext()) {
                    sb.append(',');
                }
            }
            sb.append(']');
        } else {
            appendString(sb, value.toString());
        }
    }

    private static void appendString(StringBuilder sb, String s) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
                }
            }
        }
        sb.append('"');
    }
}
