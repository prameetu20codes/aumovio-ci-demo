package com.aumovio.fleet.api;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.aumovio.fleet.core.BatteryHealth;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class JsonTest {

    @Test
    void writesScalars() {
        assertEquals("null", Json.write(null));
        assertEquals("42", Json.write(42));
        assertEquals("true", Json.write(true));
        assertEquals("\"GOOD\"", Json.write(BatteryHealth.GOOD));
    }

    @Test
    void escapesStrings() {
        assertEquals("\"a\\\"b\\\\c\\nd\\u0001\"", Json.write("a\"b\\c\nd\u0001"));
    }

    @Test
    void writesNestedStructures() {
        Map<Object, Object> map = new LinkedHashMap<>();
        map.put("vins", List.of("A", "B"));
        map.put(BatteryHealth.REPLACE, 1);

        assertEquals("{\"vins\":[\"A\",\"B\"],\"REPLACE\":1}", Json.write(map));
    }

    @Test
    void writesEmptyCollections() {
        assertEquals("[]", Json.write(List.of()));
        assertEquals("{}", Json.write(Map.of()));
    }
}
