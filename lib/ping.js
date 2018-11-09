var cp  = require('child_process');
var p   = require('os').platform().toLowerCase();

function probe(addr, config, callback) {
    config = config || {};

    var ls  = null;
    var log = config.log || console.log;
    var outstring = '';

    config = {
        numeric:  config.numeric  === undefined ? true : config.numeric,
        timeout:  parseInt(config.timeout  === undefined ? 2    : config.timeout, 10),
        minReply: parseInt(config.minReply === undefined ? 1    : config.minReply, 10),
        extra:    config.extra || []
    };

    var args    = [];
    var xfamily = ['linux', 'sunos', 'unix'];
    var regex   = /=.*[<|=]([0-9]*).*TTL|ttl..*=([0-9\.]*)/;

    if (xfamily.indexOf(p) !== -1) {
        //linux
        args = [];
        if (config.numeric  !== false) args.push('-n');

        if (config.timeout  !== false) args.push('-w', config.timeout);

        if (config.minReply !== false) args.push('-c', config.minReply);

        if (config.extra    !== false) args = args.concat(config.extra);

        args.push(addr);
        log('System command: /bin/ping ' + args.join(' '));
        ls = cp.spawn('/bin/ping', args);
    } else if (p.match(/^win/)) {
        //windows
        args = [];
        if (config.minReply !== false) args.push('-n ' + config.minReply);

        if (config.timeout  !== false) args.push('-w ' + config.timeout * 1000);

        if (config.extra    !== false) args = args.concat(config.extra);

        args.push(addr);

        var allArgs = [
            '/s', // leave quotes as they are
            '/c', // run and exit
            // !!! order of c and s is important - c must come last!!!
            '"', // enforce starting quote
            process.env.SystemRoot + '\\system32\\ping.exe' // command itself. Notice that you'll have to pass it quoted if it contains spaces
        ].concat(args)
            .concat('"'); // enforce closing quote

        log('System command: ' + (process.env.comspec || 'cmd.exe') + ' ' + allArgs.join(' '));
        // switch the command to cmd shell instead of the original command
        ls = cp.spawn(process.env.comspec || 'cmd.exe', allArgs, {windowsVerbatimArguments: true});
    } else if (p === 'darwin' || p === 'freebsd') {
        //mac osx or freebsd
        args = [];
        if (config.numeric  !== false) args.push('-n');

        if (config.timeout  !== false) args.push('-t ' + config.timeout);

        if (config.minReply !== false) args.push('-c ' + config.minReply);

        if (config.extra    !== false) args = args.concat(config.extra);

        args.push(addr);
        log('System command: /sbin/ping ' + args.join(' '));
        ls = cp.spawn('/sbin/ping', args);
    } else {
        if (callback) callback('Your platform "' + p + '" is not supported');
    }

    ls.on('error', function (e) {
        if (callback) {
            callback(new Error(
                'ping.probe: there was an error while executing the ping program. check the path or permissions...'));
        }
        callback = null;
    });
    ls.stderr.on('data', function (data) {
        log('STDERR: '+ data);
    });

    ls.stdout.on('data', function (data) {
        outstring += String(data);
    });

    ls.on('exit', function (code) {
        var lines  = outstring.split('\n');
        var ms     = null;
        var result = 1;

        for (var t = 0; t < lines.length; t++) {
            var m = regex.exec(lines[t]) || '';
            if (m !== '') {
                ms = m[1] || m[2];
                result = 0;
                break;
            }
        }

        if (p.match(/^win/)) {
            result = (ms !== null);
        } else {
            result = !code;
        }
        if (callback) {
            callback(null, {
                host:  addr,
                alive: result,
                ms:    ms
            });
        }
        callback = null;
    });
}

exports.probe = probe;
