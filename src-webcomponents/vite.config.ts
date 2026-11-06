import react from '@vitejs/plugin-react';
import { checkManifest, getReactImportPath, REACT_SPECIFIERS } from '@iobroker/web-components';
import type { Plugin, UserConfig } from 'vite';

// with the extension: Vite may load its config natively, without a bundler that would add it
import { COMPONENT_NAMES, getManifestFile, getModuleFile, getModulePath, type ComponentName } from './src/constants.ts';
import { MANIFESTS } from './src/manifest.ts';

/**
 * The web components `<iob-ping-device>` and `<iob-ping-overview>`: one ES module each,
 * `admin/webcomponents/ping-device.js` and `ping-overview.js`, and its manifest `<name>.json` next to it
 * (`common.webComponents`). Every host - vis-2, devices, Aura, admin - reads them from `/adapter/ping/webcomponents/`.
 * No module federation: the host shares nothing but the socket.
 *
 * One build per component - `vite build --mode ping-device`, `vite build --mode ping-overview` (`npm run build`):
 * a host imports exactly one URL per component, so each module is one file, with the shared code compiled into
 * both. One build with two entries would move the shared code into a chunk of its own.
 *
 * React is not bundled: the four React imports point at `lib/esm/react-19.js`, which web and admin serve
 * beside `adapter/`. The path is relative to the module, so a path prefix of a reverse proxy stays.
 */

/** The module of each component */
const ENTRIES: Record<ComponentName, string> = {
    'ping-device': './src/PingDevice.tsx',
    'ping-overview': './src/PingOverview.tsx',
};

/** Writes `<name>.json` next to the module, checked like a host checks it */
function manifestFile(name: ComponentName): Plugin {
    return {
        name: 'ping-web-component-manifest',
        generateBundle() {
            const manifest = MANIFESTS[name];
            const problem = checkManifest(manifest);
            if (problem) {
                this.error(`${getManifestFile(name)}: ${problem}`);
            }
            if (manifest.module !== getModuleFile(name)) {
                this.error(`${getManifestFile(name)}: "module" must be "${getModuleFile(name)}"`);
            }
            this.emitFile({
                type: 'asset',
                fileName: getManifestFile(name),
                source: `${JSON.stringify(manifest, null, 4)}\n`,
            });
        },
    };
}

export default ({ mode }: { mode: string }): UserConfig => {
    const name = COMPONENT_NAMES.find(component => component === mode);
    if (!name) {
        throw new Error(`Build one component at a time: vite build --mode <${COMPONENT_NAMES.join('|')}>`);
    }
    const reactImport = getReactImportPath(getModulePath(name));

    return {
        plugins: [react(), manifestFile(name)],
        define: {
            'process.env.NODE_ENV': JSON.stringify('production'),
        },
        build: {
            target: 'es2022',
            outDir: './build',
            // the builds of all components write into the same folder: only the first one empties it
            emptyOutDir: name === COMPONENT_NAMES[0],
            lib: {
                entry: ENTRIES[name],
                formats: ['es'],
                fileName: (): string => getModuleFile(name),
            },
            rollupOptions: {
                external: [...REACT_SPECIFIERS],
                output: {
                    paths: Object.fromEntries(REACT_SPECIFIERS.map(specifier => [specifier, reactImport])),
                    // one file: a host imports exactly one URL
                    codeSplitting: false,
                    // library mode keeps whitespace for the bundler of a consumer; this module is loaded as it is
                    minify: true,
                },
            },
        },
    };
};
