-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "docket_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "case_number" TEXT NOT NULL,
    "case_title" TEXT NOT NULL,
    "case_chapter" TEXT NOT NULL,
    "adversary_number" TEXT,
    "adversary_title" TEXT,
    "hearing_date" DATETIME NOT NULL,
    "hearing_time" TEXT NOT NULL,
    "hearing_matter" TEXT NOT NULL,
    "hearing_judge" TEXT NOT NULL,
    "courtroom" TEXT,
    "moving_party" TEXT,
    "opposing_party" TEXT,
    "trustee" TEXT,
    "is_zoom" BOOLEAN NOT NULL DEFAULT false,
    "zoom_meeting_id" TEXT,
    "zoom_passcode" TEXT,
    "zoom_phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "status_note" TEXT,
    "comment" TEXT,
    "manually_edited" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "created_by" TEXT,
    CONSTRAINT "docket_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "displays" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "judge_filter" TEXT,
    "courtroom_filter" TEXT,
    "chapter_filter" TEXT,
    "show_stricken" BOOLEAN NOT NULL DEFAULT false,
    "show_zoom_info" BOOLEAN NOT NULL DEFAULT true,
    "highlight_current" BOOLEAN NOT NULL DEFAULT true,
    "orientation" TEXT NOT NULL DEFAULT 'landscape',
    "theme" TEXT NOT NULL DEFAULT 'default',
    "columns" TEXT NOT NULL DEFAULT '["NAME","CH","TIME","CASE","MATTER","ROOM"]',
    "show_weather" BOOLEAN NOT NULL DEFAULT true,
    "weather_location" TEXT,
    "notice_text" TEXT NOT NULL DEFAULT 'Please turn your phones OFF in the Courthouse',
    "ticker_enabled" BOOLEAN NOT NULL DEFAULT true,
    "ticker_speed" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "last_heartbeat" DATETIME,
    "ip_address" TEXT,
    "schedule_enabled" BOOLEAN NOT NULL DEFAULT false,
    "schedule_config" TEXT NOT NULL DEFAULT '{}',
    "screensaver_type" TEXT NOT NULL DEFAULT 'black',
    "docket_view_mode" TEXT NOT NULL DEFAULT 'all',
    "display_type" TEXT NOT NULL DEFAULT 'courtroom',
    "wayfinding_config" TEXT,
    "rtsp_url_1" TEXT,
    "rtsp_url_2" TEXT,
    "camera_label_1" TEXT,
    "camera_label_2" TEXT,
    "camera_rotate_interval" INTEGER,
    "camera_config" TEXT,
    "show_content_cards" BOOLEAN NOT NULL DEFAULT false,
    "display_template" TEXT,
    "api_key_hash" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "display_docket_entries" (
    "display_id" TEXT NOT NULL,
    "docket_entry_id" TEXT NOT NULL,

    PRIMARY KEY ("display_id", "docket_entry_id"),
    CONSTRAINT "display_docket_entries_display_id_fkey" FOREIGN KEY ("display_id") REFERENCES "displays" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "display_docket_entries_docket_entry_id_fkey" FOREIGN KEY ("docket_entry_id") REFERENCES "docket_entries" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "display_announcements" (
    "display_id" TEXT NOT NULL,
    "announcement_id" TEXT NOT NULL,

    PRIMARY KEY ("display_id", "announcement_id"),
    CONSTRAINT "display_announcements_display_id_fkey" FOREIGN KEY ("display_id") REFERENCES "displays" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "display_announcements_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "display_content_cards" (
    "display_id" TEXT NOT NULL,
    "content_card_id" TEXT NOT NULL,

    PRIMARY KEY ("display_id", "content_card_id"),
    CONSTRAINT "display_content_cards_display_id_fkey" FOREIGN KEY ("display_id") REFERENCES "displays" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "display_content_cards_content_card_id_fkey" FOREIGN KEY ("content_card_id") REFERENCES "content_cards" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "text" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "created_by" TEXT,
    CONSTRAINT "announcements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "permissions" TEXT NOT NULL DEFAULT '["read"]',
    "display_id" TEXT,
    "expires_at" DATETIME,
    "last_used_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "api_keys_display_id_fkey" FOREIGN KEY ("display_id") REFERENCES "displays" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "user_id" TEXT,
    "api_key_id" TEXT,
    "changes" TEXT,
    "ip_address" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "audit_logs_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL,
    "updated_by" TEXT,
    CONSTRAINT "settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "calendar_metadata" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "judge_name" TEXT NOT NULL,
    "judge_code" TEXT NOT NULL,
    "courtroom" TEXT,
    "calendar_date" DATETIME NOT NULL,
    "generated_at" DATETIME,
    "is_zoom_calendar" BOOLEAN NOT NULL DEFAULT false,
    "zoom_meeting_id" TEXT,
    "zoom_passcode" TEXT,
    "zoom_phone" TEXT,
    "parameters" TEXT,
    "source_filename" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "import_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "judge_name" TEXT,
    "judge_code" TEXT,
    "source_url" TEXT,
    "filename" TEXT,
    "entries_found" INTEGER NOT NULL DEFAULT 0,
    "entries_created" INTEGER NOT NULL DEFAULT 0,
    "entries_updated" INTEGER NOT NULL DEFAULT 0,
    "entries_skipped" INTEGER NOT NULL DEFAULT 0,
    "entries_removed" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'running',
    "error_message" TEXT,
    "duration_ms" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "content_cards" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'info',
    "icon" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" DATETIME,
    "is_emergency" BOOLEAN NOT NULL DEFAULT false,
    "emergency_level" INTEGER,
    "emergency_target" TEXT,
    "activated_at" DATETIME,
    "activated_by_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "created_by" TEXT,
    CONSTRAINT "content_cards_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "content_cards_activated_by_id_fkey" FOREIGN KEY ("activated_by_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "cached_news_articles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "published_at" DATETIME,
    "fetched_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "display_type_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_built_in" BOOLEAN NOT NULL DEFAULT false,
    "components" TEXT NOT NULL,
    "layout" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "created_by" TEXT,
    CONSTRAINT "display_type_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "docket_entries_case_number_hearing_date_hearing_time_hearing_matter_key" ON "docket_entries"("case_number", "hearing_date", "hearing_time", "hearing_matter");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_metadata_judge_code_calendar_date_key" ON "calendar_metadata"("judge_code", "calendar_date");

-- CreateIndex
CREATE UNIQUE INDEX "cached_news_articles_url_key" ON "cached_news_articles"("url");

-- CreateIndex
CREATE UNIQUE INDEX "display_type_templates_slug_key" ON "display_type_templates"("slug");

