const winston = require('winston');
const {LoggingWinston} = require('@google-cloud/logging-winston')

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

process.env.STRATEGY_MISSING = CONFLICT_STRATEGY.FROM_DEST;
process.env.STRATEGY_SIZE_DIFFERENT = CONFLICT_STRATEGY.FROM_SOURCE;

var main = (async function () {

    process.env.RCLONE_CONFIG_SFTP_PASS = await obscurePassword(process.env.RCLONE_CONFIG_SFTP_PASS_PLAIN);

    const sourceUrl = buildRemoteUrl(process.env.RCLONE_SOURCE_TYPE, process.env.RCLONE_SOURCE_PATH);
    const destUrl = buildRemoteUrl(process.env.RCLONE_DEST_TYPE, process.env.RCLONE_DEST_PATH);

    if (process.env.STRATEGY_MISSING != CONFLICT_STRATEGY.DO_NOTHING) {

        const diffMap = await calculateDiff(sourceUrl, destUrl);
        logger.info(diffMap);

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

})();

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

    const sourceLsjsonArgs = commonArgs.splice(0);

    sourceLsjsonArgs.push(sourceUrl);
    logger.info(sourceLsjsonArgs);
    const sourceLsjsonOut = await spawnAndCaptureStdout('rclone', sourceLsjsonArgs);

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