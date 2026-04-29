import config from '@iobroker/eslint-config';

export default [
    ...config,
    {
        languageOptions: {
            parserOptions: {
                allowDefaultProject: {
                    allow: ['*.js', '*.mjs'],
                },
                tsconfigRootDir: import.meta.dirname,
                // project: './tsconfig.json',
            },
        },
    },
    {
        // disable temporary the rule 'jsdoc/require-param' and enable 'jsdoc/require-jsdoc'
        rules: {
            'jsdoc/require-jsdoc': 'off',
            'jsdoc/require-param': 'off',
            'jsdoc/check-param-names': 'off',
        },
    },
    {
        ignores: [
            'node_modules/**/*',
            'build/**/*',
            'src-admin/**/*',
            'src-devices/build/**/*',
            'src-devices/node_modules/**/*',
            'src-devices/.__mf__temp/**/*',
            'admin/**/*',
            'test/**/*',
            'tmp/**/*',
            '**/*.mjs',
        ],
    },
];
