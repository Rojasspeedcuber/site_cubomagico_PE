"use client";
import { useCallback, useEffect, useState } from "react";
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers:
        body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new Error(
      "Não foi possível conectar. Confira sua conexão e tente novamente.",
    );
  }
  let payload: { data?: T; error?: string };
  try {
    payload = await response.json();
  } catch {
    throw new Error(
      "O servidor não respondeu como esperado. Tente novamente em instantes.",
    );
  }
  if (!response.ok || payload.error)
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : "Não foi possível concluir esta ação.",
    );
  return payload.data as T;
}
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null),
    [loading, setLoading] = useState(!!path),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let alive = true;
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    api<T>(path)
      .then((value) => {
        if (alive) setData(value);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [path, version]);
  return { data, loading, error, reload };
}
