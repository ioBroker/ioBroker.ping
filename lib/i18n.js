const fs = require('node:fs');
const path = require('node:path');

let language = 'en';
let words = null;

function init(lang) {
    language = lang;
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

function getText(key, lang) {
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
    return words[key][lang] || words[key].en || key;
}

function getAllTexts(key) {
    if (!words) {
        init();
    }
    return words[key];
}

module.exports = {
    init,
    t: getText,
    tt: getAllTexts,
}
