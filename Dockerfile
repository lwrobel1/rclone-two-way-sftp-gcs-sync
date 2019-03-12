FROM node:8.15-alpine

# Default env. variables
ENV ARCH=amd64
ENV RCLONE_CONFIG_GCS_TYPE='google cloud storage'
ENV RCLONE_CONFIG_GCS_OBJECT_ACL='projectPrivate'
ENV RCLONE_CONFIG_GCS_BUCKET_ACL='projectPrivate'
ENV RCLONE_CONFIG_GCS_SERVICE_ACCOUNT_FILE='/config/gcs_sa.json'
ENV RCLONE_CONFIG_SFTP_TYPE='sftp'
ENV RCLONE_CONFIG_SFTP_PORT='22'
ENV RCLONE_SOURCE_PATH='/'
ENV RCLONE_DEST_PATH='/'
ENV STRATEGY_MISSING='from_source'
ENV STRATEGY_SIZE_DIFFERENT='from_source'

RUN apk update \
  && apk add ca-certificates wget bash \
  && rm -rf /var/cache/apk/* \
  && cd /tmp \
  && wget -q https://downloads.rclone.org/rclone-current-linux-${ARCH}.zip \
  && unzip /tmp/rclone-current-linux-${ARCH}.zip \
  && mv /tmp/rclone-*-linux-${ARCH}/rclone /usr/bin \
  && rm -r /tmp/rclone*

VOLUME /config

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN npm install
# If you are building your code for production
# RUN npm ci --only=production

# Bundle app source
COPY . .

# COPY entrypoint.sh /
ENTRYPOINT ["./entrypoint.sh"]