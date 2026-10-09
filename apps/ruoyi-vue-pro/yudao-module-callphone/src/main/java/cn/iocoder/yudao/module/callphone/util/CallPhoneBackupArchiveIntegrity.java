package cn.iocoder.yudao.module.callphone.util;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Structural integrity checks for Call Phone's private tenant backup archive. */
public final class CallPhoneBackupArchiveIntegrity {

    private CallPhoneBackupArchiveIntegrity() {
    }

    public static boolean hasCompleteTableEntries(Set<String> expectedTables, List<String> archiveEntries) {
        if (expectedTables.isEmpty() || archiveEntries.size() != expectedTables.size()) return false;
        Set<String> restoredTables = new HashSet<>();
        for (String entry : archiveEntries) {
            if (entry == null || !entry.startsWith("tables/") || !entry.endsWith(".jsonl")) return false;
            String table = entry.substring("tables/".length(), entry.length() - ".jsonl".length());
            if (!table.matches("cp_[a-z0-9_]+") || !expectedTables.contains(table) || !restoredTables.add(table)) {
                return false;
            }
        }
        return restoredTables.equals(expectedTables);
    }

    public static boolean hasExpectedRowCount(long expected, long restored) {
        return expected >= 0 && expected == restored;
    }
}
