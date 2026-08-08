import { createHash } from "node:crypto";
import { createServer } from "node:net";

function lockDescriptor(projectRoot) {
  const identity = process.platform === "win32" ? projectRoot.toLowerCase() : projectRoot;
  const hash = createHash("sha256").update(identity).digest("hex").slice(0, 24);
  if (process.platform === "win32") {
    return {
      label: `named-pipe:mesto-phase11-${hash}`,
      listen: `\\\\.\\pipe\\mesto-phase11-${hash}`,
    };
  }
  if (process.platform === "linux") {
    return {
      label: `abstract-socket:mesto-phase11-${hash}`,
      listen: `\0mesto-phase11-${hash}`,
    };
  }
  const port = 24_000 + (Number.parseInt(hash.slice(0, 8), 16) % 8_000);
  return {
    label: `tcp:127.0.0.1:${port}`,
    listen: { exclusive: true, host: "127.0.0.1", port },
  };
}

export async function acquireWorkspaceLock(projectRoot) {
  const descriptor = lockDescriptor(projectRoot);
  const server = createServer((socket) => socket.destroy());

  try {
    await new Promise((resolveListen, rejectListen) => {
      server.once("error", rejectListen);
      server.listen(descriptor.listen, () => {
        server.off("error", rejectListen);
        resolveListen();
      });
    });
  } catch (error) {
    const prefix = error?.code === "EADDRINUSE"
      ? "Another Phase 11 load run owns this workspace"
      : "Unable to acquire the Phase 11 workspace lock";
    throw new Error(`${prefix} (${descriptor.label})`, { cause: error });
  }
  server.unref();

  let released = false;
  return {
    endpoint: descriptor.label,
    async release() {
      if (released) return;
      released = true;
      await new Promise((resolveClose, rejectClose) => {
        server.close((error) => {
          if (error) rejectClose(error);
          else resolveClose();
        });
      });
    },
  };
}
