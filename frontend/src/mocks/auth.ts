import { http } from "msw";
import type { Role } from "../api/types";
import { base, denied, ok, problem } from "./responses";

const roleKey = "yixue.dev.role";
const emailKey = "yixue.dev.email";
const challenges = new Map<
  string,
  { id: string; sent: number; attempts: number }
>();
const expiresIn = 300;
const resendAfter = 30;

export function role(): Role | null {
  const value = sessionStorage.getItem(roleKey);
  return value === "admin" || value === "user" ? value : null;
}

export function sessionEmail() {
  const currentRole = role();
  return currentRole
    ? (sessionStorage.getItem(emailKey) ??
        `${currentRole === "admin" ? "admin" : "student"}@example.test`)
    : null;
}

function user(email: string, currentRole: Role) {
  return {
    id: `dev-${email}`,
    display_name: currentRole === "admin" ? "演示管理员" : "演示同学",
    email,
    role: currentRole,
  };
}

export const authHandlers = [
  http.get(`${base}/auth/me`, () => {
    const currentRole = role();
    const email = sessionEmail();
    return currentRole && email ? ok(user(email, currentRole)) : denied();
  }),
  http.post(`${base}/auth/start`, async ({ request }) => {
    const body = (await request.json()) as { email?: string };
    const email = body.email?.trim().toLowerCase() ?? "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return problem(422, "VALIDATION_ERROR", "请输入有效的邮箱地址。");
    const now = Date.now();
    const previous = challenges.get(email);
    if (previous && now - previous.sent < resendAfter * 1000)
      return problem(429, "RATE_LIMITED", "发送过于频繁，请稍后重试。");
    for (const [address, challenge] of challenges)
      if (now - challenge.sent >= expiresIn * 1000) challenges.delete(address);
    const id = crypto.randomUUID();
    challenges.set(email, { id, sent: now, attempts: 0 });
    return ok({
      mode: "code",
      challenge_id: id,
      expires_in: expiresIn,
      resend_after: resendAfter,
    });
  }),
  http.post(`${base}/auth/verify`, async ({ request }) => {
    const body = (await request.json()) as {
      challenge_id?: string;
      code?: string;
    };
    const entry = [...challenges].find(
      ([, value]) => value.id === body.challenge_id,
    );
    if (!entry || Date.now() - entry[1].sent >= expiresIn * 1000)
      return problem(409, "CHALLENGE_EXPIRED", "验证码已失效，请重新发送。");
    const [email, challenge] = entry;
    if (challenge.attempts >= 5)
      return problem(429, "RATE_LIMITED", "验证码错误次数过多，请重新发送。");
    if (body.code !== "123456") {
      challenge.attempts++;
      return problem(422, "INVALID_CODE", "验证码不正确，请重新输入。");
    }
    const currentRole = email === "admin@example.test" ? "admin" : "user";
    challenges.delete(email);
    sessionStorage.setItem(roleKey, currentRole);
    sessionStorage.setItem(emailKey, email);
    return ok(user(email, currentRole));
  }),
  http.post(`${base}/auth/logout`, () => {
    sessionStorage.removeItem(roleKey);
    sessionStorage.removeItem(emailKey);
    return ok(null);
  }),
];
