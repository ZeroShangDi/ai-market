package cn.iocoder.yudao.module.callphone.util;

import java.util.List;
import java.util.HashSet;
import java.util.Set;

/** Narrow backward-compatibility rules for tenant-local Call Phone backup restoration. */
public final class CallPhoneBackupSchemaCompatibility {

    private static final String MOBILE_EVENT_TABLE = "cp_mobile_call_event";
    private static final String V44_FINGERPRINT_COLUMN = "request_fingerprint";
    private static final String RECORDING_ASSET_TABLE = "cp_call_recording_asset";
    private static final String RECORDING_ACCESS_AUDIT_TABLE = "cp_call_recording_access_audit";
    private static final String LEAD_AUTO_ASSIGNMENT_CONFIG_TABLE = "cp_lead_assignment_auto_config";
    private static final String ARCHIVE_ACCESS_AUDIT_TABLE = "cp_wecom_archive_access_audit";
    private static final String ARCHIVE_ACTOR_TYPE_COLUMN = "actor_type";
    private static final String CUSTOMER_OWNER_CHANGE_TABLE = "cp_customer_owner_change";
    private static final Set<String> V50_RECYCLE_CONFIG_COLUMNS = Set.of("recycle_enabled", "recycle_after_days");

    private CallPhoneBackupSchemaCompatibility() {
    }

    public static boolean hasCompatibleColumns(int archiveSchemaVersion, String tableName,
                                               List<String> currentColumns, List<String> archivedColumns) {
        if (currentColumns.equals(archivedColumns)) return true;
        if (archiveSchemaVersion == 49 && LEAD_AUTO_ASSIGNMENT_CONFIG_TABLE.equals(tableName)
                && currentColumns.containsAll(V50_RECYCLE_CONFIG_COLUMNS)
                && V50_RECYCLE_CONFIG_COLUMNS.stream().noneMatch(archivedColumns::contains)) {
            return currentColumns.stream().filter(column -> !V50_RECYCLE_CONFIG_COLUMNS.contains(column)).toList()
                    .equals(archivedColumns);
        }
        if (archiveSchemaVersion >= 50 && archiveSchemaVersion <= 53
                && ARCHIVE_ACCESS_AUDIT_TABLE.equals(tableName)
                && currentColumns.contains(ARCHIVE_ACTOR_TYPE_COLUMN)
                && !archivedColumns.contains(ARCHIVE_ACTOR_TYPE_COLUMN)) {
            return currentColumns.stream().filter(column -> !ARCHIVE_ACTOR_TYPE_COLUMN.equals(column)).toList()
                    .equals(archivedColumns);
        }
        if (archiveSchemaVersion != 43 || !MOBILE_EVENT_TABLE.equals(tableName)
                || !currentColumns.contains(V44_FINGERPRINT_COLUMN)
                || archivedColumns.contains(V44_FINGERPRINT_COLUMN)) return false;
        return currentColumns.stream().filter(column -> !V44_FINGERPRINT_COLUMN.equals(column)).toList()
                .equals(archivedColumns);
    }

    public static boolean hasCompatibleTables(int archiveSchemaVersion, Set<String> currentTables,
                                              Set<String> archivedTables) {
        if (currentTables.equals(archivedTables)) return true;
        if (archiveSchemaVersion >= 49 && archiveSchemaVersion <= 54) {
            return matchesExcept(currentTables, archivedTables, CUSTOMER_OWNER_CHANGE_TABLE);
        }
        if (archiveSchemaVersion == 48) {
            return matchesExcept(currentTables, archivedTables, LEAD_AUTO_ASSIGNMENT_CONFIG_TABLE,
                    CUSTOMER_OWNER_CHANGE_TABLE);
        }
        if (archiveSchemaVersion == 47) {
            return matchesExcept(currentTables, archivedTables, RECORDING_ACCESS_AUDIT_TABLE,
                    LEAD_AUTO_ASSIGNMENT_CONFIG_TABLE, CUSTOMER_OWNER_CHANGE_TABLE);
        }
        if (archiveSchemaVersion == 46) {
            return matchesExcept(currentTables, archivedTables, RECORDING_ASSET_TABLE, RECORDING_ACCESS_AUDIT_TABLE,
                    LEAD_AUTO_ASSIGNMENT_CONFIG_TABLE, CUSTOMER_OWNER_CHANGE_TABLE);
        }
        return false;
    }

    private static boolean matchesExcept(Set<String> currentTables, Set<String> archivedTables, String... omitted) {
        Set<String> expected = new HashSet<>(currentTables);
        for (String table : omitted) {
            if (!expected.remove(table)) return false;
        }
        return expected.equals(archivedTables);
    }
}
