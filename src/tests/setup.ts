// Loaded before each test file; sets up dummy env so loadConfig() succeeds.
process.env['DATABASE_URL_BREAK'] = 'postgresql://test:test@localhost:5432/break_test';
process.env['BREAK_WRITE_TOKEN'] = 'test-token-must-be-at-least-16-chars';
process.env['NODE_ENV'] = 'test';
process.env['LOG_LEVEL'] = 'fatal';
process.env['DATABASE_URL_TANIT_READONLY'] = '';
