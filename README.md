# rclone-two-way-sftp-gcs-sync

A dockerized nodejs app which uses [Rclone](https://rclone.org/) to perform a two-way file sync between **SFTP** and **Google Cloud Storage** remotes. Conflict resolution is controlled by environment variables: **STRATEGY_MISSING** and **STRATEGY_SIZE_DIFFERENT** which tell which remote should take precedence over the other. A single run performs a one-time sync.

## Environment Variables

| Name                                       | Description                                                                                   | Default Value       |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------- |
| RCLONE\_CONFIG\_GCS\_SERVICE\_ACCOUNT_FILE | Path to the Service Account JSON file with access to GCS. Can be mounted using /config volume | /config/gcs_sa.json |
| RCLONE\_CONFIG\_GCS\_BUCKET\_NAME          | Name of the GCS bucket                                                                        | --                  |
| RCLONE\_CONFIG\_SFTP_HOST                  | SFTP IP/host                                                                                  | --                  |
| RCLONE\_CONFIG\_SFTP_PORT                  | SFTP port                                                                                     | 22                  |
| RCLONE\_CONFIG\_SFTP_USER                  | SFTP username                                                                                 | --                  |
| RCLONE\_CONFIG\_SFTP_PASS_PLAIN            | SFTP password (plain)                                                                         | --                  |
| RCLONE\_SOURCE\_TYPE                       | sftp \| gcs                                                                                    | --                  |
| RCLONE\_DEST\_TYPE                         | sftp \| gcs                                                                                    | --                  |
| RCLONE\_SOURCE\_PATH                       | Base path to sync                                                                             | /                   |
| RCLONE\_DEST\_PATH                         | Base path to sync                                                                             | /                   |
| STRATEGY_MISSING                           | from\_source \| from\_dest \| do_nothing                                                          | from\_source         |
| STRATEGY\_SIZE\_DIFFERENT                  | from\_source \| from\_dest \| do_nothing                                                        | from\_source         |
