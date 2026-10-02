"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ArrowRotateLeft,
  ArrowRightFromSquare,
  Check,
  CircleCheck,
  CircleInfo,
  Comment,
  Gear,
  House,
  Link as LinkIcon,
  LinkSlash,
  ShieldCheck,
  Xmark,
} from "@gravity-ui/icons";
import { Button, Card, Chip, Input, Spinner } from "@heroui/react";
import {
  disconnectWhatsAppAction,
  getWhatsAppConnectUrlAction,
  getWhatsAppStatusAction,
  testWhatsAppConnectionAction,
  type WhatsAppStatusResult,
} from "@/lib/actions/zernio";
import { DEFAULT_ZERNIO_PROFILE_ID, type WhatsAppAccount } from "@/lib/zernio/types";

interface SettingsViewProps {
  initialStatus: WhatsAppStatusResult;
  userEmail: string;
}

export function SettingsView({ initialStatus, userEmail }: SettingsViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<"configuration" | "general">("configuration");
  const [status, setStatus] = useState<WhatsAppStatusResult>(initialStatus);
  const [profileIdInput, setProfileIdInput] = useState<string>(
    initialStatus.profileId || DEFAULT_ZERNIO_PROFILE_ID
  );

  const [isRefreshing, startRefresh] = useTransition();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  const [testResult, setTestResult] = useState<{
    success: boolean;
    latencyMs?: number;
    accountCount?: number;
    message?: string;
  } | null>(null);

  const [notification, setNotification] = useState<{
    type: "success" | "error" | "info";
    title?: string;
    message: string;
  } | null>(null);

  // Parse redirect params on return from Zernio / Meta embedded signup
  useEffect(() => {
    const connected = searchParams.get("connected");
    const accountId = searchParams.get("accountId");
    const username = searchParams.get("username");
    const errorParam = searchParams.get("error");
    const platform = searchParams.get("platform");

    if (connected === "whatsapp") {
      setNotification({
        type: "success",
        title: "WhatsApp Connected Successfully!",
        message: `Account connected via Zernio${username ? ` (${decodeURIComponent(username)})` : ""}${accountId ? ` [ID: ${accountId}]` : ""}. Refreshing account information...`,
      });

      // Clear search parameters from URL cleanly
      router.replace("/settings");

      // Auto-refresh account status
      startRefresh(async () => {
        const fresh = await getWhatsAppStatusAction(profileIdInput);
        setStatus(fresh);
      });
    } else if (errorParam) {
      let msg = errorParam;
      if (errorParam === "connection_cancelled") {
        msg = "WhatsApp connection process was cancelled before completion.";
      } else if (errorParam === "one_whatsapp_per_profile") {
        msg = "This profile already has a connected WhatsApp number. Disconnect it first or use another profile.";
      } else if (errorParam === "whatsapp_number_already_connected") {
        msg = "This WhatsApp number is already connected to another profile.";
      } else if (errorParam === "session_expired") {
        msg = "The Meta signup session expired. Please start the connection again.";
      }

      setNotification({
        type: "error",
        title: `Connection Error (${platform || "whatsapp"})`,
        message: msg,
      });

      router.replace("/settings");
    }
  }, [searchParams, router, profileIdInput]);

  function handleRefresh() {
    setTestResult(null);
    startRefresh(async () => {
      const fresh = await getWhatsAppStatusAction(profileIdInput);
      setStatus(fresh);
      setNotification({
        type: "info",
        message: "Status updated from Zernio API.",
      });
    });
  }

  async function handleConnect() {
    setIsConnecting(true);
    setNotification(null);
    try {
      const redirectUrl = `${window.location.origin}/settings`;
      const res = await getWhatsAppConnectUrlAction(redirectUrl, profileIdInput);

      if (res.success && res.authUrl) {
        window.location.href = res.authUrl;
      } else {
        setNotification({
          type: "error",
          title: "Failed to Start Embedded Signup",
          message: res.error || "Unable to retrieve connection URL from Zernio.",
        });
        setIsConnecting(false);
      }
    } catch (err) {
      setNotification({
        type: "error",
        title: "Connection Request Failed",
        message: err instanceof Error ? err.message : "Unexpected error during connection request.",
      });
      setIsConnecting(false);
    }
  }

  async function handleTest() {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testWhatsAppConnectionAction(profileIdInput);
      setTestResult({
        success: res.success,
        latencyMs: res.latencyMs,
        accountCount: res.accountCount,
        message: res.error,
      });
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : "Diagnostic check failed.",
      });
    } finally {
      setIsTesting(false);
    }
  }

  async function handleDisconnect(accountId: string) {
    if (!confirm("Are you sure you want to disconnect this WhatsApp account from Zernio?")) {
      return;
    }

    setDisconnectingId(accountId);
    try {
      const res = await disconnectWhatsAppAction(accountId);
      if (res.success) {
        setNotification({
          type: "success",
          message: res.message || "WhatsApp account disconnected successfully.",
        });
        const fresh = await getWhatsAppStatusAction(profileIdInput);
        setStatus(fresh);
      } else {
        setNotification({
          type: "error",
          message: res.error || "Failed to disconnect account.",
        });
      }
    } finally {
      setDisconnectingId(null);
    }
  }

  const primaryAccount: WhatsAppAccount | undefined = status.accounts?.[0];
  const primaryBusinessProfile = primaryAccount
    ? status.businessProfiles?.[primaryAccount.accountId]
    : undefined;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      {/* Page Title & Subtitle */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Settings</h1>
          <p className="text-sm text-neutral-500">
            Configure integrations, WhatsApp connectivity via Zernio, and foundation settings.
          </p>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-neutral-200">
        <nav aria-label="Settings Tabs" className="-mb-px flex space-x-6">
          <button
            type="button"
            onClick={() => setActiveTab("configuration")}
            className={`flex items-center gap-2 border-b-2 py-3 text-sm font-medium transition-colors ${
              activeTab === "configuration"
                ? "border-neutral-900 text-neutral-900"
                : "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700"
            }`}
          >
            <Comment className="size-4" />
            <span>Configuration</span>
            {status.isConfigured && status.accounts.length > 0 && (
              <span className="ml-1 inline-flex size-2 rounded-full bg-emerald-500" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("general")}
            className={`flex items-center gap-2 border-b-2 py-3 text-sm font-medium transition-colors ${
              activeTab === "general"
                ? "border-neutral-900 text-neutral-900"
                : "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700"
            }`}
          >
            <House className="size-4" />
            <span>General</span>
          </button>
        </nav>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div
          className={`flex items-start justify-between rounded-xl p-4 text-sm ${
            notification.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : notification.type === "error"
              ? "bg-rose-50 text-rose-800 border border-rose-200"
              : "bg-blue-50 text-blue-800 border border-blue-200"
          }`}
        >
          <div className="flex items-start gap-3">
            {notification.type === "success" ? (
              <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" />
            ) : notification.type === "error" ? (
              <CircleInfo className="mt-0.5 size-5 shrink-0 text-rose-600" />
            ) : (
              <CircleInfo className="mt-0.5 size-5 shrink-0 text-blue-600" />
            )}
            <div>
              {notification.title && <p className="font-semibold">{notification.title}</p>}
              <p>{notification.message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-neutral-400 hover:text-neutral-600"
            aria-label="Dismiss alert"
          >
            <Xmark className="size-4" />
          </button>
        </div>
      )}

      {/* TAB 1: CONFIGURATION */}
      {activeTab === "configuration" && (
        <div className="space-y-6">
          {/* Main WhatsApp Card */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3.5">
                <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <Comment className="size-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-neutral-900">WhatsApp Integration</h2>
                    {status.isConfigured && status.accounts.length > 0 ? (
                      <Chip color="success" size="sm" variant="soft">
                        Connected
                      </Chip>
                    ) : status.isConfigured ? (
                      <Chip color="warning" size="sm" variant="soft">
                        Not Connected
                      </Chip>
                    ) : (
                      <Chip color="danger" size="sm" variant="soft">
                        API Key Missing
                      </Chip>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500">
                    Connect WhatsApp Cloud API via Zernio to automate notifications and submissions.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onPress={handleRefresh}
                  isDisabled={isRefreshing || !status.isConfigured}
                >
                  <ArrowRotateLeft className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onPress={handleTest}
                  isDisabled={isTesting || !status.isConfigured}
                >
                  {isTesting ? <Spinner size="sm" /> : <ShieldCheck className="size-3.5" />}
                  Test API
                </Button>
              </div>
            </div>

            {/* Test Results Output */}
            {testResult && (
              <div
                className={`mt-4 rounded-xl p-3.5 text-xs ${
                  testResult.success
                    ? "bg-emerald-50/70 border border-emerald-200 text-emerald-900"
                    : "bg-amber-50/70 border border-amber-200 text-amber-900"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    {testResult.success ? "API Handshake Successful" : "API Handshake Warning"}
                  </span>
                  {testResult.latencyMs !== undefined && (
                    <span className="text-neutral-500">Response time: {testResult.latencyMs}ms</span>
                  )}
                </div>
                <p className="mt-1">
                  {testResult.success
                    ? `Connected to Zernio profile. Found ${testResult.accountCount || 0} active WhatsApp account(s).`
                    : testResult.message || "Failed to query Zernio API."}
                </p>
              </div>
            )}

            <div className="mt-6 border-t border-neutral-100 pt-5">
              {!status.isConfigured ? (
                /* Unconfigured state (No API key) */
                <div className="rounded-xl bg-neutral-50 p-5 text-neutral-700">
                  <div className="flex items-start gap-3">
                    <CircleInfo className="mt-0.5 size-5 shrink-0 text-neutral-500" />
                    <div className="space-y-2 text-sm">
                      <p className="font-semibold text-neutral-900">Zernio API Key Required</p>
                      <p className="text-neutral-600">
                        To enable WhatsApp integration, please add your Zernio API key in your server environment:
                      </p>
                      <div className="rounded-lg bg-neutral-900 p-3 font-mono text-xs text-neutral-100">
                        ZERNIO_API_KEY=your_zernio_api_key_here<br />
                        ZERNIO_PROFILE_ID={DEFAULT_ZERNIO_PROFILE_ID}
                      </div>
                      <p className="text-xs text-neutral-500">
                        After saving <code className="rounded bg-neutral-200 px-1 py-0.5">.env.local</code>, click &ldquo;Refresh&rdquo; above.
                      </p>
                    </div>
                  </div>
                </div>
              ) : status.accounts.length > 0 && primaryAccount ? (
                /* Connected State */
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {/* Account Details */}
                    <div className="rounded-xl border border-neutral-100 bg-neutral-50/60 p-4">
                      <span className="text-xs font-medium uppercase tracking-wider text-neutral-400">
                        Connected WhatsApp Account
                      </span>
                      <div className="mt-2 space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-neutral-500">Phone Number:</span>
                          <span className="font-semibold text-neutral-900">
                            {primaryAccount.phoneNumber || primaryAccount.username || "Connected"}
                          </span>
                        </div>
                        {primaryAccount.verifiedName && (
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-500">Verified Name:</span>
                            <span className="text-neutral-800">{primaryAccount.verifiedName}</span>
                          </div>
                        )}
                        {primaryAccount.displayName && primaryAccount.displayName !== primaryAccount.verifiedName && (
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-500">Display Name:</span>
                            <span className="text-neutral-800">{primaryAccount.displayName}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-neutral-500">Account ID:</span>
                          <span className="font-mono text-xs text-neutral-700">
                            {primaryAccount.accountId}
                          </span>
                        </div>
                        {primaryAccount.wabaId && (
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-500">WABA ID:</span>
                            <span className="font-mono text-xs text-neutral-700">
                              {primaryAccount.wabaId}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-neutral-500">Messaging Status:</span>
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <Check className="size-3.5" /> Can Send Messages
                          </span>
                        </div>
                        {primaryAccount.qualityRating && (
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-500">Quality Rating:</span>
                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800">
                              {primaryAccount.qualityRating}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Business Profile Details */}
                    <div className="rounded-xl border border-neutral-100 bg-neutral-50/60 p-4">
                      <span className="text-xs font-medium uppercase tracking-wider text-neutral-400">
                        Meta Business Profile
                      </span>
                      <div className="mt-2 space-y-2 text-sm">
                        {primaryBusinessProfile ? (
                          <>
                            {primaryBusinessProfile.about && (
                              <div>
                                <span className="text-xs text-neutral-500">About:</span>
                                <p className="text-neutral-800">{primaryBusinessProfile.about}</p>
                              </div>
                            )}
                            {primaryBusinessProfile.description && (
                              <div>
                                <span className="text-xs text-neutral-500">Description:</span>
                                <p className="line-clamp-2 text-neutral-800">
                                  {primaryBusinessProfile.description}
                                </p>
                              </div>
                            )}
                            {primaryBusinessProfile.email && (
                              <div className="flex items-center justify-between">
                                <span className="text-neutral-500">Business Email:</span>
                                <span className="text-neutral-800">{primaryBusinessProfile.email}</span>
                              </div>
                            )}
                            {primaryBusinessProfile.websites && primaryBusinessProfile.websites.length > 0 && (
                              <div className="flex items-center justify-between">
                                <span className="text-neutral-500">Website:</span>
                                <a
                                  href={primaryBusinessProfile.websites[0]}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline"
                                >
                                  {primaryBusinessProfile.websites[0]}
                                </a>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="py-2 text-xs text-neutral-500">
                            Business profile details synced with Meta Cloud API.
                          </div>
                        )}
                        <div className="pt-2">
                          <span className="text-xs text-neutral-400">
                            Profile ID: <span className="font-mono text-neutral-600">{status.profileId}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Connected Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <div className="text-xs text-neutral-500">
                      Need to switch to a different phone number or reconnect?
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onPress={handleConnect}
                        isDisabled={isConnecting}
                      >
                        {isConnecting ? <Spinner size="sm" /> : <LinkIcon className="size-3.5" />}
                        Reconnect / Change Number
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                        onPress={() => handleDisconnect(primaryAccount.accountId)}
                        isDisabled={disconnectingId === primaryAccount.accountId}
                      >
                        {disconnectingId === primaryAccount.accountId ? (
                          <Spinner size="sm" />
                        ) : (
                          <LinkSlash className="size-3.5" />
                        )}
                        Disconnect
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Not Connected State */
                <div className="space-y-4">
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-6 text-center">
                    <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-neutral-200/80 text-neutral-600">
                      <Comment className="size-6" />
                    </div>
                    <h3 className="mt-3 text-base font-semibold text-neutral-900">
                      Connect WhatsApp via Zernio
                    </h3>
                    <p className="mx-auto mt-1 max-w-md text-xs text-neutral-500">
                      Link your Meta WhatsApp Business Account to profile{" "}
                      <code className="rounded bg-neutral-200 px-1 py-0.5 font-mono text-neutral-700">
                        {status.profileId}
                      </code>{" "}
                      using Meta Embedded Signup.
                    </p>

                    <div className="mt-5 flex justify-center">
                      <Button
                        variant="primary"
                        onPress={handleConnect}
                        isDisabled={isConnecting}
                        className="bg-neutral-900 font-medium text-white hover:bg-neutral-800"
                      >
                        {isConnecting ? (
                          <>
                            <Spinner size="sm" className="mr-2" />
                            Opening Meta Embedded Signup...
                          </>
                        ) : (
                          <>
                            <LinkIcon className="mr-2 size-4" />
                            Connect WhatsApp
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Setup Checklist */}
                  <div className="rounded-xl bg-neutral-50 p-4 text-xs text-neutral-600">
                    <p className="font-semibold text-neutral-900 mb-1">What to expect during connection:</p>
                    <ul className="list-inside list-disc space-y-1">
                      <li>You will be directed to Meta&apos;s guided Embedded Signup.</li>
                      <li>Log in with your Meta/Facebook business credentials.</li>
                      <li>Select or create your WhatsApp Business Account (WABA).</li>
                      <li>Choose your WhatsApp phone number to bind to profile <code className="font-mono">{status.profileId}</code>.</li>
                      <li>Upon completion, you will be redirected back here automatically.</li>
                    </ul>
                    <div className="mt-2 pt-2 border-t border-neutral-200">
                      <a
                        href="https://docs.zernio.com/platforms/whatsapp/connection"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline"
                      >
                        Read Zernio WhatsApp Connection Docs
                        <ArrowRightFromSquare className="size-3" />
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Profile & API Configuration Section */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-neutral-900">Zernio Profile Configuration</h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              Settings for mapping WhatsApp accounts to specific Zernio profiles.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Active Profile ID
                </label>
                <div className="flex gap-2">
                  <Input
                    value={profileIdInput}
                    onChange={(e) => setProfileIdInput(e.target.value)}
                    placeholder="Enter Zernio Profile ID"
                    className="flex-1 font-mono text-xs"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onPress={handleRefresh}
                    isDisabled={isRefreshing || profileIdInput === status.profileId}
                  >
                    Apply
                  </Button>
                </div>
                <p className="mt-1 text-[11px] text-neutral-500">
                  Configured profile ID: <code className="font-mono text-neutral-700">{DEFAULT_ZERNIO_PROFILE_ID}</code>
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  API Key Status
                </label>
                <div className="flex items-center h-9 px-3 rounded-lg bg-neutral-50 border border-neutral-200 text-xs">
                  {status.isConfigured ? (
                    <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                      <CircleCheck className="size-4" /> Configured in .env.local
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-rose-700 font-medium">
                      <CircleInfo className="size-4" /> Not found in environment
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-neutral-500">
                  Read from <code className="font-mono text-neutral-700">process.env.ZERNIO_API_KEY</code>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: GENERAL */}
      {activeTab === "general" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-neutral-900">Organization Information</h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              Overview of the Jaipur Rugs Foundation Admin Panel environment.
            </p>

            <div className="mt-4 space-y-3 text-sm divide-y divide-neutral-100">
              <div className="flex items-center justify-between py-2">
                <span className="text-neutral-500">Organization</span>
                <span className="font-medium text-neutral-900">Jaipur Rugs Foundation</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-neutral-500">Logged in Member</span>
                <span className="font-medium text-neutral-900">{userEmail}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-neutral-500">Access Level</span>
                <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
                  Active Team Member (Full Access)
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-neutral-500">Deployment</span>
                <span className="text-xs font-mono text-neutral-600">Self-hosted (jaipurrugs.org)</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-neutral-500">Theme</span>
                <span className="text-xs font-medium text-neutral-700">Light Mode (Pinned)</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
