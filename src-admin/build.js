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

// Copy build output to admin/custom
copyDir(`${__dirname}/build/assets`, `${__dirname}/../admin/custom/assets`);

// Copy customComponents.js to the root of admin/custom (required by jsonConfig.json)
const customComponentsSrc = `${__dirname}/build/assets/customComponents.js`;
const customComponentsDest = `${__dirname}/../admin/custom/customComponents.js`;
if (fs.existsSync(customComponentsSrc)) {
    fs.copyFileSync(customComponentsSrc, customComponentsDest);
}

// Copy i18n files
copyDir(`${__dirname}/src/i18n`, `${__dirname}/../admin/custom/i18n`);
