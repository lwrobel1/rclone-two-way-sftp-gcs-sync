# rclone-two-way-sftp-gcs-sync

A dockerized nodejs app which uses [Rclone](https://rclone.org/) to perform a two-way file sync between **SFTP** and **Google Cloud Storage** remotes. Conflict resolution is controlled by environment variables: **STRATEGY_DELETED** and **STRATEGY_SIZE_DIFFERENT** which tell which remote should take precedence over the other. A single run performs a one-time sync. At least one remote **MUST** be a GCS remote because it's used to maintain state. Currently supports only username/password SFTP authentication. Hidden/system files (.\*) are excluded from the sync.

## Environment Variables

| Name                                       | Description                                                                                   | Default Value       |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------- |
| RCLONE\_CONFIG\_GCS\_SERVICE\_ACCOUNT_FILE | Path to the Service Account JSON file with access to GCS. Can be mounted using /config volume | /config/gcs_sa.json |
| RCLONE\_CONFIG\_GCS\_BUCKET\_NAME          | Name of the GCS bucket                                                                        | --                  |
| RCLONE\_CONFIG\_SFTP_HOST                  | SFTP IP/host                                                                                  | --                  |
| RCLONE\_CONFIG\_SFTP_PORT                  | SFTP port                                                                                     | 22                  |
| RCLONE\_CONFIG\_SFTP_USER                  | SFTP username                                                                                 | --                  |
| RCLONE\_CONFIG\_SFTP\_PASS\_PLAIN          | SFTP password (plain)                                                                         | --                  |
| RCLONE\_SOURCE\_TYPE                       | sftp \| gcs                                                                                   | --                  |
| RCLONE\_DEST\_TYPE                         | sftp \| gcs                                                                                   | --                  |
| RCLONE\_SYNC\_PATH                         | Base path to sync                                                                             | /                   |
| STRATEGY_DELETED                           | match\_source \| match\_dest                                                                  | match\_source         |
| STRATEGY\_SIZE\_DIFFERENT                  | match\_source \| match\_dest                                                                  | match\_source         |
