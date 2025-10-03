import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';
import { moduleFederationShared } from '@iobroker/adapter-react-v5/modulefederation.admin.config';
import packageJson from './package.json';

export default defineConfig(() => {
    const shared = moduleFederationShared(packageJson);
    
    return {
        build: {
            outDir: 'build',
            modulePreload: false,
            target: 'esnext',
            minify: false,
            cssCodeSplit: false,
        },
        plugins: [
            react(),
            federation({
                name: 'ConfigCustomPingSet',
                filename: 'customComponents.js',
                exposes: {
                    './Components': './src/Components.jsx',
                },
                shared,
            }),
        ],
        base: './',
        server: {
            port: 3000,
            proxy: {
                '/files': {
                    target: 'http://localhost:8081',
                    changeOrigin: true,
                },
                '/adapter': {
                    target: 'http://localhost:8081',
                    changeOrigin: true,
                },
                '/session': {
                    target: 'http://localhost:8081',
                    changeOrigin: true,
                },
                '/log': {
                    target: 'http://localhost:8081',
                    changeOrigin: true,
                },
                '/lib': {
                    target: 'http://localhost:8081',
                    changeOrigin: true,
                },
            },
        },
    };
});
