# V0.9 setup
1. Create a Supabase project.
2. Run supabase/schema.sql in SQL Editor once.
3. Set Auth Site URL to https://audemarpr.github.io/dead-frontier-outbreak/ and allow that redirect URL.
4. Put project URL and publishable key in online-config.js. Never publish service-role or secret keys.
5. Register in game and confirm email. Copy your user UUID from Authentication > Users. Run insert into public.admins(user_id) values ('YOUR-UUID'); in SQL Editor.
6. Test sign-in, upload and restore, then two separate accounts in lobby. Test admin denial for ordinary accounts.
Cloud saves are client-controlled, not authoritative. Lobby shares positions only, not combat, inventory or world state. Do not use for competitive multiplayer. No live backend has been provisioned.
