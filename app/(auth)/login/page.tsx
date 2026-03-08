"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="terminal-panel w-full max-w-md">
        <div className="panel-titlebar">
          <div className="flex gap-[5px]">
            <div className="w-[7px] h-[7px] rounded-full border border-gc-red bg-gc-red/30" />
            <div className="w-[7px] h-[7px] rounded-full border border-gc-amber bg-gc-amber/30" />
            <div className="w-[7px] h-[7px] rounded-full border border-gc-green bg-gc-green/30" />
          </div>
          <span className="text-[10px] text-gc-green tracking-[2px] font-medium">
            [ AUTH.LOGIN ]
          </span>
          <span className="text-[9px] text-gc-green-muted tracking-[1px]">
            SECURE
          </span>
        </div>

        <div className="relative z-[1] p-8">
          {/* ASCII Logo */}
          <pre className="font-vt text-[9px] leading-tight text-gc-green-dim text-center mb-6 select-none overflow-hidden">
{`████████╗██╗  ██╗███████╗
╚══██╔══╝██║  ██║██╔════╝
   ██║   ███████║█████╗
   ██║   ██╔══██║██╔══╝
   ██║   ██║  ██║███████╗
   ╚═╝   ╚═╝  ╚═╝╚══════╝
 ██████╗  ██████╗ ██╗     ██████╗
██╔════╝ ██╔═══██╗██║     ██╔══██╗
██║  ███╗██║   ██║██║     ██║  ██║
██║   ██║██║   ██║██║     ██║  ██║
╚██████╔╝╚██████╔╝███████╗██████╔╝
 ╚═════╝  ╚═════╝ ╚══════╝╚═════╝
  ██████╗██╗  ██╗ █████╗ ██╗███╗   ██╗
██╔════╝██║  ██║██╔══██╗██║████╗  ██║
██║     ███████║███████║██║██╔██╗ ██║
██║     ██╔══██║██╔══██║██║██║╚██╗██║
╚██████╗██║  ██║██║  ██║██║██║ ╚████║
 ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝`}
          </pre>

          <div className="text-[10px] text-gc-green-dim text-center tracking-[2px] mb-8">
            GHANA GOLD BOARD · REGULATORY NODE
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="text-[10px] text-gc-green-dim tracking-[1px] mb-4">
              $ thegoldchain auth --login
            </div>

            <div>
              <label className="text-[8px] text-gc-green-muted tracking-[1.5px] block mb-1">
                OPERATOR_EMAIL
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent border border-gc-border rounded-gc px-3 py-2 text-[11px] text-gc-green font-mono outline-none focus:border-gc-green-dim caret-gc-green"
                placeholder="operator@goldchain.io"
                required
              />
            </div>

            <div>
              <label className="text-[8px] text-gc-green-muted tracking-[1.5px] block mb-1">
                ACCESS_KEY
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-transparent border border-gc-border rounded-gc px-3 py-2 text-[11px] text-gc-green font-mono outline-none focus:border-gc-green-dim caret-gc-green"
                placeholder="••••••••••••"
                required
              />
            </div>

            {error && (
              <div className="text-gc-red text-[10px] border border-gc-red/30 bg-gc-red/5 px-3 py-2 rounded-gc">
                ERR: {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full border border-gc-green-dim bg-gc-green/5 text-gc-green text-[11px] tracking-[1px] py-2 rounded-gc font-mono hover:bg-gc-green/10 hover:border-gc-green transition-all disabled:opacity-50"
            >
              {loading ? (
                <span className="animate-blink">AUTHENTICATING...</span>
              ) : (
                "[ CONNECT ]"
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-[8px] text-gc-border tracking-[1px]">
            GHANA GOLD BOARD ACT 2025 (ACT 1140) · AUTHORIZED ACCESS ONLY
          </div>
        </div>
      </div>
    </div>
  );
}
