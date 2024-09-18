const fs = require('node:fs');
const path = require('node:path');

let language = 'en';
let words = null;

async function init(langOrAdmin) {
    if (langOrAdmin && typeof langOrAdmin === 'object') {
        const systemConfig = await langOrAdmin.getForeignObjectAsync('system.config');
        language = systemConfig.common.language;
    } else if (typeof langOrAdmin === 'string') {
        language = langOrAdmin;
    }
    const files = fs.readdirSync(path.join(__dirname, '/i18n'));
    words = {};
    files.forEach(file => {
        if (file.endsWith('.json')) {
            const lang = file.split('.')[0];
            const wordsForLanguage = JSON.parse(fs.readFileSync(path.join(__dirname, `/i18n/${file}`)).toString('utf8'));
            Object.keys(wordsForLanguage).forEach(key => {
                if (!words[key]) {
                    words[key] = {};
                }
                words[key][lang] = wordsForLanguage[key];
            });
        }
    });
}

function getText(key, lang, ...args) {
    lang = lang || language;
    if (!language && lang) {
        language = lang;
    }
    if (!words && !lang) {
        throw new Error('i18n not initialized');
    }
    if (!words) {
        init(lang);
    }
    if (!words[key]) {
        return key;
    }
    let text = words[key][lang] || words[key].en || key;
    if (args.length) {
        for (let i = 0; i < args.length; i++) {
            text = text.replace(`%s`, args[i]);
        }
    }
    return text;
}

function getAllTexts(key, ...args) {
    if (!words) {
        init();
    }
    if (words[key]) {
        if (words[key].en && words[key].en.includes('%s')) {
            const result = {};
            Object.keys(words[key]).forEach(lang => {
                for (let i = 0; i < args.length; i++) {
                    result[lang] = words[key][lang].replace(`%s`, args[i]);
                }
            });
            return result;
        }
        return words[key];
    }

    return key;
}

module.exports = {
    init,
    t: getText,
    tt: getAllTexts,
}