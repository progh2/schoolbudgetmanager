// 해시 라우팅: 서버 설정 없이 Pages 하위 경로·Pod 루트 어디서든 새로고침해도 404가 없다.
import { useEffect, useState } from "react";

export function parseHash(hash: string): string[] {
  return hash.replace(/^#\/?/, "").split("?")[0].split("/").filter(Boolean).map(decodeURIComponent);
}

export function useRoute(): string[] {
  const [parts, setParts] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => setParts(parseHash(location.hash));
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return parts;
}

export const go = (path: string) => {
  location.hash = `#/${path}`;
};
