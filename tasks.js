const { exec } = require('node:child_process');
const { deleteFoldersRecursive, buildReact, copyFiles, npmInstall } = require('@iobroker/build-tools');

function buildAdmin() {
    return buildReact(`${__dirname}/src-admin/`, { rootDir: `${__dirname}/src-admin/`, vite: true });
}

function buildDevices() {
    return buildReact(`${__dirname}/src-devices/`, { rootDir: `${__dirname}/src-devices/`, vite: true });
}

// The web components (`common.webComponents`): one `vite build` per component, so that each one is ONE module
// file - see src-webcomponents/vite.config.ts. `npm run build` there runs all of them.
function buildWebComponents() {
    return new Promise((resolve, reject) => {
        const child = exec('npm run build', { cwd: `${__dirname}/src-webcomponents/` }, error =>
            error ? reject(new Error(`Cannot build the web components: ${error.message}`)) : resolve(),
        );
        child.stdout?.pipe(process.stdout);
        child.stderr?.pipe(process.stderr);
    });
}

function cleanAdmin() {
    deleteFoldersRecursive(`${__dirname}/admin/custom`);
    deleteFoldersRecursive(`${__dirname}/src-admin/build`);
}

function cleanDevices() {
    deleteFoldersRecursive(`${__dirname}/admin/dm-widgets`);
    deleteFoldersRecursive(`${__dirname}/src-devices/build`);
}

function cleanWebComponents() {
    deleteFoldersRecursive(`${__dirname}/admin/webcomponents`);
    deleteFoldersRecursive(`${__dirname}/src-webcomponents/build`);
}

// `mf-manifest.json` is copied on purpose: admin 8 fetches it next to the remote entry to decide
// from the shared modules which GUI API generation this component was built against.
function copyAllAdminFiles() {
    copyFiles(['src-admin/build/**/*', '!src-admin/build/index.html'], 'admin/custom/');
    copyFiles(['src-admin/src/i18n/*.json'], 'admin/custom/i18n');
}

function copyAllDevicesFiles() {
    copyFiles(['src-devices/build/**/*', '!src-devices/build/index.html'], 'admin/dm-widgets/');
    copyFiles(['src-devices/img/**/*'], 'admin/dm-widgets');
    copyFiles(['src-devices/src/i18n/*.json'], 'admin/dm-widgets/i18n');
}

// the modules and their manifests (`<name>.json`, written and checked by the build)
function copyAllWebComponentsFiles() {
    copyFiles(['src-webcomponents/build/*.js', 'src-webcomponents/build/*.json'], 'admin/webcomponents/');
}

function webComponents() {
    cleanWebComponents();
    return npmInstall(`${__dirname}/src-webcomponents/`)
        .then(() => buildWebComponents())
        .then(() => copyAllWebComponentsFiles());
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
} else if (process.argv.includes('--wc')) {
    webComponents().catch(e => {
        console.error(e);
        process.exit(2);
    });
} else {
    cleanAdmin();
    cleanDevices();
    npmInstall(`${__dirname}/src-admin/`)
        .then(() => buildAdmin())
        .then(() => copyAllAdminFiles())
        .then(() => npmInstall(`${__dirname}/src-devices/`))
        .then(() => buildDevices())
        .then(() => copyAllDevicesFiles())
        .then(() => webComponents())
        .then(() => copyI18nFiles())
        .catch(e => {
            console.error(e);
            process.exit(2);
        });
}
