import * as supabaseAuth from "@/services/supabase/auth";
import * as supabaseOrganizations from "@/services/supabase/organizations";
import * as supabaseUsers from "@/services/supabase/users";
import * as supabaseInvites from "@/services/supabase/invites";
import { validateSetupSecret } from "@/services/secretApi";
import type { User, Organization, UserRole } from "@/types/auth";

// Hash function using Web Crypto API
async function hashToken(token: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(token);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Generate secure token
function generateToken(): string {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface LoginParams {
	email: string;
	password: string;
}

export interface RegisterCompanyParams {
	email: string;
	password: string;
	fullName: string;
	organizationName: string;
	companySecret: string;
}

export interface RegisterUserParams {
	email: string;
	password: string;
	fullName: string;
	inviteToken: string;
}

export interface CreateInviteParams {
	email: string;
	role: UserRole;
	orgId: string;
}

export interface InviteResult {
	inviteId: string;
	token: string;
	expiresAt: Date;
}

export interface UserProfile {
	user: User;
	organization: Organization;
}

// Validate company registration secret via server
async function validateCompanySecret(secret: string): Promise<boolean> {
	return validateSetupSecret(secret);
}

// Login
export async function login(params: LoginParams): Promise<void> {
	const { error } = await supabaseAuth.signIn(params.email, params.password);
	if (error) {
		throw new Error(error.message);
	}
}

// Register new company (admin + org)
export async function registerCompany(
	params: RegisterCompanyParams
): Promise<void> {
	// Validate company secret via server
	const isValid = await validateCompanySecret(params.companySecret);
	if (!isValid) {
		throw new Error("Invalid company registration code");
	}

	// Create organization first so we can pass org_id as metadata to signUp.
	// The handle_new_user trigger reads metadata and creates the users row
	// with SECURITY DEFINER (bypasses RLS), so no separate INSERT is needed.
	const { data: orgData, error: orgError } =
		await supabaseOrganizations.createOrganization(params.organizationName);

	if (orgError || !orgData) {
		throw new Error(orgError?.message || "Failed to create organization");
	}

	// Create auth user — trigger uses metadata to create the users row
	const { data: authData, error: authError } = await supabaseAuth.signUp(
		params.email,
		params.password,
		{
			full_name: params.fullName,
			org_id: orgData.org_id,
			role: "admin",
		}
	);

	if (authError || !authData?.user) {
		await supabaseOrganizations.deleteOrganization(orgData.org_id);
		throw new Error(authError?.message || "Failed to create account");
	}
}

// Register user via invite
export async function registerUser(params: RegisterUserParams): Promise<void> {
	// Hash the token and look up invite
	const tokenHash = await hashToken(params.inviteToken);
	const { data: invite, error: inviteError } =
		await supabaseInvites.getInviteByTokenHash(tokenHash);

	if (inviteError || !invite) {
		throw new Error("Invalid or expired invitation");
	}

	// Check if invite is expired
	if (new Date(invite.expires_at) < new Date()) {
		throw new Error("Invitation has expired");
	}

	// Check email matches
	if (invite.email.toLowerCase() !== params.email.toLowerCase()) {
		throw new Error("Email does not match invitation");
	}

	// Create auth user — pass invite data as metadata so the handle_new_user
	// trigger (SECURITY DEFINER) creates the users row with the correct org
	// and role. This avoids a separate INSERT after signUp, which would fail
	// in production Supabase because email confirmation leaves no active
	// session (auth.uid() = NULL → RLS blocks the INSERT).
	const { data: authData, error: authError } = await supabaseAuth.signUp(
		params.email,
		params.password,
		{
			full_name: params.fullName,
			org_id: invite.org_id,
			role: invite.role,
		}
	);

	if (authError || !authData?.user) {
		throw new Error(authError?.message || "Failed to create account");
	}
}

// Create invitation (admin only)
export async function createInvite(
	params: CreateInviteParams
): Promise<InviteResult> {
	const token = generateToken();
	const tokenHash = await hashToken(token);
	const expiresAt = new Date();
	expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

	const { data, error } = await supabaseInvites.createInvite({
		orgId: params.orgId,
		email: params.email,
		role: params.role,
		tokenHash,
		expiresAt,
	});

	if (error || !data) {
		throw new Error(error?.message || "Failed to create invitation");
	}

	return {
		inviteId: data.id,
		token, // Return raw token, NOT hash
		expiresAt,
	};
}

// Validate invite token (for registration page)
export async function validateInvite(token: string): Promise<{
	email: string;
	orgId: string;
	role: UserRole;
} | null> {
	const tokenHash = await hashToken(token);
	const { data: invite, error } = await supabaseInvites.getInviteByTokenHash(
		tokenHash
	);

	if (error || !invite) {
		return null;
	}

	if (new Date(invite.expires_at) < new Date()) {
		return null;
	}

	return {
		email: invite.email,
		orgId: invite.org_id,
		role: invite.role,
	};
}

// Logout
export async function logout(): Promise<void> {
	const { error } = await supabaseAuth.signOut();
	if (error) {
		throw new Error(error.message);
	}
}

// Fetch user profile with organization
export async function fetchUserProfile(
	userId: string,
	email?: string
): Promise<UserProfile | null> {
	const { data: userData, error: userError } = await supabaseUsers.getUserById(
		userId
	);

	if (userError || !userData) {
		return null;
	}

	const { data: orgData, error: orgError } =
		await supabaseOrganizations.getOrganizationById(userData.org_id);

	if (orgError || !orgData) {
		return null;
	}

	return {
		user: { ...userData, email },
		organization: orgData,
	};
}

// Get current session
export async function getSession() {
	return supabaseAuth.getSession();
}

// Subscribe to auth changes
export function onAuthStateChange(
	callback: (userId: string | null, email?: string) => void
) {
	return supabaseAuth.onAuthStateChange((session) => {
		if (session?.user) {
			callback(session.user.id, session.user.email ?? undefined);
		} else {
			callback(null);
		}
	});
}
