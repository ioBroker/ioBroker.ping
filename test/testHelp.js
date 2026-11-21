const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { COMMANDS, HELP } = require('../build/lib/help');

/** The commands of the switch in `processMessage` of src/main.ts */
function commandsOfMain() {
    const source = fs.readFileSync(path.join(__dirname, '../src/main.ts'), 'utf8');
    const start = source.indexOf('async processMessage(');
    const end = source.indexOf('async pingAll(');
    assert.ok(start > 0 && end > start, 'processMessage found');
    return [...source.slice(start, end).matchAll(/case '([^']+)':/g)].map(m => m[1]);
}

/** The commands the Device Manager of dm-utils answers (main.ts leaves every dm:* message to it) */
function commandsOfDeviceManager() {
    const file = path.join(path.dirname(require.resolve('@iobroker/dm-utils')), 'DeviceManagement.js');
    return [...fs.readFileSync(file, 'utf8').matchAll(/case '(dm:[^']+)':/g)].map(m => m[1]);
}

describe('Message help', function () {
    it('lists exactly the commands processMessage and dm-utils answer, each once', function () {
        const names = COMMANDS.map(c => c.command);
        assert.strictEqual(new Set(names).size, names.length);
        const dm = commandsOfDeviceManager();
        assert.ok(dm.length > 0, 'dm:* commands found');
        assert.deepStrictEqual([...names].sort(), [...commandsOfMain(), ...dm].sort());
    });

    it('marks the commands with an effect as writing', function () {
        const writing = [
            'wake',
            'wakeOnLan',
            'ping:settings:browse',
            'ping:addIpAddress',
            'ping:save',
            'dm:instanceAction',
            'dm:deviceAction',
            'dm:deviceControl',
            'dm:actionProgress',
        ];
        for (const { command, write } of COMMANDS) {
            assert.strictEqual(write, writing.includes(command), command);
        }
    });

    it('names every command', function () {
        for (const { command } of COMMANDS.filter(c => c.command !== 'help')) {
            assert.ok(HELP.includes(command), command);
        }
        assert.ok(HELP.includes('sendTo ping.0'));
    });

    it('marks the commands of the shared catalog and names them in the text', function () {
        const marked = Object.fromEntries(COMMANDS.filter(c => c.standard).map(c => [c.command, c.standard]));
        assert.deepStrictEqual(marked, { ping: 'network.ping', wake: 'network.wake' });
        for (const standard of Object.values(marked)) {
            assert.ok(HELP.includes(standard), standard);
        }
    });

    it('keeps the lines short', function () {
        for (const line of HELP.split('\n')) {
            assert.ok(line.length <= 120, line);
        }
    });
});
