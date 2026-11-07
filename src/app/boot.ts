// 어댑터를 고르는 유일한 곳 (ARCHITECTURE §3). M6·M7에서 여기만 바뀐다.
import { createLocalRepository } from "../storage/adapters/local";
import type { Repository } from "../storage/repository";

export function createRepository(): Repository {
  return createLocalRepository();
}

/** 브라우저가 공간 부족 때 데이터를 지우지 않도록 요청한다. 결과: true/false, 지원 안 하면 null */
export async function requestPersistence(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
