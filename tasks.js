const { deleteFoldersRecursive, buildReact, copyFiles, npmInstall } = require('@iobroker/build-tools');

function buildAdmin() {
    return buildReact(`${__dirname}/src-admin/`, { rootDir: `${__dirname}/src-admin/`, vite: true });
}

function buildDevices() {
    return buildReact(`${__dirname}/src-devices/`, { rootDir: `${__dirname}/src-devices/`, vite: true });
}

function cleanAdmin() {
    deleteFoldersRecursive(`${__dirname}/admin/custom`);
    deleteFoldersRecursive(`${__dirname}/src-admin/build`);
}

function cleanDevices() {
    deleteFoldersRecursive(`${__dirname}/admin/dm-widgets`);
    deleteFoldersRecursive(`${__dirname}/src-devices/build`);
}

function copyAllAdminFiles() {
    copyFiles(
        ['src-admin/build/**/*', '!src-admin/build/index.html', '!src-admin/build/mf-manifest.json'],
        'admin/custom/',
    );
    copyFiles(['src-admin/src/i18n/*.json'], 'admin/custom/i18n');
}

function copyAllDevicesFiles() {
    copyFiles(
        ['src-devices/build/**/*', '!src-devices/build/index.html', '!src-devices/build/mf-manifest.json'],
        'admin/dm-widgets/',
    );
    copyFiles(['src-devices/src/i18n/*.json'], 'admin/dm-widgets/i18n');
}

function copyI18nFiles() {
    copyFiles(['src/lib/i18n/*.json'], 'build/lib/i18n/');
}

if (process.argv.includes('--admin-0-clean')) {
    cleanAdmin();
} else if (process.argv.includes('--admin-1-npm')) {
    npmInstall(`${__dirname}/src-admin/`).catch(e => console.error(e));
} else if (process.argv.includes('--admin-2-compile')) {
    buildAdmin().catch(e => console.error(e));
} else if (process.argv.includes('--admin-3-copy')) {
    copyAllAdminFiles();
} else if (process.argv.includes('--devices-0-clean')) {
    cleanDevices();
} else if (process.argv.includes('--devices-1-npm')) {
    npmInstall(`${__dirname}/src-devices/`).catch(e => console.error(e));
} else if (process.argv.includes('--devices-2-compile')) {
    buildDevices().catch(e => console.error(e));
} else if (process.argv.includes('--devices-3-copy')) {
    copyAllDevicesFiles();
} else {
    cleanAdmin();
    cleanDevices();
    npmInstall(`${__dirname}/src-admin/`)
        .then(() => buildAdmin())
        .then(() => copyAllAdminFiles())
        .then(() => npmInstall(`${__dirname}/src-devices/`))
        .then(() => buildDevices())
        .then(() => copyAllDevicesFiles())
        .then(() => copyI18nFiles())
        .catch(e => console.error(e));
}
