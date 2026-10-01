import { db, id, type User } from "./db.ts";

export type NotificationKind = "message" | "request" | "booking" | "property" | "system";

export function notify(
  userId: string,
  kind: NotificationKind,
  title: string,
  body: string,
  entityType = "",
  entityId = "",
) {
  if (!userId) return;
  db.prepare(
    "INSERT INTO notifications(id,user_id,kind,title,body,entity_type,entity_id) VALUES(?,?,?,?,?,?,?)",
  ).run(id(), userId, kind, title.slice(0, 180), body.slice(0, 1000), entityType, entityId);
}

export function notifyUsers(
  userIds: Iterable<string>,
  kind: NotificationKind,
  title: string,
  body: string,
  entityType = "",
  entityId = "",
  except = "",
) {
  const unique = new Set(userIds);
  for (const userId of unique) if (userId && userId !== except) notify(userId, kind, title, body, entityType, entityId);
}

export function staffUsers() {
  return (db.prepare("SELECT id FROM users WHERE active=1 AND role IN ('head_admin','admin','approver')").all() as { id: string }[]).map((u) => u.id);
}

export function markEntityRead(user: User, entityType: string, entityId: string) {
  db.prepare("UPDATE notifications SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE user_id=? AND entity_type=? AND entity_id=?").run(user.id, entityType, entityId);
}

export function notificationList(user: User) {
  const rows = db.prepare("SELECT id,kind,title,body,entity_type,entity_id,read_at,created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 40").all(user.id) as Record<string, unknown>[];
  const unread = Number((db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE user_id=? AND read_at IS NULL").get(user.id) as { count: number }).count);
  return { notifications: rows, unread };
}
