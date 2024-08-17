const fs = require('node:fs');

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = `${src}/${entry.name}`;
        const destPath = `${dest}/${entry.name}`;
        if (entry.name === 'asset-manifest.json' ||
            entry.name === 'index.html' ||
            entry.name.endsWith('.svg') ||
            entry.name === 'media' ||
            entry.name.includes('node_modules')
        ) {
            continue;
        }
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

copyDir(`${__dirname}/build`, `${__dirname}/../admin/custom`);
copyDir(`${__dirname}/src/i18n`, `${__dirname}/../admin/custom/i18n`);
