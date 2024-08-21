import fjp from "fast-json-patch";
import type { StatusResult } from "simple-git";

export type Patch = {
  type: "json" | "text";
  payload: fjp.Operation[];
};

export interface BlockMetadata {
  kind: "block";
  blockType: string;
  __resolveType: string;
}

export interface PageBlockMetadata extends BlockMetadata {
  blockType: "pages";
  name: string;
  path: string;
}

export interface FileMetadata {
  kind: "file";
}

export type Metadata = BlockMetadata | PageBlockMetadata | FileMetadata;

export type GitStatus = StatusResult;

export type FSEvent = {
  type: "sync";
  detail: SyncUpdate;
} | {
  type: "snapshot";
  detail: SnapshotUpdate;
};

export type SnapshotUpdate = {
  timestamp: number;
  status: GitStatus;
};

export type SyncUpdate = {
  status?: GitStatus;
  metadata: Metadata | null;
  timestamp: number;
  filepath: string;
};

export interface Update {
  status: GitStatus;
  metadata: Metadata | null;
  timestamp: number;
}

export interface SuccessUpdate extends Update {
  conflict: false;
  content: string | undefined;
}

export interface FailedUpdate extends Update {
  conflict: true;
  content: string | null;
}

export type UpdateResponse = SuccessUpdate | FailedUpdate;

const applyJSONPatch = <T>(content: T, patch: Patch["payload"]) => {
  try {
    return {
      conflict: false as const,
      content: patch.reduce<T>(fjp.applyReducer, content),
    };
  } catch (error) {
    if (
      error instanceof fjp.JsonPatchError &&
      error.name === "TEST_OPERATION_FAILED"
    ) {
      return {
        conflict: true as const,
      };
    }
    throw error;
  }
};

export const applyPatch = (content: string | null, patch: Patch) => {
  if (patch.type === "json") {
    const result = applyJSONPatch(JSON.parse(content ?? "{}"), patch.payload);

    if (result.conflict) {
      return {
        conflict: true as const,
      };
    }

    return {
      conflict: false as const,
      content: JSON.stringify(result.content, null, 2),
    };
  }
  if (patch.type === "text") {
    const result = applyJSONPatch(content?.split("\n") ?? [], patch.payload);

    if (result.conflict) {
      return {
        conflict: true as const,
      };
    }

    return {
      conflict: false as const,
      content: result.content.join("\n"),
    };
  }

  throw new Error(`Unknown patch type: ${patch.type}`);
};

export const generatePatch = (from: string | null, to: string | null) => {
  try {
    return {
      type: "json" as const,
      payload: fjp.compare(
        JSON.parse(from ?? "{}"),
        JSON.parse(to ?? "{}"),
        true,
      ),
    };
  } catch {
    return {
      type: "text" as const,
      payload: fjp.compare(
        from?.split("\n") ?? [],
        to?.split("\n") ?? [],
        true,
      ),
    };
  }
};
