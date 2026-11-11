ALTER TABLE purchase_requests DROP CONSTRAINT purchase_requests_status_check;
ALTER TABLE purchase_requests ADD CONSTRAINT purchase_requests_status_check CHECK(status IN ('draft','submitted','approved','rejected','changes_requested','cancelled'));
ALTER TABLE purchase_request_command_log DROP CONSTRAINT purchase_request_command_log_command_check;
ALTER TABLE purchase_request_command_log ADD CONSTRAINT purchase_request_command_log_command_check CHECK(command IN ('submit','approve','reject','request_changes','cancel'));
