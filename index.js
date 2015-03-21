var net = require('net');
var debug = require('debug')('tunnel-ssh');
var _ = require('lodash');
var Connection = require('ssh2');

function createConfig(userConfig) {
    var env = process.env;

    var config = _.defaults(userConfig || {}, {
        username: env.TUNNELSSH_USER || env.USER || env.USERNAME,
        port: 22,
        srcPort: 0,
        srcHost: 'localhost',
        dstPort: null,
        dstHost: 'localhost',
        localHost: 'localhost'

    });
    if (!config.password && !config.privateKey) {
        config.agent = config.agent || process.env.SSH_AUTH_SOCK;
    }

    if (!config.dstPort || !config.dstHost || !config.host) {
        throw new Error('invalid configuration.')
    }

    if (!config.localPort) {
        config.localPort = config.dstPort;
    }

    return config;
}

function bindSSHConnection(config, server, netConnection) {

    var sshConnection = new Connection();
    sshConnection.on("error",function(err){
        if (config.keepAlive) {
            console.log(err.message);
            console.log("Trying to reconnect after 5s...");
            setTimeout(function(){
                sshConnection.connect(config);
            },5000);
        } else {
            netConnection.end();
        }
    });
    sshConnection.on('ready', function () {
        //sshConnection._sock.unref();
        //server.unref();
        server.emit('sshConnection', sshConnection, netConnection, server);
        sshConnection.forwardOut(
            config.srcHost,
            config.srcPort,
            config.dstHost,
            config.dstPort, function (err, sshStream) {
                if (err) {
                    if (config.keepAlive) {
                        console.error("SSH Stream threw error:",err);
                        console.log("Trying to reconnect after 5s...");
                        setTimeout(function(){
                            sshConnection.connect(config);
                        },5000);
                        return;
                    } else {
                        throw err;
                    }
                }
                sshStream.once('close', function () {
                    sshConnection.end();
                    if (!config.keepAlive) {
                        netConnection.end();
                        server.close();
                    }
                });
                //if (config.keepAlive) {
                //    sshStream.on('finish', function () {
                //        console.log("SSH stream finished. Trying to reconnect after 5s...");
                //        setTimeout(function(){
                //            sshConnection.connect(config);
                //        },5000);
                //    });
                //}
                server.emit('sshStream', sshStream, sshConnection, netConnection, server);
                netConnection.pipe(sshStream).pipe(netConnection);
            });
    });
    return sshConnection;
}

function tunnel(configArgs, callback) {
    var config = createConfig(configArgs);
    var server = net.createServer(function (netConnection) {
        server.emit('netConnection', netConnection, server);
        bindSSHConnection(config, server, netConnection).connect(config)
    });
    server.listen(config.localPort, config.localHost, callback);
    return server;
}

module.exports = tunnel;
