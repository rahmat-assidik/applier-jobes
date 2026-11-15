CREATE DATABASE IF NOT EXISTS applier_jobes
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE applier_jobes;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS candidate_profiles (
  user_id BIGINT UNSIGNED NOT NULL,
  headline VARCHAR(160) NOT NULL DEFAULT '',
  location VARCHAR(120) NOT NULL DEFAULT '',
  summary TEXT NOT NULL,
  skills VARCHAR(500) NOT NULL DEFAULT '',
  cv_storage_key VARCHAR(64) NULL,
  cv_original_name VARCHAR(255) NULL,
  cv_size INT UNSIGNED NULL,
  cv_uploaded_at TIMESTAMP NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_candidate_profiles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS job_preferences (
  user_id BIGINT UNSIGNED NOT NULL,
  target_titles VARCHAR(255) NOT NULL DEFAULT '',
  locations VARCHAR(255) NOT NULL DEFAULT '',
  work_mode ENUM('any', 'onsite', 'hybrid', 'remote') NOT NULL DEFAULT 'any',
  employment_type ENUM('any', 'full-time', 'contract', 'internship', 'part-time') NOT NULL DEFAULT 'any',
  minimum_salary INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_job_preferences_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS companies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(160) NOT NULL,
  location VARCHAR(120) NOT NULL DEFAULT '',
  website VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_companies_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  location VARCHAR(120) NOT NULL DEFAULT '',
  work_mode ENUM('onsite', 'hybrid', 'remote') NOT NULL DEFAULT 'onsite',
  employment_type ENUM('full-time', 'contract', 'internship', 'part-time') NOT NULL DEFAULT 'full-time',
  salary_min INT UNSIGNED NULL,
  salary_max INT UNSIGNED NULL,
  description TEXT NOT NULL,
  source_name VARCHAR(100) NOT NULL DEFAULT 'Contoh internal',
  external_id VARCHAR(191) NULL,
  apply_url VARCHAR(1000) NULL,
  published_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id),
  UNIQUE KEY uq_jobs_source_external (source_name, external_id),
  KEY ix_jobs_active_published (is_active, published_at),
  KEY ix_jobs_title (title),
  CONSTRAINT fk_jobs_company FOREIGN KEY (company_id) REFERENCES companies (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS saved_jobs (
  user_id BIGINT UNSIGNED NOT NULL,
  job_id BIGINT UNSIGNED NOT NULL,
  saved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, job_id),
  KEY ix_saved_jobs_job (job_id),
  CONSTRAINT fk_saved_jobs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_saved_jobs_job FOREIGN KEY (job_id) REFERENCES jobs (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS applications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  job_id BIGINT UNSIGNED NOT NULL,
  status ENUM('draft', 'submitted', 'viewed', 'screening', 'interview', 'offer', 'rejected', 'withdrawn') NOT NULL DEFAULT 'draft',
  notes TEXT NOT NULL,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_applications_user_job (user_id, job_id),
  KEY ix_applications_user_status (user_id, status, updated_at),
  CONSTRAINT fk_applications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_applications_job FOREIGN KEY (job_id) REFERENCES jobs (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS application_status_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  application_id BIGINT UNSIGNED NOT NULL,
  previous_status VARCHAR(32) NULL,
  new_status VARCHAR(32) NOT NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_application_history_application (application_id, changed_at),
  CONSTRAINT fk_application_history_application FOREIGN KEY (application_id) REFERENCES applications (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS automation_rules (
  user_id BIGINT UNSIGNED NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  target_titles VARCHAR(255) NOT NULL DEFAULT '',
  locations VARCHAR(255) NOT NULL DEFAULT '',
  work_mode ENUM('any', 'onsite', 'hybrid', 'remote') NOT NULL DEFAULT 'any',
  weekly_limit TINYINT UNSIGNED NOT NULL DEFAULT 5,
  approval_mode ENUM('manual_review') NOT NULL DEFAULT 'manual_review',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_automation_rules_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sessions (
  session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
  expires INT UNSIGNED NOT NULL,
  data MEDIUMTEXT COLLATE utf8mb4_bin,
  PRIMARY KEY (session_id),
  KEY ix_sessions_expires (expires)
) ENGINE=InnoDB;

INSERT INTO companies (name, location, website) VALUES
  ('Kreasi Digital', 'Jakarta Selatan', 'https://example.com'),
  ('Orbit Teknologi', 'Bandung', 'https://example.com'),
  ('Ruang Kreatif', 'Jakarta Pusat', 'https://example.com'),
  ('Nusa Tech', 'Yogyakarta', 'https://example.com'),
  ('Karya Bersama', 'Jakarta', 'https://example.com')
ON DUPLICATE KEY UPDATE location = VALUES(location);

INSERT INTO jobs (company_id, title, location, work_mode, employment_type, salary_min, salary_max, description, source_name, published_at)
SELECT c.id, seed.title, seed.location, seed.work_mode, seed.employment_type, seed.salary_min, seed.salary_max, seed.description, 'Contoh internal', seed.published_at
FROM (
  SELECT 'Kreasi Digital' AS company_name, 'Product Designer' AS title, 'Jakarta Selatan' AS location, 'hybrid' AS work_mode, 'full-time' AS employment_type, 9000000 AS salary_min, 13000000 AS salary_max, 'Merancang pengalaman produk digital bersama tim produk dan engineering. Contoh lowongan untuk pengembangan lokal.' AS description, NOW() - INTERVAL 2 HOUR AS published_at
  UNION ALL SELECT 'Orbit Teknologi', 'UI/UX Designer', 'Bandung', 'remote', 'full-time', 8000000, 12000000, 'Mengembangkan alur pengguna, riset, dan prototipe produk. Contoh lowongan untuk pengembangan lokal.', NOW() - INTERVAL 1 DAY
  UNION ALL SELECT 'Ruang Kreatif', 'Senior Visual Designer', 'Jakarta Pusat', 'onsite', 'full-time', 10000000, 15000000, 'Memimpin arah visual dan kolaborasi desain lintas tim. Contoh lowongan untuk pengembangan lokal.', NOW() - INTERVAL 3 DAY
  UNION ALL SELECT 'Nusa Tech', 'UX Researcher', 'Yogyakarta', 'remote', 'contract', 7000000, 10000000, 'Melakukan riset pengguna dan menyusun rekomendasi produk. Contoh lowongan untuk pengembangan lokal.', NOW() - INTERVAL 4 DAY
  UNION ALL SELECT 'Karya Bersama', 'Product Designer', 'Jakarta', 'hybrid', 'full-time', 8500000, 12500000, 'Membuat prototipe dan menguji pengalaman layanan digital. Contoh lowongan untuk pengembangan lokal.', NOW() - INTERVAL 5 DAY
) AS seed
JOIN companies c ON c.name = seed.company_name
WHERE NOT EXISTS (
  SELECT 1 FROM jobs existing
  WHERE existing.company_id = c.id AND existing.title = seed.title AND existing.location = seed.location
);
