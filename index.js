const winston = require('winston');
const { LoggingWinston } = require('@google-cloud/logging-winston')
const fs = require('fs');
const util = require('util');
const { Storage } = require('@google-cloud/storage');

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
    FROM_SOURCE: 'match_source',
    FROM_DEST: 'match_dest'
};

const CONFLICT_TYPE = {
    ADDED: 'added',
    DELETED_FROM_SOURCE: 'deleted_from_source',
    DELETED_FROM_DEST: 'deleted_from_dest',
    SIZE_DIFFERENT: 'size_different'
};

const STATE_FILE_PATH = '.state';

const INCLUDE_FILE_PATH = '.include';

var main = (async function () {

    setConfigurationDefaults();

    logConfiguration(logger);

    process.env.GOOGLE_APPLICATION_CREDENTIALS = process.env.RCLONE_CONFIG_GCS_SERVICE_ACCOUNT_FILE;
    const storage = new Storage();
    const bucket = storage.bucket(process.env.RCLONE_CONFIG_GCS_BUCKET_NAME);
    const bucketStateFilePath = getInitFilePath();
    const bucketStateFileExists = await bucketFileExists(bucket, bucketStateFilePath);

    process.env.RCLONE_CONFIG_SFTP_PASS = await obscurePassword(process.env.RCLONE_CONFIG_SFTP_PASS_PLAIN);

    const sourceUrl = buildRemoteUrl(process.env.RCLONE_SOURCE_TYPE, process.env.RCLONE_SYNC_PATH);
    const destUrl = buildRemoteUrl(process.env.RCLONE_DEST_TYPE, process.env.RCLONE_SYNC_PATH);

    let lastSync = new Date().getTime();
    if (bucketStateFileExists) {
        await bucket.file(bucketStateFilePath).download({ destination: STATE_FILE_PATH });
        lastSync = fs.readFileSync(STATE_FILE_PATH);
    }

    const diffMap = await calculateDiff(sourceUrl, destUrl, lastSync, bucketStateFileExists);
    logger.info("diffMap: " + util.format(diffMap));

    const filesToDelete = new Map();

    diffMap.forEach((entry, key) => {
        if (process.env.STRATEGY_DELETED == CONFLICT_STRATEGY.FROM_SOURCE && CONFLICT_TYPE.DELETED_FROM_SOURCE == entry.type) {
            filesToDelete.set(key, destUrl);
        } else if (process.env.STRATEGY_DELETED == CONFLICT_STRATEGY.FROM_DEST && CONFLICT_TYPE.DELETED_FROM_DEST == entry.type) {
            filesToDelete.set(key, sourceUrl);
        }
    });

    await deleteFiles(filesToDelete);

    if (diffMap.size > 0) {
        const directories = getSynchDirs();
        if (directories != null && directories.length > 0) {
            await asyncForEach(directories, async (pathPart) => {
                const resourcesArray = extractWithPathPart(diffMap, pathPart);
                if (resourcesArray.length > 0) {
                    logger.info("synchronizing directory: " + pathPart);
                    await twoWayCopy(sourceUrl, destUrl, resourcesArray);
                }
            });
        } else {
            await twoWayCopy(sourceUrl, destUrl, Array.from(diffMap.keys()));
        }
        await storeStateFile(bucket, bucketStateFilePath);
    }
})();

function extractWithPathPart(diffMap, value) {
    const resourcesArray = [];
    diffMap.forEach((entry, key) => {
        if (!key.startsWith("/")) {
            key = "/" + key;
        }
        if (key.includes(value)) {
            resourcesArray.push(key);
        }
    });
    return resourcesArray;
}


async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array);
    }
}

function getSynchDirs() {
    return process.env.RCLONE_SYNC_DIRS == '' || process.env.RCLONE_SYNC_DIRS == null || process.env.RCLONE_SYNC_DIRS == undefined ? null : buildDirs(process.env.RCLONE_SYNC_DIRS);
}

function buildDirs(dirs) {
    if (dirs != null) {
        const paths = dirs.split(',');
        return paths.map(path => {
            if (!path.startsWith("/")) {
                path = "/" + path;
            }
            if (!path.endsWith("/")) {
                path = path + "/";
            }
            return path;
        });
    }
    return null;
}


function getInitFilePath() {
    return `${process.env.RCLONE_SYNC_PATH}/${STATE_FILE_PATH}`;
}

async function storeStateFile(bucket, bucketInitFilePath) {
    fs.writeFileSync(STATE_FILE_PATH, new Date().getTime());
    await bucket.upload(STATE_FILE_PATH, { destination: bucketInitFilePath });
}

async function bucketFileExists(bucket, bucketFilePath) {
    const bucketFile = bucket.file(bucketFilePath);
    const existsResponse = await bucketFile.exists();
    if (existsResponse[0]) {
        return true;
    } else {
        return false;
    }
}

function setConfigurationDefaults() {
    if (!process.env.RCLONE_CONFIG_GCS_SERVICE_ACCOUNT_FILE) {
        process.env.RCLONE_CONFIG_GCS_SERVICE_ACCOUNT_FILE = '/config/gcs_sa.json';
    }
    if (!process.env.RCLONE_CONFIG_SFTP_PORT) {
        process.env.RCLONE_CONFIG_SFTP_PORT = '22';
    }
    if (!process.env.RCLONE_SYNC_PATH) {
        process.env.RCLONE_SYNC_PATH = '/';
    }
    if (!process.env.STRATEGY_DELETED) {
        process.env.STRATEGY_DELETED = CONFLICT_STRATEGY.FROM_DEST;
    }
    if (!process.env.STRATEGY_SIZE_DIFFERENT) {
        process.env.STRATEGY_SIZE_DIFFERENT = CONFLICT_STRATEGY.FROM_SOURCE;
    }
}

function logConfiguration(logger) {
    const config = {
        RCLONE_CONFIG_GCS_SERVICE_ACCOUNT_FILE: process.env.RCLONE_CONFIG_GCS_SERVICE_ACCOUNT_FILE,
        RCLONE_CONFIG_GCS_BUCKET_NAME: process.env.RCLONE_CONFIG_GCS_BUCKET_NAME,
        RCLONE_CONFIG_SFTP_HOST: process.env.RCLONE_CONFIG_SFTP_HOST,
        RCLONE_CONFIG_SFTP_PORT: process.env.RCLONE_CONFIG_SFTP_PORT,
        RCLONE_SOURCE_TYPE: process.env.RCLONE_SOURCE_TYPE,
        RCLONE_DEST_TYPE: process.env.RCLONE_DEST_TYPE,
        RCLONE_SYNC_PATH: process.env.RCLONE_SYNC_PATH,
        RCLONE_SYNC_DIRS: process.env.RCLONE_SYNC_DIRS,
        STRATEGY_DELETED: process.env.STRATEGY_DELETED,
        STRATEGY_SIZE_DIFFERENT: process.env.STRATEGY_SIZE_DIFFERENT
    };
    logger.info("configuration: " + util.format(config));
}

async function obscurePassword(password) {
    return await spawnAndCaptureStdout('rclone', ['obscure', password]);
}

async function deleteFiles(filesToDelete) {
    filesToDelete.forEach(async (remoteUrl, file) => {
        // --min-size 12b used as a workaround for rclone not being able to handle empty directory objects on gcs (sized 11 bytes)
        // FIXME:
        // possible fix: https://github.com/ncw/rclone/pull/3009
        // const args = ['delete', '--min-size', '12b', `${remoteUrl}/${file}`];
        const args = ['delete', `${remoteUrl}/${file}`];
        logger.info(args);
        await spawnAndCaptureStdout('rclone', args);
    });
}

async function twoWayCopy(sourceUrl, destUrl, files) {

    createIncludeFile(files);

    // --min-size 12b used as a workaround for rclone not being able to handle empty directory objects on gcs (sized 11 bytes)
    // FIXME:
    // possible fix: https://github.com/ncw/rclone/pull/3009
    const commonArgs = ['copy', '--min-size', '12b', '--fast-list', '--no-update-modtime', '--ignore-case', '--include-from', INCLUDE_FILE_PATH, '--filter-from', 'rclone-filter.txt'];

    const sourceToDestArgs = commonArgs.slice(0);
    if (process.env.STRATEGY_SIZE_DIFFERENT != CONFLICT_STRATEGY.FROM_SOURCE) {
        sourceToDestArgs.push('--ignore-existing');
    }
    sourceToDestArgs.push(sourceUrl);
    sourceToDestArgs.push(destUrl);
    logger.info("sourceToDestArgs: " + sourceToDestArgs);
    await spawnAndCaptureStdout('rclone', sourceToDestArgs);

    const destToSourceArgs = commonArgs.slice(0);
    if (process.env.STRATEGY_SIZE_DIFFERENT != CONFLICT_STRATEGY.FROM_DEST) {
        destToSourceArgs.push('--ignore-existing');
    }
    destToSourceArgs.push(destUrl);
    destToSourceArgs.push(sourceUrl);
    logger.info("destToSourceArgs: " + destToSourceArgs);
    await spawnAndCaptureStdout('rclone', destToSourceArgs);
}

async function calculateDiff(sourceUrl, destUrl, lastSync, bucketStateFileExists) {

    prepareDiffIncludeFile();

    // --min-size 12b used as a workaround for rclone not being able to handle empty directory objects on gcs (sized 11 bytes)
    // FIXME:
    // possible fix: https://github.com/ncw/rclone/pull/3009

    const commonArgs = ['lsjson', '-R', '--min-size', '12b', '--fast-list', '--include-from', INCLUDE_FILE_PATH, '--filter-from', 'rclone-filter.txt'];

    const sourceLsjsonArgs = commonArgs.slice(0);
    sourceLsjsonArgs.push(sourceUrl);
    logger.info("sourceLsjsonArgs: " + sourceLsjsonArgs);
    const sourceLsjsonOut = await spawnAndCaptureStdout('rclone', sourceLsjsonArgs);

    const destLsjsonArgs = commonArgs.slice(0);
    destLsjsonArgs.push(destUrl);
    logger.info("destLsjsonArgs: " + destLsjsonArgs);
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
        } else if (entry.src && entry.dst) {
            entry.type = CONFLICT_TYPE.SIZE_DIFFERENT;
        } else if (entry.src && !entry.dst && new Date(entry.src.modTime).getTime() <= lastSync && bucketStateFileExists) {
            entry.type = CONFLICT_TYPE.DELETED_FROM_DEST;
        } else if (!entry.src && entry.dst && new Date(entry.dst.modTime).getTime() <= lastSync && bucketStateFileExists) {
            entry.type = CONFLICT_TYPE.DELETED_FROM_SOURCE;
        } else {
            entry.type = CONFLICT_TYPE.ADDED;
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

function prepareDiffIncludeFile() {
    var dirs = process.env.RCLONE_SYNC_DIRS;

    var paths = ["*"];
    if (dirs != '' && dirs != null && dirs != undefined) {
        var pathsArray = dirs.split(',');
        paths = pathsArray.map(path => {
            if (!path.endsWith("/")) {
                path = path + "/";
            }
            return path + "**";
        });
    }

    createIncludeFile(paths);
}

function createIncludeFile(resources){
    fs.writeFileSync(INCLUDE_FILE_PATH, '');
    resources.forEach(file => {
        fs.appendFileSync(INCLUDE_FILE_PATH, file + '\r\n');
    });
}