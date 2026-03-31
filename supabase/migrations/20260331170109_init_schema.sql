-- ====================================================
-- COMPLETE DATABASE SCHEMA - Automated SDR
-- Consolidated Initial Migration
-- ====================================================

-- ====================================================
-- 1. UTILITY FUNCTIONS & ENUMS
-- ====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TYPE user_role AS ENUM ('admin', 'employee');
CREATE TYPE call_end_reason AS ENUM ('completed', 'abrupt', 'voicemail');
CREATE TYPE call_direction AS ENUM ('inbound', 'outbound');


-- ====================================================
-- 2. TABLES
-- ====================================================

-- organizations
CREATE TABLE IF NOT EXISTS organizations (
    org_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

CREATE INDEX idx_organizations_name ON organizations(name);

CREATE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE organizations IS 'Multi-tenant organizations for user grouping and data isolation';


-- users
CREATE TABLE IF NOT EXISTS users (
    user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name     TEXT NOT NULL,
    org_id        UUID NOT NULL REFERENCES organizations(org_id) ON DELETE RESTRICT,
    role          user_role NOT NULL DEFAULT 'employee',
    is_superadmin BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at    TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

CREATE INDEX idx_users_org_id ON users(org_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_superadmin ON users(is_superadmin) WHERE is_superadmin = true;

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE users IS 'Application users linked to Supabase Auth with multi-tenant organization support';
COMMENT ON COLUMN users.is_superadmin IS 'Superadmin users have elevated privileges across all organizations. Set directly in database.';


-- invites
CREATE TABLE IF NOT EXISTS invites (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    role        user_role NOT NULL DEFAULT 'employee',
    token_hash  TEXT NOT NULL,
    used_at     TIMESTAMP WITH TIME ZONE,
    expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,

    CONSTRAINT invites_unique_pending UNIQUE (org_id, email, used_at)
);

CREATE INDEX idx_invites_token_hash ON invites(token_hash);
CREATE INDEX idx_invites_org_id ON invites(org_id);
CREATE INDEX idx_invites_email ON invites(email);

COMMENT ON TABLE invites IS 'User invitations for joining organizations';


-- phone_numbers
CREATE TABLE IF NOT EXISTS phone_numbers (
    phone_number TEXT PRIMARY KEY,
    org_id       UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
    label        TEXT,
    direction    call_direction NOT NULL DEFAULT 'inbound',
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

CREATE INDEX idx_phone_numbers_org_id ON phone_numbers(org_id);
CREATE INDEX idx_phone_numbers_direction ON phone_numbers(direction);

COMMENT ON TABLE phone_numbers IS 'Phone numbers assigned to organizations. Each number belongs to one org.';


-- calls
CREATE TABLE IF NOT EXISTS calls (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    caller_number       TEXT NOT NULL,
    agent_phone_number  TEXT NOT NULL DEFAULT '',
    org_id              UUID REFERENCES organizations(org_id) ON DELETE SET NULL,
    call_direction      call_direction NOT NULL DEFAULT 'outbound',
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    ended_at            TIMESTAMP WITH TIME ZONE,
    end_reason          call_end_reason,
    call_transferred    BOOLEAN DEFAULT FALSE,
    tools_called        TEXT[] DEFAULT '{}',
    transcription       TEXT,
    recording_url       TEXT,
    analytics           JSONB DEFAULT '{}',
    call_analysis       JSONB DEFAULT NULL
);

CREATE INDEX idx_calls_caller_number    ON calls(caller_number);
CREATE INDEX idx_calls_org_id           ON calls(org_id);
CREATE INDEX idx_calls_created_at       ON calls(created_at DESC);
CREATE INDEX idx_calls_call_direction   ON calls(call_direction);
CREATE INDEX idx_calls_end_reason       ON calls(end_reason);
CREATE INDEX idx_calls_agent_phone      ON calls(agent_phone_number);

CREATE TRIGGER update_calls_updated_at
    BEFORE UPDATE ON calls
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE calls IS 'Voice call sessions with transcription, analytics, and tool usage';


-- bot_prompts
CREATE TABLE IF NOT EXISTS bot_prompts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
    name        TEXT NOT NULL DEFAULT 'Default',
    system_prompt TEXT NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

CREATE UNIQUE INDEX idx_one_active_prompt_per_org
    ON bot_prompts (org_id)
    WHERE is_active = true;

CREATE INDEX idx_bot_prompts_org_id ON bot_prompts(org_id);

CREATE TRIGGER update_bot_prompts_updated_at
    BEFORE UPDATE ON bot_prompts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE bot_prompts IS 'Per-organization system prompts for the AI bot.';


-- bot_tools
CREATE TABLE IF NOT EXISTS bot_tools (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
    tool_name   TEXT NOT NULL,
    enabled     BOOLEAN NOT NULL DEFAULT true,
    settings    JSONB NOT NULL DEFAULT '{}',
    label       TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,

    CONSTRAINT bot_tools_org_tool_unique UNIQUE (org_id, tool_name)
);

CREATE INDEX idx_bot_tools_org_id ON bot_tools(org_id);
CREATE INDEX idx_bot_tools_org_tool ON bot_tools(org_id, tool_name);

CREATE TRIGGER update_bot_tools_updated_at
    BEFORE UPDATE ON bot_tools
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE bot_tools IS 'Per-organization bot tool configuration.';


-- ====================================================
-- 3. RLS HELPER FUNCTIONS (Anti-Recursion)
-- ====================================================

CREATE OR REPLACE FUNCTION public.my_org_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT org_id FROM public.users WHERE user_id = auth.uid(); $$;

CREATE OR REPLACE FUNCTION public.my_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role::TEXT FROM public.users WHERE user_id = auth.uid(); $$;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COALESCE(is_superadmin, false) FROM public.users WHERE user_id = auth.uid(); $$;


-- ====================================================
-- 4. ROW LEVEL SECURITY POLICIES
-- ====================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_tools ENABLE ROW LEVEL SECURITY;

-- organizations
CREATE POLICY "anyone_can_read_orgs" ON organizations FOR SELECT USING (true);
CREATE POLICY "anyone_can_create_orgs" ON organizations FOR INSERT WITH CHECK (true);
CREATE POLICY "admins_can_update_org" ON organizations FOR UPDATE USING (
    org_id = public.my_org_id() AND public.my_role() = 'admin' OR public.is_superadmin()
);

-- users
CREATE POLICY "users_select" ON users FOR SELECT USING (
    user_id = auth.uid() OR org_id = public.my_org_id() OR public.is_superadmin()
);
CREATE POLICY "users_insert" ON users FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "users_update" ON users FOR UPDATE USING (
    user_id = auth.uid() OR (public.my_role() = 'admin' AND org_id = public.my_org_id())
);

-- invites
CREATE POLICY "invites_admin_manage" ON invites FOR ALL USING (
    (org_id = public.my_org_id() AND public.my_role() = 'admin') OR public.is_superadmin()
);
CREATE POLICY "anyone_can_read_invite_by_token" ON invites FOR SELECT USING (true);

-- phone_numbers
CREATE POLICY "phone_numbers_select" ON phone_numbers FOR SELECT USING (
    org_id = public.my_org_id() OR public.is_superadmin()
);
CREATE POLICY "phone_numbers_insert" ON phone_numbers FOR INSERT WITH CHECK (
    (org_id = public.my_org_id() AND public.my_role() = 'admin') OR public.is_superadmin()
);
CREATE POLICY "phone_numbers_update" ON phone_numbers FOR UPDATE USING (
    (org_id = public.my_org_id() AND public.my_role() = 'admin') OR public.is_superadmin()
);
CREATE POLICY "phone_numbers_delete" ON phone_numbers FOR DELETE USING (
    (org_id = public.my_org_id() AND public.my_role() = 'admin') OR public.is_superadmin()
);

-- calls
CREATE POLICY "calls_select" ON calls FOR SELECT USING (
    org_id = public.my_org_id() OR public.is_superadmin()
);
CREATE POLICY "service_insert" ON calls FOR INSERT WITH CHECK (true);
CREATE POLICY "service_update" ON calls FOR UPDATE USING (true);

-- bot_prompts
CREATE POLICY "bot_prompts_select" ON bot_prompts FOR SELECT USING (
    org_id = public.my_org_id() OR public.is_superadmin()
);
CREATE POLICY "bot_prompts_insert" ON bot_prompts FOR INSERT WITH CHECK (
    (org_id = public.my_org_id() AND public.my_role() = 'admin') OR public.is_superadmin()
);
CREATE POLICY "bot_prompts_update" ON bot_prompts FOR UPDATE USING (
    (org_id = public.my_org_id() AND public.my_role() = 'admin') OR public.is_superadmin()
);
CREATE POLICY "bot_prompts_delete" ON bot_prompts FOR DELETE USING (
    (org_id = public.my_org_id() AND public.my_role() = 'admin') OR public.is_superadmin()
);

-- bot_tools
CREATE POLICY "bot_tools_select" ON bot_tools FOR SELECT USING (
    org_id = public.my_org_id() OR public.is_superadmin()
);
CREATE POLICY "bot_tools_insert" ON bot_tools FOR INSERT WITH CHECK (
    (org_id = public.my_org_id() AND public.my_role() = 'admin') OR public.is_superadmin()
);
CREATE POLICY "bot_tools_update" ON bot_tools FOR UPDATE USING (
    (org_id = public.my_org_id() AND public.my_role() = 'admin') OR public.is_superadmin()
);


-- ====================================================
-- 5. AUTOMATION TRIGGERS (Auth & Seeds)
-- ====================================================

-- Handle new user creation and invite redemption
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_role   user_role;
BEGIN
  v_org_id := COALESCE(
    (NEW.raw_user_meta_data->>'org_id')::UUID,
    (SELECT org_id FROM public.organizations ORDER BY created_at LIMIT 1)
  );

  v_role := COALESCE(
    (NEW.raw_user_meta_data->>'role')::user_role,
    'employee'
  );

  INSERT INTO public.users (user_id, full_name, org_id, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    v_org_id,
    v_role
  )
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    org_id    = EXCLUDED.org_id,
    role      = EXCLUDED.role;

  IF NEW.raw_user_meta_data->>'org_id' IS NOT NULL THEN
    UPDATE public.invites
    SET used_at = NOW()
    WHERE email      = NEW.email
      AND org_id     = v_org_id
      AND used_at    IS NULL
      AND expires_at > NOW();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- Auto-seed bot tools for new organizations
CREATE OR REPLACE FUNCTION seed_default_tools_for_org()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.bot_tools (org_id, tool_name, enabled, settings, label, description)
    VALUES
        (NEW.org_id, 'transfer_to_human', true, '{"transfer_number": null}'::jsonb, 'Transfer to Human', 'Bridge the caller to a live agent via SIP transfer when they request it or show strong interest'),
        (NEW.org_id, 'end_call', true, '{}'::jsonb, 'End Call', 'Gracefully hang up the call after a farewell message when the conversation concludes'),
        (NEW.org_id, 'send_email', true, '{"recipient_email": null, "subject": "Automated SDR Query"}'::jsonb, 'Send Email', 'Send an automated follow-up email to a configured recipient on behalf of the caller'),
        (NEW.org_id, 'submit_call_analysis', true, '{}'::jsonb, 'Call Analysis', 'Analyze call outcomes, sentiment, and prospect interest at the end of each conversation')
    ON CONFLICT (org_id, tool_name) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_org_created_seed_tools
    AFTER INSERT ON public.organizations
    FOR EACH ROW
    EXECUTE FUNCTION seed_default_tools_for_org();


-- ====================================================
-- 6. PERMISSIONS & GRANTS
-- ====================================================

-- Function Grants
GRANT EXECUTE ON FUNCTION public.my_org_id() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.my_role() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;

-- Table Grants
GRANT SELECT, INSERT, UPDATE ON organizations TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON users TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON invites TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON bot_prompts TO authenticated;
GRANT SELECT ON bot_prompts TO anon;

GRANT SELECT, INSERT, UPDATE ON bot_tools TO authenticated;
GRANT SELECT ON bot_tools TO anon;