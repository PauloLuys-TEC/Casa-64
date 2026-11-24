BEGIN;
CREATE SCHEMA casa64_private;
REVOKE ALL ON SCHEMA casa64_private FROM PUBLIC, anon, authenticated;
SET LOCAL search_path TO casa64_private, pg_catalog;

CREATE TABLE auth_windows (
	bucket text PRIMARY KEY NOT NULL,
	attempts bigint NOT NULL,
	expires_at bigint NOT NULL
);

CREATE INDEX auth_windows_expiry ON auth_windows (expires_at);

CREATE TABLE students (
	id text PRIMARY KEY NOT NULL,
	handle text NOT NULL,
	username text NOT NULL,
	password_hash text NOT NULL,
	created_at bigint NOT NULL
);

CREATE UNIQUE INDEX students_handle_unique ON students (handle);

CREATE TABLE study_ticks (
	student_id text NOT NULL,
	event_id text NOT NULL,
	lesson_id text NOT NULL,
	seconds bigint NOT NULL,
	credited_through bigint NOT NULL,
	PRIMARY KEY(student_id, event_id),
	FOREIGN KEY (student_id) REFERENCES students(id) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX study_ticks_by_lesson ON study_ticks (student_id,lesson_id,seconds);

CREATE INDEX study_ticks_latest ON study_ticks (student_id,credited_through);

CREATE TABLE sessions (
	token_hash text PRIMARY KEY NOT NULL,
	student_id text NOT NULL,
	platform_id text NOT NULL,
	expires_at bigint NOT NULL,
	FOREIGN KEY (student_id) REFERENCES students(id) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX sessions_expiry ON sessions (expires_at);

ALTER TABLE auth_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_ticks ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.casa64_storage(operations jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, casa64_private, pg_temp
AS $storage$
DECLARE
  operation jsonb;
  args jsonb;
  rows_out jsonb;
  changes bigint;
  responses jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(operations) IS DISTINCT FROM 'array' OR jsonb_array_length(operations) NOT BETWEEN 1 AND 8 THEN
    RAISE EXCEPTION 'Invalid storage batch' USING ERRCODE = '22023';
  END IF;
  FOR operation IN SELECT value FROM jsonb_array_elements(operations) LOOP
    args := operation -> 'args';
    rows_out := '[]'::jsonb;
    changes := 0;
    CASE operation ->> 'name'
      WHEN 'increase_limit' THEN
        WITH result AS (INSERT INTO auth_windows (bucket, attempts, expires_at) VALUES ((args ->> 0), 1, (args ->> 1)::bigint)
             ON CONFLICT(bucket) DO UPDATE SET
               attempts = CASE WHEN auth_windows.expires_at <= (args ->> 2)::bigint THEN 1 ELSE auth_windows.attempts + 1 END,
               expires_at = CASE WHEN auth_windows.expires_at <= (args ->> 2)::bigint THEN excluded.expires_at ELSE auth_windows.expires_at END
             RETURNING attempts, expires_at)
        SELECT coalesce(jsonb_agg(to_jsonb(result)), '[]'::jsonb) INTO rows_out FROM result;
      WHEN 'sweep_limits' THEN
        DELETE FROM auth_windows WHERE bucket IN (SELECT bucket FROM auth_windows WHERE expires_at <= (args ->> 0)::bigint LIMIT 50);
        GET DIAGNOSTICS changes = ROW_COUNT;
      WHEN 'study_times' THEN
        SELECT coalesce(jsonb_agg(to_jsonb(result)), '[]'::jsonb) INTO rows_out
        FROM (SELECT lesson_id, SUM(seconds) AS seconds FROM study_ticks WHERE student_id = (args ->> 0) GROUP BY lesson_id) AS result;
      WHEN 'find_student' THEN
        SELECT coalesce(jsonb_agg(to_jsonb(result)), '[]'::jsonb) INTO rows_out
        FROM (SELECT id, username, password_hash FROM students WHERE handle = (args ->> 0)) AS result;
      WHEN 'add_student' THEN
        INSERT INTO students (id, handle, username, password_hash, created_at) VALUES ((args ->> 0), (args ->> 1), (args ->> 2), (args ->> 3), (args ->> 4)::bigint) ON CONFLICT(handle) DO NOTHING;
        GET DIAGNOSTICS changes = ROW_COUNT;
      WHEN 'add_session' THEN
        INSERT INTO sessions (token_hash, student_id, platform_id, expires_at)
             SELECT (args ->> 0), id, (args ->> 1), (args ->> 2)::bigint FROM students WHERE id = (args ->> 3);
        GET DIAGNOSTICS changes = ROW_COUNT;
      WHEN 'reset_limit' THEN
        DELETE FROM auth_windows WHERE bucket = (args ->> 0);
        GET DIAGNOSTICS changes = ROW_COUNT;
      WHEN 'replace_session' THEN
        DELETE FROM sessions WHERE token_hash = (args ->> 0) AND platform_id = (args ->> 1) AND EXISTS (SELECT 1 FROM students WHERE id = (args ->> 2));
        GET DIAGNOSTICS changes = ROW_COUNT;
      WHEN 'sweep_sessions' THEN
        DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions WHERE expires_at <= (args ->> 0)::bigint LIMIT 50);
        GET DIAGNOSTICS changes = ROW_COUNT;
      WHEN 'add_study_tick' THEN
        PERFORM pg_advisory_xact_lock(hashtextextended(args ->> 1, 0));
        WITH anchor AS (
               SELECT GREATEST((args ->> 0)::bigint - 120, COALESCE(
                 (SELECT MAX(credited_through) FROM study_ticks WHERE student_id = (args ->> 1)), (args ->> 2)::bigint
               )) AS value
             ), credit AS (
               SELECT value, LEAST((args ->> 3)::bigint, GREATEST(0, (args ->> 0)::bigint - value)) AS seconds FROM anchor
             )
             INSERT INTO study_ticks (student_id, event_id, lesson_id, seconds, credited_through)
             SELECT (args ->> 1), (args ->> 4), (args ->> 5), seconds, value + seconds FROM credit WHERE true
             ON CONFLICT(student_id, event_id) DO NOTHING;
        GET DIAGNOSTICS changes = ROW_COUNT;
      WHEN 'lesson_time' THEN
        SELECT coalesce(jsonb_agg(to_jsonb(result)), '[]'::jsonb) INTO rows_out
        FROM (SELECT COALESCE(SUM(seconds), 0) AS seconds FROM study_ticks WHERE student_id = (args ->> 0) AND lesson_id = (args ->> 1)) AS result;
      WHEN 'remove_session' THEN
        DELETE FROM sessions WHERE token_hash = (args ->> 0) AND platform_id = (args ->> 1);
        GET DIAGNOSTICS changes = ROW_COUNT;
      WHEN 'find_session' THEN
        SELECT coalesce(jsonb_agg(to_jsonb(result)), '[]'::jsonb) INTO rows_out
        FROM (SELECT students.id, students.username, students.created_at FROM sessions
               JOIN students ON sessions.student_id = students.id
               WHERE token_hash = (args ->> 0) AND platform_id = (args ->> 1) AND expires_at > (args ->> 2)::bigint) AS result;
      ELSE RAISE EXCEPTION 'Unknown storage operation' USING ERRCODE = '22023';
    END CASE;
    responses := responses || jsonb_build_array(jsonb_build_object(
      'results', rows_out, 'meta', jsonb_build_object('changes', changes)));
  END LOOP;
  RETURN responses;
END;
$storage$;
REVOKE ALL ON FUNCTION public.casa64_storage(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.casa64_storage(jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;

