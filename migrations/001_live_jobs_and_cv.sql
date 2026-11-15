USE applier_jobes;

ALTER TABLE candidate_profiles
  ADD COLUMN cv_storage_key VARCHAR(64) NULL,
  ADD COLUMN cv_original_name VARCHAR(255) NULL,
  ADD COLUMN cv_size INT UNSIGNED NULL,
  ADD COLUMN cv_uploaded_at TIMESTAMP NULL;

ALTER TABLE jobs
  ADD COLUMN external_id VARCHAR(191) NULL,
  ADD COLUMN apply_url VARCHAR(1000) NULL,
  ADD UNIQUE KEY uq_jobs_source_external (source_name, external_id);
