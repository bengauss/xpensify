import { createMiddleware } from "hono/factory";
import db from "../db/connection.js";

export type Variables = {
  userId: string;
  user: { id: string; username: string; display_name: string; avatar_color: string };
};

export const authMiddleware = createMiddleware<{ Variables: Variables }>(
  async (c, next) => {
    const cookieHeader = c.req.header("cookie") ?? "";
    const cookies = Object.fromEntries(
      cookieHeader.split(";").map((s) => {
        const [k, ...v] = s.trim().split("=");
        return [k, v.join("=")];
      })
    );
    const sessionId = cookies["xpensify_session"];

    if (!sessionId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const session = db
      .prepare(
        `SELECT s.id, s.user_id, s.expires_at,
                u.id as uid, u.username, u.display_name, u.avatar_color
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.id = ?`
      )
      .get(sessionId) as
      | {
          id: string;
          user_id: string;
          expires_at: string;
          uid: string;
          username: string;
          display_name: string;
          avatar_color: string;
        }
      | undefined;

    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const now = new Date();
    const expires = new Date(session.expires_at);
    if (expires <= now) {
      db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
      return c.json({ error: "Session expired" }, 401);
    }

    c.set("userId", session.user_id);
    c.set("user", {
      id: session.uid,
      username: session.username,
      display_name: session.display_name,
      avatar_color: session.avatar_color,
    });

    await next();
  }
);
