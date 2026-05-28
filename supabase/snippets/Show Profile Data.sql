SELECT * FROM profiles;

SELECT * FROM workspace_members;

SELECT * FROM workspaces;

SELECT * FROM updates;

DELETE from profiles;

DELETE from workspace_members;

DELETE from workspaces;

DELETE from updates where id='d833a290-9b44-494e-a0b7-90293f5255f4';

SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'auth';
