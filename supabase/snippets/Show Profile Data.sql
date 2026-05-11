SELECT * FROM profiles;

SELECT * FROM workspace_members;

SELECT * FROM workspaces;

DELETE from profiles;

SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'auth';
