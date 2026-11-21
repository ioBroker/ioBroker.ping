const assert = require('node:assert');
const EventEmitter = require('node:events');

/** Loads build/main.js with a fake adapter-core and returns an instance whose ping is stubbed */
function createAdapter() {
    class Adapter extends EventEmitter {
        constructor(options) {
            super();
            this.namespace = `${options.name}.0`;
            this.config = {};
            this.log = { debug() {}, info() {}, warn() {}, error() {} };
        }
    }
    const fake = { Adapter, I18n: { translate: text => text, getTranslatedObject: text => ({ en: text }) } };
    const corePath = require.resolve('@iobroker/adapter-core');
    const mainPath = require.resolve('../build/main.js');
    const saved = require.cache[corePath];
    require.cache[corePath] = { id: corePath, filename: corePath, loaded: true, exports: fake };
    delete require.cache[mainPath];
    let adapter;
    try {
        adapter = require(mainPath)({});
    } finally {
        delete require.cache[mainPath];
        if (saved) {
            require.cache[corePath] = saved;
        } else {
            delete require.cache[corePath];
        }
    }
    adapter.pinged = [];
    adapter.probeWithFallback = async host => {
        adapter.pinged.push(host);
        return { err: null, result: { host, alive: true, ms: 3 } };
    };
    return adapter;
}

/** Sends a message to processMessage and returns the answer as the caller gets it, after JSON (undefined = none) */
async function send(adapter, command, message, callback = {}) {
    let answer;
    adapter.sendTo = (_to, _command, result) => (answer = result);
    await adapter.processMessage({ command, message, from: 'system.adapter.javascript.0', callback });
    return answer === undefined ? undefined : JSON.parse(JSON.stringify(answer));
}

describe('Standard commands of the shared catalog', function () {
    it('network.ping: ping takes {host} as well as the address as a text', async function () {
        const adapter = createAdapter();
        assert.deepStrictEqual(await send(adapter, 'ping', { host: '192.168.1.1' }), {
            result: { host: '192.168.1.1', alive: true, ms: 3 },
        });
        assert.deepStrictEqual(await send(adapter, 'ping', '192.168.1.2'), {
            result: { host: '192.168.1.2', alive: true, ms: 3 },
        });
        assert.deepStrictEqual(adapter.pinged, ['192.168.1.1', '192.168.1.2']);
    });

    it('network.ping: without an address it answers BAD_REQUEST and pings nothing', async function () {
        const adapter = createAdapter();
        assert.deepStrictEqual(await send(adapter, 'ping', {}), {
            error: 'No address given',
            reason: 'BAD_REQUEST',
        });
        assert.deepStrictEqual(await send(adapter, 'ping', undefined), {
            error: 'No address given',
            reason: 'BAD_REQUEST',
        });
        assert.deepStrictEqual(adapter.pinged, []);
    });

    it('network.ping: an error of ping arrives as its text', async function () {
        const adapter = createAdapter();
        adapter.probeWithFallback = async () => ({ err: new Error('no ping program') });
        assert.deepStrictEqual(await send(adapter, 'ping', { host: 'x' }), { error: 'no ping program' });
    });

    it('network.wake: wake {mac, ip} sends the magic packet and answers {ok, mac, ip}', async function () {
        const adapter = createAdapter();
        // sent to port 9 of this host: only the answer is checked here, the packet by testWakeOnLan.js
        assert.deepStrictEqual(await send(adapter, 'wake', { mac: '01-23-45-67-89-ab', ip: '127.0.0.1' }), {
            ok: true,
            mac: '01-23-45-67-89-ab',
            ip: '127.0.0.1',
        });
    });

    it('network.wake: an invalid MAC answers BAD_REQUEST, wakeOnLan keeps its old answers', async function () {
        const adapter = createAdapter();
        assert.deepStrictEqual(await send(adapter, 'wake', { mac: 'nope' }), {
            error: 'Invalid MAC address: nope',
            reason: 'BAD_REQUEST',
        });
        assert.deepStrictEqual(await send(adapter, 'wakeOnLan', 'nope'), { error: 'Invalid MAC address: nope' });
        assert.deepStrictEqual(await send(adapter, 'wakeOnLan', { mac: '0123456789AB', ip: '127.0.0.1' }), {
            result: { mac: '0123456789AB', ip: '127.0.0.1' },
        });
    });

    it('network.wake: runs also without a callback and answers nothing then', async function () {
        const adapter = createAdapter();
        let answered = false;
        adapter.sendTo = () => (answered = true);
        await adapter.processMessage({ command: 'wake', message: { mac: '0123456789AB', ip: '127.0.0.1' } });
        assert.strictEqual(answered, false);
    });
});
