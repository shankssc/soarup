SELECT * FROM profiles;

SELECT * FROM workspace_members;

SELECT * FROM workspaces;

SELECT * FROM updates;

SELECT * FROM workspace_invites;

DELETE from profiles where id='f7e2dca0-574f-4dd5-bd17-99281aa6f256';

DELETE from workspace_members;

DELETE from workspaces;

DELETE from updates where id='d833a290-9b44-494e-a0b7-90293f5255f4';

DELETE from workspace_invites;

SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'auth';
