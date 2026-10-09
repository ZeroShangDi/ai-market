-- Repair Call Phone menu names previously stored after UTF-8 was decoded as
-- Windows-1252. Only names in the Call Phone menu subtree that still contain
-- mojibake characters are converted; rerunning this script is safe.
SET NAMES utf8mb4;

WITH RECURSIVE callphone_menu_ids AS (
    SELECT id
    FROM system_menu
    WHERE parent_id = 0 AND path = '/callphone' AND deleted = b'0'

    UNION ALL

    SELECT child.id
    FROM system_menu child
    JOIN callphone_menu_ids parent ON child.parent_id = parent.id
    WHERE child.deleted = b'0'
)
UPDATE system_menu menu
JOIN callphone_menu_ids callphone ON callphone.id = menu.id
SET menu.name = CONVERT(CAST(CONVERT(menu.name USING latin1) AS BINARY) USING utf8mb4)
WHERE menu.name REGEXP '[À-ÿ]';
