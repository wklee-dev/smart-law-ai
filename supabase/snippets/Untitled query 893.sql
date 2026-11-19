SELECT 'admin_rule' AS kind, count(*) FROM admin_rule_chunks
UNION ALL
SELECT 'raw_rule', count(*) FROM raw_rule_chunks;

SELECT * FROM admin_rule_chunks;