"use client";

import {
  ArrowRight,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  User,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";

import { adminLogin, setAdminSession } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

export function AdminLoginForm() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(
    "Введите админский логин и пароль. Сессия хранится локально в браузере.",
  );
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedLogin = login.trim();
    if (!normalizedLogin || !password) {
      setMessage("Заполните логин и пароль.");
      return;
    }

    setIsLoading(true);
    setMessage("Проверяем учетные данные...");

    try {
      const { response, data } = await adminLogin(normalizedLogin, password);
      if (!response.ok || !data) {
        const fallback =
          response.status === 403
            ? "Доступ к админке отключен."
            : "Не удалось войти. Проверьте данные и попробуйте снова.";
        setMessage(fallback);
        setIsLoading(false);
        return;
      }

      setAdminSession(data, data.admin);
      setMessage("Вход выполнен.");
      router.replace("/admin");
      router.refresh();
    } catch {
      setMessage("Сервер недоступен. Попробуйте позже.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="panel-glow w-full max-w-md rounded-[1.75rem] border border-white/10 bg-panel/90 p-5 backdrop-blur-xl sm:p-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10">
          <ShieldCheck className="size-5 text-primary" />
        </div>
        <div>
          <p className="font-pixel text-[10px] uppercase tracking-[0.24em] text-primary">
            Admin login
          </p>
          <h1 className="mt-2 text-2xl font-black text-white">
            Вход в админку
          </h1>
        </div>
      </div>

      <form
        className="mt-6 space-y-4"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <label
          className="block text-sm font-medium text-white/72"
          htmlFor="login"
        >
          Логин
        </label>
        <div className="relative">
          <User className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-primary/65" />
          <input
            id="login"
            autoComplete="username"
            className={cn(
              "w-full rounded-2xl border border-white/10 bg-black/35 py-3.5 pl-11 pr-4 text-base text-white outline-none transition focus:border-primary/60 focus:bg-black/50 focus-visible:ring-2 focus-visible:ring-primary/40",
              isLoading && "cursor-not-allowed opacity-80",
            )}
            disabled={isLoading}
            placeholder="superadmin"
            value={login}
            onChange={(event) => setLogin(event.target.value)}
          />
        </div>

        <label
          className="block text-sm font-medium text-white/72"
          htmlFor="password"
        >
          Пароль
        </label>
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-primary/65" />
          <input
            id="password"
            autoComplete="current-password"
            className={cn(
              "w-full rounded-2xl border border-white/10 bg-black/35 py-3.5 pl-11 pr-4 text-base text-white outline-none transition focus:border-primary/60 focus:bg-black/50 focus-visible:ring-2 focus-visible:ring-primary/40",
              isLoading && "cursor-not-allowed opacity-80",
            )}
            disabled={isLoading}
            placeholder="••••••••"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <button
          className="btn-hero glow-primary w-full rounded-2xl bg-white/5"
          type="submit"
        >
          {isLoading ? (
            <>
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin"
              />
              Входим
            </>
          ) : (
            <>
              <span>Войти</span>
              <ArrowRight aria-hidden="true" className="size-4" />
            </>
          )}
        </button>
      </form>

      <div className="mt-5 rounded-3xl border border-white/10 bg-white/3 p-4 text-sm leading-6 text-white/70">
        {message}
      </div>
    </section>
  );
}
