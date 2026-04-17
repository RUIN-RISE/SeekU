"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X, Mail, GitBranch, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { useState } from "react";
import { useClaim, type ClaimResponseBody } from "@/hooks/useClaim";

interface ClaimFormProps {
  personId: string;
  personName: string;
  onClose: () => void;
}

export function ClaimForm({ personId, personName, onClose }: ClaimFormProps) {
  const [method, setMethod] = useState<"email" | "github">("email");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<ClaimResponseBody | null>(null);

  const { mutate: submitClaim, isPending, error } = useClaim();

  const handleSubmit = () => {
    if (method === "email" && !email.trim()) {
      return;
    }

    submitClaim(
      { personId, email: method === "email" ? email : undefined, method },
      {
        onSuccess: (data) => {
          setResult(data);
          // If GitHub OAuth, redirect to the OAuth URL
          if (data.status === "pending_oauth" && data.oauthUrl) {
            window.location.href = data.oauthUrl;
          }
        }
      }
    );
  };

  const handleClose = () => {
    setEmail("");
    setResult(null);
    onClose();
  };

  return (
    <Dialog.Root open={true} onOpenChange={(open) => !open && handleClose()}>
      <Dialog.Portal>
        {/* Backdrop */}
        <Dialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-[fadeIn_0.3s_ease-out]" />

        {/* Modal Content */}
        <Dialog.Content
          className={clsx(
            "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
            "w-full max-w-md",
            "bg-white rounded-xl shadow-lg",
            "p-6",
            "data-[state=open]:animate-[scaleIn_0.3s_ease-out]"
          )}
        >
          {/* Close Button */}
          <Dialog.Close asChild>
            <button
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-slate-100 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </Dialog.Close>

          {/* Title */}
          <Dialog.Title className="text-lg font-bold text-slate-900 mb-2">
            认领此档案
          </Dialog.Title>
          <Dialog.Description className="text-sm text-slate-500 mb-6">
            验证您是 {personName} 的档案主人
          </Dialog.Description>

          {/* Method Selection */}
          {!result && (
            <div className="space-y-4">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setMethod("email")}
                  className={clsx(
                    "flex-1 flex items-center gap-2 justify-center py-3 rounded-lg border-2 transition-colors",
                    method === "email"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-200 hover:border-slate-300"
                  )}
                >
                  <Mail className="w-5 h-5" />
                  <span className="font-medium">邮箱验证</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMethod("github")}
                  className={clsx(
                    "flex-1 flex items-center gap-2 justify-center py-3 rounded-lg border-2 transition-colors",
                    method === "github"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-200 hover:border-slate-300"
                  )}
                >
                  <GitBranch className="w-5 h-5" />
                  <span className="font-medium">GitHub OAuth</span>
                </button>
              </div>

              {/* Email Input */}
              {method === "email" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    验证邮箱
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="请输入您的邮箱地址"
                    className={clsx(
                      "w-full px-3 py-2 rounded-lg border border-slate-200",
                      "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
                      "text-sm"
                    )}
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    我们将发送验证链接到您的邮箱
                  </p>
                </div>
              )}

              {/* GitHub Info */}
              {method === "github" && (
                <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600">
                  <p>
                    点击提交后，将跳转到 GitHub 进行授权验证。
                    我们会验证您的 GitHub 账号是否与档案中的 GitHub 链接匹配。
                  </p>
                </div>
              )}

              {/* Error Display */}
              {error && (
                <div className="bg-red-50 text-red-700 rounded-lg p-3 text-sm">
                  {error.message}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isPending || (method === "email" && !email.trim())}
                className={clsx(
                  "w-full py-3 rounded-lg font-medium transition-colors",
                  "bg-blue-600 text-white hover:bg-blue-700",
                  "disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
                )}
              >
                {isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    提交中...
                  </span>
                ) : (
                  "提交验证申请"
                )}
              </button>
            </div>
          )}

          {/* Result Display */}
          {result && result.status === "pending_verification" && (
            <div className="space-y-4">
              <div className="bg-green-50 text-green-700 rounded-lg p-4">
                <p className="font-medium mb-1">验证申请已提交</p>
                <p className="text-sm">
                  请点击发送到您邮箱的验证链接完成验证。
                </p>
                {result.verificationUrl && (
                  <p className="text-xs text-green-600 mt-2">
                    验证链接已发送（开发环境请查看控制台日志）
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="w-full py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                关闭
              </button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
