SELECT * FROM profiles;

SELECT * FROM workspace_members;

SELECT * FROM workspaces;

DELETE from profiles;

DELETE from workspace_members;

DELETE from workspaces;

SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'auth';
