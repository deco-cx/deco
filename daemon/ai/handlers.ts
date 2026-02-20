import { Hono } from "@hono/hono";
import { AITask } from "./task.ts";

interface AIHandlersOptions {
  /** Working directory for the AI agent (the cloned repo). */
  cwd: string;
  /** AI provider API key from daemon env. */
  apiKey: string;
  /** GITHUB_TOKEN from daemon env. */
  githubToken?: string;
  /** Extra env vars from deploy request. */
  extraEnv?: Record<string, string>;
}

export const createAIHandlers = (opts: AIHandlersOptions) => {
  const app = new Hono();
  const tasks = new Map<string, AITask>();

  // POST /sandbox/tasks — create a new AI task
  app.post("/", async (c) => {
    let body: { issue?: string; prompt?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const { issue, prompt } = body;

    if (!issue && !prompt) {
      return c.json(
        { error: "Either 'issue' or 'prompt' is required" },
        400,
      );
    }

    if (issue && prompt) {
      return c.json(
        { error: "'issue' and 'prompt' are mutually exclusive" },
        400,
      );
    }

    if (issue && typeof issue !== "string") {
      return c.json({ error: "'issue' must be a string" }, 400);
    }

    if (prompt && typeof prompt !== "string") {
      return c.json({ error: "'prompt' must be a string" }, 400);
    }

    const task = new AITask({
      issue,
      prompt,
      cwd: opts.cwd,
      apiKey: opts.apiKey,
      githubToken: opts.githubToken,
      extraEnv: opts.extraEnv,
    });

    tasks.set(task.taskId, task);

    try {
      await task.start();
    } catch (err) {
      tasks.delete(task.taskId);
      console.error(`[ai] Failed to start task:`, err);
      return c.json({ error: "Failed to start task" }, 500);
    }

    console.log(
      `[ai] Task ${task.taskId} started${issue ? ` for issue: ${issue}` : ""}`,
    );

    return c.json({
      taskId: task.taskId,
      status: task.status,
    }, 201);
  });

  // GET /sandbox/tasks — list all tasks
  app.get("/", (c) => {
    const list = Array.from(tasks.values()).map((t) => t.info());
    return c.json(list);
  });

  // GET /sandbox/tasks/:taskId — get task details
  app.get("/:taskId", (c) => {
    const task = tasks.get(c.req.param("taskId"));
    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }
    return c.json(task.info());
  });

  // GET /sandbox/tasks/:taskId/ws — WebSocket PTY attach
  app.get("/:taskId/ws", (c) => {
    const task = tasks.get(c.req.param("taskId"));
    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }

    const session = task.session;
    if (!session) {
      return c.json({ error: "Task has no active session" }, 400);
    }

    const { socket, response } = Deno.upgradeWebSocket(c.req.raw);

    let unsubData: (() => void) | undefined;
    let unsubExit: (() => void) | undefined;

    socket.onopen = () => {
      // Send buffered output
      for (const line of session.outputBuffer) {
        socket.send(line);
      }

      // Stream new output
      unsubData = session.onData((data) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(data);
        }
      });

      // Notify on exit
      unsubExit = session.onExit((code) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "exit", code }));
          socket.close();
        }
      });
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type === "input" && typeof msg.data === "string") {
          session.write(msg.data);
        } else if (
          msg.type === "resize" && typeof msg.cols === "number" &&
          typeof msg.rows === "number"
        ) {
          session.resize(msg.cols, msg.rows);
        }
      } catch {
        // Ignore malformed messages
      }
    };

    socket.onclose = () => {
      // Clean up callbacks to prevent accumulation on reconnects
      unsubData?.();
      unsubExit?.();
    };

    return response;
  });

  // DELETE /sandbox/tasks/:taskId — kill a task
  app.delete("/:taskId", (c) => {
    const taskId = c.req.param("taskId");
    const task = tasks.get(taskId);
    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }

    task.dispose();
    tasks.delete(taskId);

    console.log(`[ai] Task ${taskId} killed`);
    return c.json({ ok: true });
  });

  // Dispose all tasks (for undeploy)
  const dispose = () => {
    for (const task of tasks.values()) {
      task.dispose();
    }
    tasks.clear();
  };

  return { app, dispose };
};
