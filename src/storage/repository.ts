// 화면·도메인이 아는 유일한 저장소 계약. 어댑터를 바꿔도 이 계약은 그대로다 (ARCHITECTURE §3).
import type { Data, StoredFile, TableName, Tables, Write } from "../schema/entities";

export interface Repository {
  readonly kind: "memory" | "local" | "desktop" | "firebase";
  /** 지운 것(deletedAt)도 포함해 전부. 없으면 [] */
  list<K extends TableName>(table: K): Promise<Tables[K][]>;
  get<K extends TableName>(table: K, id: string): Promise<Tables[K] | null>;
  /** 전부 쓰이거나 하나도 안 쓰인다. 쓰기의 유일한 입구 */
  transact(writes: Write[]): Promise<void>;
  loadAll(): Promise<Data>;
  /** 백업 가져오기 전용: 모든 표와 파일을 통째로 바꾼다 */
  replaceAll(data: Data, files: StoredFile[]): Promise<void>;
  files: {
    save(file: StoredFile): Promise<void>;
    read(id: string): Promise<StoredFile | null>;
    list(): Promise<StoredFile[]>;
    remove(id: string): Promise<void>;
  };
}
