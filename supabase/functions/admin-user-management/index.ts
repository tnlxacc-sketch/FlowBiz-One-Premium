import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const allowedOrigin = "https://flowbiz-one-premium.tnlx-acc.chatgpt.site";
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const roles = new Set(["SALES", "WAREHOUSE", "LOGISTICS", "WAREHOUSE_LOGISTICS", "OWNER", "ADMIN"]);
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: corsHeaders });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authorization = req.headers.get("Authorization") || "";
  const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const service = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    const { data: callerData, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerData.user) return json(401, { error: "AUTH_REQUIRED" });
    const callerId = callerData.user.id;
    const body = await req.json();
    const action = String(body.action || "").toUpperCase();
    const platformCreate = action === "CREATE_TENANT_ADMIN";
    const { data: caller, error: profileError } = await service.from("user_profiles")
      .select("company_id,app_role,active,must_change_password").eq("user_id", callerId).single();
    if (profileError || !caller?.active || caller.app_role !== "ADMIN" || caller.must_change_password) {
      return json(403, { error: "ROLE_NOT_ALLOWED" });
    }
    if (platformCreate) {
      const { data: allowed, error } = await callerClient.rpc("is_platform_admin");
      if (error || allowed !== true || !body.company_id) return json(403, { error: "PLATFORM_ADMIN_REQUIRED" });
    }
    const companyId = platformCreate ? String(body.company_id) : caller.company_id;
    const { data: company, error: companyError } = await service.from("companies")
      .select("id,active,subscription_status,trial_ends_at,max_users,is_demo").eq("id", companyId).single();
    if (companyError || !company?.active || ["SUSPENDED", "EXPIRED"].includes(company.subscription_status)) {
      return json(403, { error: "COMPANY_INACTIVE" });
    }
    if (platformCreate && company.is_demo) return json(403, { error: "ROLE_NOT_ALLOWED" });
    const password = String(body.temporary_password || "");
    if (password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      return json(400, { error: "INVALID_TEMPORARY_PASSWORD" });
    }

    if (action === "CREATE_USER" || platformCreate) {
      const email = String(body.email || "").trim().toLowerCase();
      const fullName = String(body.full_name || "").trim();
      const employeeCode = String(body.employee_code || "").trim();
      const role = String(body.app_role || "").toUpperCase();
      if (!/^\S+@\S+\.\S+$/.test(email) || !fullName || !employeeCode || !roles.has(role) || (platformCreate && role !== "ADMIN")) {
        return json(400, { error: "INVALID_USER_DATA" });
      }
      const { count } = await service.from("user_profiles").select("user_id", { count: "exact", head: true })
        .eq("company_id", companyId).eq("active", true);
      if ((count || 0) >= Number(company.max_users || 0)) return json(409, { error: "USER_LIMIT_REACHED" });

      let existingUser: { id: string; email?: string } | undefined;
      for (let page = 1; page <= 20 && !existingUser; page++) {
        const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        existingUser = data.users.find((user) => user.email?.toLowerCase() === email);
        if (data.users.length < 1000) break;
      }

      let userId: string;
      let createdNew = false;
      if (existingUser) {
        userId = existingUser.id;
        const { data: existingProfile } = await service.from("user_profiles").select("company_id").eq("user_id", userId).maybeSingle();
        if (existingProfile?.company_id === companyId) return json(409, { error: "USER_ALREADY_EXISTS" });
        if (existingProfile) return json(409, { error: "EMAIL_IN_ANOTHER_COMPANY" });
        const { error } = await service.auth.admin.updateUserById(userId, {
          password, email_confirm: true,
          user_metadata: { full_name: fullName, employee_code: employeeCode },
          app_metadata: { company_id: companyId, app_role: role },
        });
        if (error) throw error;
      } else {
        const { data, error } = await service.auth.admin.createUser({
          email, password, email_confirm: true,
          user_metadata: { full_name: fullName, employee_code: employeeCode },
          app_metadata: { company_id: companyId, app_role: role },
        });
        if (error || !data.user) throw error || new Error("CREATE_USER_FAILED");
        userId = data.user.id;
        createdNew = true;
      }

      const requiredAt = new Date().toISOString();
      const { error: insertError } = await service.from("user_profiles").insert({
        user_id: userId, company_id: companyId, employee_code: employeeCode,
        full_name: fullName, app_role: role, active: true, must_change_password: true,
        password_change_required_at: requiredAt,
      });
      if (insertError) {
        if (createdNew) await service.auth.admin.deleteUser(userId);
        throw insertError;
      }
      await service.from("access_requests").update({ status: "APPROVED", reviewed_at: requiredAt, reviewed_by: callerId })
        .eq("user_id", userId).eq("company_id", companyId).eq("status", "PENDING");
      await service.from("audit_logs").insert({
        company_id: companyId, user_id: callerId, action: platformCreate ? "PLATFORM_CREATE_TENANT_ADMIN" : "ADMIN_CREATE_USER",
        entity_type: "USER", entity_id: userId, after_data: { email, employee_code: employeeCode, role, attached_existing_auth: !createdNew },
      });
      return json(200, { user_id: userId, email, app_role: role, attached_existing_auth: !createdNew });
    }

    if (action === "RESET_PASSWORD") {
      const targetId = String(body.user_id || "");
      if (!targetId || targetId === callerId) return json(400, { error: "CANNOT_RESET_OWN_PASSWORD" });
      const { data: target, error: targetError } = await service.from("user_profiles")
        .select("user_id,company_id,full_name").eq("user_id", targetId).eq("company_id", caller.company_id).single();
      if (targetError || !target) return json(404, { error: "USER_NOT_FOUND" });
      const { error: updateError } = await service.auth.admin.updateUserById(targetId, { password });
      if (updateError) throw updateError;
      const requiredAt = new Date().toISOString();
      const { error: flagError } = await service.from("user_profiles").update({
        must_change_password: true, password_change_required_at: requiredAt,
      }).eq("user_id", targetId).eq("company_id", caller.company_id);
      if (flagError) throw flagError;
      await service.from("audit_logs").insert({
        company_id: caller.company_id, user_id: callerId, action: "ADMIN_RESET_USER_PASSWORD",
        entity_type: "USER", entity_id: targetId, after_data: { force_change: true },
      });
      return json(200, { user_id: targetId, full_name: target.full_name });
    }

    return json(400, { error: "INVALID_ACTION" });
  } catch (error) {
    console.error(error);
    return json(500, { error: "ADMIN_USER_OPERATION_FAILED", detail: error instanceof Error ? error.message : String(error) });
  }
});
