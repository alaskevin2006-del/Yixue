import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { api, mockEnabled } from "../api/client";
import { sessionQuery } from "../api/queries";
import { returnPath } from "../app/session";
import { Brand, Message } from "../components/ui";
import postcardPhoto from "../assets/login-postcard.webp";

export default function Login() {
  const queryClient = useQueryClient();
  const session = useQuery(sessionQuery);
  const { search } = useLocation();
  const destination = returnPath(search);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<{
    challenge_id: string;
    expires_in: number;
    resend_after: number;
    start: number;
  }>();
  const [now, setNow] = useState(Date.now);
  const send = useMutation({
    async mutationFn(address: string) {
      const result = await api.startEmailLogin(address, destination);
      if (result.mode !== "code" || !result.challenge_id)
        throw new Error("未能开始邮箱验证，请重试。");
      return result;
    },
    onSuccess(result) {
      const start = Date.now();
      setChallenge({ ...result, start });
      setNow(start);
      setCode("");
    },
  });
  const resend = Math.max(
    0,
    Math.ceil(
      ((challenge?.start ?? 0) + (challenge?.resend_after ?? 0) * 1000 - now) /
        1000,
    ),
  );
  const expires = Math.max(
    0,
    Math.ceil(
      ((challenge?.start ?? 0) + (challenge?.expires_in ?? 0) * 1000 - now) /
        1000,
    ),
  );
  const verify = useMutation({
    mutationFn: ({ id, value }: { id: string; value: string }) =>
      api.verifyEmail(id, value),
    onSuccess: (user) => queryClient.setQueryData(sessionQuery.queryKey, user),
  });

  const counting = expires > 0 || resend > 0;
  useEffect(() => {
    if (!counting) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [counting]);

  if (session.isPending) return <Message title="正在检查登录状态…" busy />;
  if (session.data) return <Navigate replace to={destination} />;

  return (
    <main className="login-page">
      <div className="login-frame">
        <div className="login-brand-slot">
          <Brand variant="login" />
        </div>
        <div className="login-intro">
          <div className="login-stamp">
            <figure className="login-stamp-inner">
              <span className="login-postmark" aria-hidden="true">
                SYSU
              </span>
              <img
                className="login-stamp-photo"
                src={postcardPhoto}
                alt="窗边书桌上的笔记本和茶杯"
              />
              <figcaption>
                <span>逸路同行</span> <span>学有所成</span>
              </figcaption>
            </figure>
          </div>
        </div>
        <section className="login-panel" aria-labelledby="login-heading">
          <div className="login-content">
            <h1 id="login-heading">登录逸学</h1>
            <p className="login-description muted">
              使用校内邮箱验证码登录，首次验证自动建号
            </p>
            <form
              className="login-actions"
              onSubmit={(event) => {
                event.preventDefault();
                if (send.isPending || verify.isPending) return;
                if (!challenge) send.mutate(email.trim());
                else if (code.trim() && expires)
                  verify.mutate({
                    id: challenge.challenge_id,
                    value: code.trim(),
                  });
              }}
            >
              <label className="form-field" htmlFor="login-email">
                校内邮箱
                <input
                  id="login-email"
                  className="field"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="netid@mail2.sysu.edu.cn"
                  required
                  readOnly={Boolean(challenge) || send.isPending}
                />
              </label>
              {challenge && (
                <>
                  <label className="form-field" htmlFor="login-code">
                    验证码
                    <input
                      className="field"
                      key={challenge.challenge_id}
                      id="login-code"
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      placeholder="输入邮箱验证码"
                      required
                    />
                  </label>
                  <div className="login-links">
                    <button
                      type="button"
                      className="text-link"
                      disabled={send.isPending || verify.isPending}
                      onClick={() => {
                        setChallenge(undefined);
                        send.reset();
                        verify.reset();
                        setCode("");
                      }}
                    >
                      更换邮箱
                    </button>
                    <button
                      type="button"
                      className="text-link"
                      disabled={
                        Boolean(resend) || send.isPending || verify.isPending
                      }
                      onClick={() => {
                        verify.reset();
                        send.mutate(email.trim());
                      }}
                    >
                      {resend ? `${resend} 秒后重发` : "重新发送"}
                    </button>
                  </div>
                  <p className="muted">
                    {expires
                      ? "请输入发送到该邮箱的验证码。"
                      : "验证码已过期，请重新发送。"}
                  </p>
                </>
              )}
              {(send.isError || verify.isError) && (
                <p role="alert" className="error-text">
                  {send.error?.message ?? verify.error?.message}
                </p>
              )}
              <button
                className="button primary"
                disabled={
                  send.isPending ||
                  verify.isPending ||
                  (Boolean(challenge) && !expires)
                }
                type="submit"
              >
                {send.isPending
                  ? "正在发送…"
                  : verify.isPending
                    ? "正在验证…"
                    : challenge
                      ? "验证并登录"
                      : "发送验证码"}
              </button>
            </form>
            <div className="login-footer">
              {mockEnabled && (
                <details className="mock-login-note">
                  <summary>本地演示账号</summary>
                  <div>
                    <p>
                      同学 <strong>student@example.test</strong>
                    </p>
                    <p>
                      管理员 <strong>admin@example.test</strong>
                    </p>
                    <p>
                      验证码 <strong>123456</strong>
                    </p>
                  </div>
                </details>
              )}
              <span>仅限校内师生</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
