const winston = require('winston');
const {LoggingWinston} = require('@google-cloud/logging-winston')

// const fs = require('fs');
// process.env.GOOGLE_APPLICATION_CREDENTIALS = process.env.RCLONE_CONFIG_GCS_SERVICE_ACCOUNT_FILE;
// const {Storage} = require('@google-cloud/storage');
// const storage = new Storage();
// const bucket = storage.bucket(process.env.RCLONE_CONFIG_GCS_BUCKET_NAME);

const loggingWinston = new LoggingWinston();
 
const logger = winston.createLogger({
  level: 'info',
  transports: [
    new winston.transports.Console(),
    // Add Stackdriver Logging
    loggingWinston,
  ]
});

const REMOTE_TYPE = {
    SFTP: 'sftp',
    GCS: 'gcs'
};

const CONFLICT_STRATEGY = {
    FROM_SOURCE: 'from_source',
    FROM_DEST: 'from_dest',
    DO_NOTHING: 'do_nothing'
};

var main = (async function () {

    logConfiguration(logger);

    process.env.RCLONE_CONFIG_SFTP_PASS = await obscurePassword(process.env.RCLONE_CONFIG_SFTP_PASS_PLAIN);

    const sourceUrl = buildRemoteUrl(process.env.RCLONE_SOURCE_TYPE, process.env.RCLONE_SOURCE_PATH);
    const destUrl = buildRemoteUrl(process.env.RCLONE_DEST_TYPE, process.env.RCLONE_DEST_PATH);

    const diffMap = await calculateDiff(sourceUrl, destUrl);
    logger.info(diffMap);

    // FIXME - deletion feature disabled; to be fixed later
    if (process.env.STRATEGY_MISSING != CONFLICT_STRATEGY.DO_NOTHING && false) {

        var filesToDelete = [];
        var remoteUrl = '';

        if (process.env.STRATEGY_MISSING == CONFLICT_STRATEGY.FROM_SOURCE) {

            diffMap.forEach((entry, key) => {
                if (!entry.src && entry.dst) {
                    filesToDelete.push(key);
                }
            });
            remoteUrl = sourceUrl;

        } else if (process.env.STRATEGY_MISSING == CONFLICT_STRATEGY.FROM_DEST) {

            diffMap.forEach((entry, key) => {
                if (entry.src && !entry.dst) {
                    filesToDelete.push(key);
                }
            });
            remoteUrl = destUrl;

        }

        await deleteFiles(filesToDelete, remoteUrl);
    }

    await twoWayCopy(sourceUrl, destUrl);

    // const filePath = './.init'
    // fs.closeSync(fs.openSync(filePath, 'w'))
    // await bucket.upload(filePath);

})();

function logConfiguration(logger) {
    const config = {
        RCLONE_SOURCE_PATH: process.env.RCLONE_SOURCE_PATH,
        RCLONE_SOURCE_TYPE: process.env.RCLONE_SOURCE_TYPE,
        RCLONE_DEST_PATH: process.env.RCLONE_DEST_PATH,
        RCLONE_DEST_TYPE: process.env.RCLONE_DEST_TYPE,
        RCLONE_CONFIG_SFTP_HOST: process.env.RCLONE_CONFIG_SFTP_HOST,
        RCLONE_CONFIG_SFTP_PORT: process.env.RCLONE_CONFIG_SFTP_PORT,
        RCLONE_CONFIG_GCS_BUCKET_NAME: process.env.RCLONE_CONFIG_GCS_BUCKET_NAME,
        STRATEGY_MISSING: process.env.STRATEGY_MISSING,
        STRATEGY_SIZE_DIFFERENT: process.env.STRATEGY_SIZE_DIFFERENT
    };
    logger.info(config);
}

async function obscurePassword(password) {
    return await spawnAndCaptureStdout('rclone', ['obscure', password]);
}

async function deleteFiles(files, remoteUrl) {
    files.forEach(async (file) => {
        // --min-size 12b used as a workaround for rclone not being able to handle empty directory objects on gcs (sized 11 bytes)
        // FIXME:
        // possible fix: https://github.com/ncw/rclone/pull/3009
        const args = ['delete', '--min-size', '12b', `${remoteUrl}/${file}`];
        logger.info(args);
        await spawnAndCaptureStdout('rclone', args);
    });
}

async function twoWayCopy(sourceUrl, destUrl) {

    // --min-size 12b used as a workaround for rclone not being able to handle empty directory objects on gcs (sized 11 bytes)
    // FIXME:
    // possible fix: https://github.com/ncw/rclone/pull/3009
    const commonArgs = ['copy', '--min-size', '12b', '--fast-list', '--no-update-modtime'];

    const sourceToDestArgs = commonArgs.slice(0);
    if (process.env.STRATEGY_SIZE_DIFFERENT != CONFLICT_STRATEGY.FROM_SOURCE) {
        sourceToDestArgs.push('--ignore-existing');
    }
    sourceToDestArgs.push(sourceUrl);
    sourceToDestArgs.push(destUrl);
    logger.info(sourceToDestArgs);
    await spawnAndCaptureStdout('rclone', sourceToDestArgs);

    const destToSourceArgs = commonArgs.slice(0);
    if (process.env.STRATEGY_SIZE_DIFFERENT != CONFLICT_STRATEGY.FROM_DEST) {
        destToSourceArgs.push('--ignore-existing');
    }
    destToSourceArgs.push(destUrl);
    destToSourceArgs.push(sourceUrl);
    logger.info(destToSourceArgs);
    await spawnAndCaptureStdout('rclone', destToSourceArgs);
}

async function calculateDiff(sourceUrl, destUrl) {

    // --min-size 12b used as a workaround for rclone not being able to handle empty directory objects on gcs (sized 11 bytes)
    // FIXME:
    // possible fix: https://github.com/ncw/rclone/pull/3009
    const commonArgs = ['lsjson', '-R', '--min-size', '12b', '--fast-list'];

    const sourceLsjsonArgs = commonArgs.slice(0);
    sourceLsjsonArgs.push(sourceUrl);
    logger.info(sourceLsjsonArgs);
    const sourceLsjsonOut = await spawnAndCaptureStdout('rclone', sourceLsjsonArgs);

    const destLsjsonArgs = commonArgs.slice(0);
    destLsjsonArgs.push(destUrl);
    logger.info(destLsjsonArgs);
    const destLsjsonOut = await spawnAndCaptureStdout('rclone', destLsjsonArgs);

    const sourceLsjson = JSON.parse(sourceLsjsonOut);
    const destLsjson = JSON.parse(destLsjsonOut);

    const lsMap = new Map();

    sourceLsjson.forEach(item => {
        if (!item.IsDir) {
            var file = { size: item.Size, modTime: item.ModTime };
            lsMap.set(item.Path, { src: file });
        }
    });

    destLsjson.forEach(item => {
        if (!item.IsDir) {
            var file = { size: item.Size, modTime: item.ModTime };
            if (lsMap.has(item.Path)) {
                var diffEntry = lsMap.get(item.Path);
                diffEntry.dst = file;
                lsMap.set(item.Path, diffEntry);
            } else {
                lsMap.set(item.Path, { dst: file });
            }
        }
    });

    lsMap.forEach((entry, key, map) => {
        if ((entry.src || { size: -1 }).size == (entry.dst || { size: -1 }).size) {
            lsMap.delete(key);
        }
    });

    return lsMap;
}

async function spawnAndCaptureStdout(cmd, args) {

    const { spawn } = require("child_process");

    const child = spawn(cmd, args);

    child.on('exit', code => {
        if ('0' != code) { throw new Error(`Exit code: ${code}`); }
    });

    child.on('error', err => {
        logger.error(err);
    });

    child.stderr.on('data', (data) => {
        logger.error(`${data}`);
    });

    const outBuffer = [];

    child.stdout.on('data', (data) => {
        outBuffer.push(data);
    });

    var out = '';
    child.stdout.on('end', () => {
        out = outBuffer.join('');
    });

    await new Promise(fulfill => child.on("close", fulfill));

    return out;
}

function buildRemoteUrl(type, path) {
    if (type == REMOTE_TYPE.SFTP) {
        return `${REMOTE_TYPE.SFTP}:${path}`;
    } else if (type == REMOTE_TYPE.GCS) {
        return `${REMOTE_TYPE.GCS}:${process.env.RCLONE_CONFIG_GCS_BUCKET_NAME}${path}`;
    }
}