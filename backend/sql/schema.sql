PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL, mobile TEXT NOT NULL DEFAULT '', role TEXT NOT NULL CHECK(role IN ('head_admin','admin','approver','agent','team','member')),
 permissions TEXT NOT NULL DEFAULT '[]', avatar TEXT NOT NULL DEFAULT '', google_sub TEXT UNIQUE,
 active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS agents (
 id TEXT PRIMARY KEY, user_id TEXT UNIQUE REFERENCES users(id), name TEXT NOT NULL,
 email TEXT NOT NULL DEFAULT '', mobile TEXT NOT NULL DEFAULT '', areas TEXT NOT NULL DEFAULT '',
 bio TEXT NOT NULL DEFAULT '', avatar TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS properties (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), agent_id TEXT REFERENCES agents(id),
 title TEXT NOT NULL, description TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('House','Apartment','Plot','Commercial')),
 purpose TEXT NOT NULL CHECK(purpose IN ('sale','rent')), price REAL NOT NULL CHECK(price > 0),
 area REAL NOT NULL CHECK(area > 0), locality TEXT NOT NULL, address TEXT NOT NULL,
 bedrooms INTEGER NOT NULL DEFAULT 0, bathrooms INTEGER NOT NULL DEFAULT 0,
 amenities TEXT NOT NULL DEFAULT '[]', images TEXT NOT NULL DEFAULT '[]',
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending','approved','rejected','changes_requested')),
 availability TEXT NOT NULL DEFAULT 'available' CHECK(availability IN ('available','sold','rented')),
 document_review TEXT NOT NULL DEFAULT 'pending', review_note TEXT NOT NULL DEFAULT '',
 is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS files (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), property_id TEXT REFERENCES properties(id) ON DELETE CASCADE,
 name TEXT NOT NULL, mime TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('photo','document','avatar','logo')), size INTEGER NOT NULL, disk_name TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS favorites (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE, PRIMARY KEY(user_id,property_id));
CREATE TABLE IF NOT EXISTS tickets (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), property_id TEXT REFERENCES properties(id), agent_id TEXT REFERENCES agents(id),
 category TEXT NOT NULL, subject TEXT NOT NULL, message TEXT NOT NULL, mobile TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','resolved')), note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS news (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL, body TEXT NOT NULL,
 source_url TEXT NOT NULL DEFAULT '', source_name TEXT NOT NULL DEFAULT '', published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, author_id TEXT REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT REFERENCES users(id), action TEXT NOT NULL, target_id TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_properties_status_created ON properties(status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_properties_owner ON properties(owner_id);
CREATE INDEX IF NOT EXISTS idx_properties_agent ON properties(agent_id);
CREATE INDEX IF NOT EXISTS idx_files_property ON files(property_id);
CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
PRAGMA optimize;

CREATE TABLE IF NOT EXISTS service_providers (
 id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), name TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('plumber','electrician','architect','carpenter')),
 tier TEXT NOT NULL DEFAULT 'standard' CHECK(tier IN ('budget','standard','premium')),
 starting_price INTEGER NOT NULL CHECK(starting_price>=0), price_unit TEXT NOT NULL DEFAULT 'visit',
 mobile TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', areas TEXT NOT NULL, bio TEXT NOT NULL,
 experience INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS service_bookings (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), provider_id TEXT NOT NULL REFERENCES service_providers(id),
 category TEXT NOT NULL, provider_name TEXT NOT NULL, scheduled_date TEXT NOT NULL, time_slot TEXT NOT NULL,
 address TEXT NOT NULL, mobile TEXT NOT NULL, message TEXT NOT NULL,
 quoted_amount INTEGER NOT NULL CHECK(quoted_amount>=0), price_unit TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','confirmed','in_progress','completed','cancelled')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS booking_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, booking_id TEXT NOT NULL REFERENCES service_bookings(id), user_id TEXT NOT NULL REFERENCES users(id),
 status TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS booking_payments (
 id TEXT PRIMARY KEY, booking_id TEXT NOT NULL REFERENCES service_bookings(id), recorded_by TEXT NOT NULL REFERENCES users(id),
 amount INTEGER NOT NULL CHECK(amount>0), kind TEXT NOT NULL CHECK(kind IN ('payment','refund')),
 method TEXT NOT NULL CHECK(method IN ('cash','upi','bank')), reference TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(booking_id,reference)
);
CREATE TABLE IF NOT EXISTS booking_messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT, booking_id TEXT NOT NULL REFERENCES service_bookings(id), user_id TEXT NOT NULL REFERENCES users(id),
 message TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS provider_reviews (
 booking_id TEXT PRIMARY KEY REFERENCES service_bookings(id), provider_id TEXT NOT NULL REFERENCES service_providers(id), user_id TEXT NOT NULL REFERENCES users(id),
 rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), comment TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS feed_cache (scope TEXT PRIMARY KEY, payload TEXT NOT NULL, fetched_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_service_bookings_user ON service_bookings(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_bookings_provider ON service_bookings(provider_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_provider ON provider_reviews(provider_id);
CREATE INDEX IF NOT EXISTS idx_booking_messages ON booking_messages(booking_id,id);

CREATE TABLE IF NOT EXISTS ticket_messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id), message TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS notifications (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
 entity_type TEXT NOT NULL DEFAULT '', entity_id TEXT NOT NULL DEFAULT '',
 read_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ticket_messages ON ticket_messages(ticket_id,id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id,read_at,created_at DESC);
