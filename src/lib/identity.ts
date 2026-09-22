"use client";

/**
 * Mock identity — the credential side of the login mockup (TEACHER-1).
 *
 * The demo has no real authentication (no next-auth wiring, no user table —
 * see docs/TEACHER_MODE_PLAN.md), so the login page simulates one: choosing
 * a role and submitting any credentials writes a local identity record that
 * role-aware surfaces (dashboard greeting, /teacher workspace) can read.
 *
 * Persists to localStorage["syllabai.identity.v1"]:
 *   { role: "student" | "teacher", name, email, signedInAt }
 *
 * Same store pattern as my-subjects.ts / theme-store.ts: module store +
 * useSyncExternalStore, referentially-stable snapshot, custom event for
 * same-tab reactivity + storage event for cross-tab.
 */
import { useSyncExternalStore } from "react";

export type Role = "student" | "teacher";

export interface Identity {
  role: Role;
  name: string;
  email: string;
  signedInAt: string;
}

const KEY = "syllabai.identity.v1";
const IDENTITY_EVENT = "syllabai:identity-changed";

export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const cleaned = local.replace(/[._\-+]+/g, " ").trim();
  if (!cleaned) return "there";
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function readIdentity(): Identity | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Identity>;
    if (parsed.role !== "student" && parsed.role !== "teacher") return null;
    if (typeof parsed.email !== "string" || parsed.email.length === 0) return null;
    return {
      role: parsed.role,
      email: parsed.email,
      name:
        typeof parsed.name === "string" && parsed.name.length > 0
          ? parsed.name
          : nameFromEmail(parsed.email),
      signedInAt:
        typeof parsed.signedInAt === "string" ? parsed.signedInAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// getSnapshot must return a referentially stable value between store changes
const EMPTY_SNAPSHOT: Identity | null = null;
let snapshot: Identity | null = EMPTY_SNAPSHOT;

function getSnapshot(): Identity | null {
  const next = readIdentity();
  const changed =
    (next === null) !== (snapshot === null) ||
    (next !== null &&
      snapshot !== null &&
      (next.email !== snapshot.email || next.role !== snapshot.role));
  if (changed) snapshot = next;
  return snapshot;
}

function getServerSnapshot(): Identity | null {
  return null;
}

function subscribe(onChange: () => void) {
  window.addEventListener(IDENTITY_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(IDENTITY_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function setIdentity(identity: { role: Role; email: string; name?: string }): Identity {
  const next: Identity = {
    role: identity.role,
    email: identity.email,
    name: identity.name?.trim() ? identity.name.trim() : nameFromEmail(identity.email),
    signedInAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage full / private mode — identity just won't persist
  }
  snapshot = next;
  window.dispatchEvent(new CustomEvent(IDENTITY_EVENT));
  return next;
}

export function clearIdentity(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  snapshot = null;
  window.dispatchEvent(new CustomEvent(IDENTITY_EVENT));
}

/** Reactive identity for role-aware surfaces. `null` until hydration + when signed out. */
export function useIdentity(): Identity | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export const ROLE_LABEL: Record<Role, string> = {
  student: "Student",
  teacher: "Teacher",
};
