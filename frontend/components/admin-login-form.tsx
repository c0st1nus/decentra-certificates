"use client";

import { ArrowRight, LoaderCircle, LockKeyhole, ShieldCheck, User } from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { AdminPanel } from "@/components/admin-panel";
import { adminLogin, setAdminSession } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

export function AdminLoginForm() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedLogin = login.trim();
    if (!normalizedLogin || !password) {
      toast.error("Введите логин и пароль.");
      return;
    }

    setIsLoading(true);

    try {
      const { response, data } = await adminLogin(normalizedLogin, password);
      if (!response.ok || !data) {
        const fallback =
          response.status === 403
            ? "Доступ в админку временно отключён."
            : "Не удалось войти. Проверьте логин и пароль.";
        toast.error(fallback);
        setIsLoading(false);
        return;
      }

      setAdminSession(data, data.admin);
      toast.success("Вход выполнен.");
      router.replace("/admin");
      router.refresh();
    } catch {
      toast.error("Сервер недоступен. Попробуйте ещё раз позже.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AdminPanel as="section" className="w-full max-w-md">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10">
          <ShieldCheck className="size-5 text-primary" />
        </div>
        <div>
          <p className="admin-eyebrow">Админка</p>
          <h1 className="mt-2 text-2xl font-black text-white">Вход в систему</h1>
        </div>
      </div>

      <form
        className="mt-6 space-y-4"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <label className="block text-sm font-medium text-white/80" htmlFor="login">
          Логин
        </label>
        <div className="relative">
          <User className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-primary/65" />
          <input
            id="login"
            autoComplete="username"
            className={cn(
              "admin-input admin-input-icon",
              isLoading && "cursor-not-allowed opacity-80",
            )}
            disabled={isLoading}
            placeholder="superadmin"
            value={login}
            onChange={(event) => setLogin(event.target.value)}
          />
        </div>

        <label className="block text-sm font-medium text-white/80" htmlFor="password">
          Пароль
        </label>
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-primary/65" />
          <input
            id="password"
            autoComplete="current-password"
            className={cn(
              "admin-input admin-input-icon",
              isLoading && "cursor-not-allowed opacity-80",
            )}
            disabled={isLoading}
            placeholder="••••••••"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <button className="btn-hero glow-primary w-full rounded-2xl bg-white/5" type="submit">
          {isLoading ? (
            <>
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
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
    </AdminPanel>
  );
}
